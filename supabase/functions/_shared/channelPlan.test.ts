import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { allocateCounts, placeSlots, platformHour, remainingSlots, validateChannelPlan, windowQuota } from "./channelPlan.ts";

const d = (s: string) => new Date(s);
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const day = (s: { at: Date }) => s.at.toISOString().slice(0, 10);
const WS = d("2026-11-04T00:00:00Z");
const WE = d("2026-12-04T00:00:00Z");

Deno.test("windowQuota: a 30-day cycle gets the full monthly quota, others scale", () => {
  assertEquals(windowQuota(12, d("2026-11-01T00:00:00Z"), d("2026-12-01T00:00:00Z")), 12);
  assertEquals(windowQuota(20, d("2026-10-01T00:00:00Z"), d("2026-10-16T00:00:00Z")), 10);
  assertEquals(windowQuota(4, d("2026-11-01T00:00:00Z"), d("2026-11-01T00:00:00Z")), 0);
});

Deno.test("allocateCounts: even split of an even quota", () => {
  assertEquals(allocateCounts({ facebook: 50, instagram: 50 }, 12), { facebook: 6, instagram: 6 });
});

Deno.test("allocateCounts: odd quota gives the extra post to the heavier weight", () => {
  assertEquals(allocateCounts({ facebook: 60, instagram: 40 }, 5), { facebook: 3, instagram: 2 });
  assertEquals(allocateCounts({ facebook: 40, instagram: 60 }, 5), { facebook: 2, instagram: 3 });
});

Deno.test("allocateCounts: tied weights break deterministically by name", () => {
  assertEquals(allocateCounts({ instagram: 50, facebook: 50 }, 5), { facebook: 3, instagram: 2 });
});

Deno.test("allocateCounts: counts always sum to the total", () => {
  for (const total of [1, 3, 4, 7, 12, 20, 25]) {
    assertEquals(sum(allocateCounts({ facebook: 34, instagram: 33, linkedin: 33 }, total)), total);
  }
});

Deno.test("allocateCounts: every weighted channel gets at least one when quota allows", () => {
  assertEquals(allocateCounts({ facebook: 90, instagram: 5, linkedin: 5 }, 4), { facebook: 2, instagram: 1, linkedin: 1 });
});

Deno.test("allocateCounts: zero-weight channels and empty input get nothing", () => {
  assertEquals(allocateCounts({ facebook: 100, instagram: 0 }, 4), { facebook: 4 });
  assertEquals(allocateCounts({}, 4), {});
  assertEquals(allocateCounts({ facebook: 100 }, 0), {});
});

Deno.test("allocateCounts: weights equal to counts reproduce exactly those counts", () => {
  assertEquals(allocateCounts({ facebook: 7, instagram: 5 }, 12), { facebook: 7, instagram: 5 });
});

Deno.test("placeSlots: two channels never share a day when the window has room", () => {
  const out = placeSlots({ remaining: { facebook: 6, instagram: 6 }, windowStart: WS, windowEnd: WE, takenDays: {} });
  assertEquals(out.length, 12);
  assertEquals(new Set(out.map(day)).size, 12);
});

Deno.test("placeSlots: channels alternate rather than clump", () => {
  const out = placeSlots({ remaining: { facebook: 6, instagram: 6 }, windowStart: WS, windowEnd: WE, takenDays: {} });
  const seq = out.map((s) => s.platform);
  for (let i = 1; i < seq.length; i++) assertEquals(seq[i] !== seq[i - 1], true);
});

Deno.test("placeSlots: an uneven split interleaves in proportion (8/4)", () => {
  const out = placeSlots({ remaining: { facebook: 8, instagram: 4 }, windowStart: WS, windowEnd: WE, takenDays: {} });
  const seq = out.map((s) => s.platform);
  assertEquals(seq.filter((p) => p === "facebook").length, 8);
  // never three of the same channel in a row
  for (let i = 2; i < seq.length; i++) assertEquals(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]), true);
});

Deno.test("placeSlots: weekdays only, at each channel's staggered hour", () => {
  const out = placeSlots({ remaining: { facebook: 5, instagram: 5, linkedin: 5 }, windowStart: WS, windowEnd: WE, takenDays: {} });
  for (const s of out) {
    assertEquals(s.at.getUTCDay() >= 1 && s.at.getUTCDay() <= 5, true);
    assertEquals(s.at.getUTCHours(), platformHour(s.platform));
  }
});

Deno.test("placeSlots: spreads across the whole window, not bunched at the start", () => {
  const out = placeSlots({ remaining: { facebook: 3, instagram: 3 }, windowStart: WS, windowEnd: WE, takenDays: {} });
  assertEquals(out[0].at < d("2026-11-12T00:00:00Z"), true);
  assertEquals(out[out.length - 1].at > d("2026-11-24T00:00:00Z"), true);
});

Deno.test("placeSlots: avoids days another channel already posted on", () => {
  const out = placeSlots({
    remaining: { facebook: 2 },
    windowStart: d("2026-11-16T00:00:00Z"),
    windowEnd: d("2026-11-21T00:00:00Z"),
    takenDays: { instagram: new Set(["2026-11-17", "2026-11-18"]) },
  });
  for (const s of out) assertEquals(["2026-11-17", "2026-11-18"].includes(day(s)), false);
  assertEquals(out.length, 2);
});

Deno.test("placeSlots: when weekdays run out, channels may share a day but one channel never doubles up", () => {
  // 20 posts across 3 channels in a window with fewer than 20 weekdays.
  const out = placeSlots({
    remaining: { facebook: 8, instagram: 6, linkedin: 6 },
    windowStart: d("2026-11-04T00:00:00Z"),
    windowEnd: d("2026-11-25T00:00:00Z"), // 15 weekdays
    takenDays: {},
  });
  const perChannel: Record<string, Set<string>> = {};
  for (const s of out) {
    const set = (perChannel[s.platform] ??= new Set());
    assertEquals(set.has(day(s)), false);
    set.add(day(s));
  }
});

Deno.test("placeSlots: never places outside the window or overfills it", () => {
  const out = placeSlots({
    remaining: { facebook: 6 },
    windowStart: d("2026-11-04T00:00:00Z"),
    windowEnd: d("2026-11-07T00:00:00Z"),
    takenDays: {},
  });
  assertEquals(out.length <= 3, true);
  for (const s of out) assertEquals(s.at >= d("2026-11-04T00:00:00Z") && s.at < d("2026-11-07T00:00:00Z"), true);
});

Deno.test("placeSlots: nothing remaining places nothing", () => {
  assertEquals(placeSlots({ remaining: { facebook: 0 }, windowStart: WS, windowEnd: WE, takenDays: {} }), []);
});

Deno.test("validateChannelPlan: even mode stores equal weights", () => {
  const r = validateChannelPlan(
    { mode: "even", channels: [{ platform: "facebook", active: true }, { platform: "instagram", active: true }, { platform: "linkedin", active: false }] },
    { connected: new Set(["facebook", "instagram", "linkedin"]), quota: 12 },
  );
  assertEquals(r, { ok: true, weights: { facebook: 1, instagram: 1 } });
});

Deno.test("validateChannelPlan: custom counts must sum to the quota", () => {
  const ctx = { connected: new Set(["facebook", "instagram"]), quota: 12 };
  const ok = validateChannelPlan({ mode: "custom", channels: [{ platform: "facebook", active: true, count: 7 }, { platform: "instagram", active: true, count: 5 }] }, ctx);
  assertEquals(ok, { ok: true, weights: { facebook: 7, instagram: 5 } });
  const bad = validateChannelPlan({ mode: "custom", channels: [{ platform: "facebook", active: true, count: 7 }, { platform: "instagram", active: true, count: 4 }] }, ctx);
  assertEquals(bad.ok, false);
});

Deno.test("validateChannelPlan: rejects unconnected, empty, zero-count and over-quota plans", () => {
  const ctx = { connected: new Set(["facebook", "instagram"]), quota: 4 };
  assertEquals(validateChannelPlan({ mode: "even", channels: [{ platform: "linkedin", active: true }] }, ctx).ok, false);
  assertEquals(validateChannelPlan({ mode: "even", channels: [{ platform: "facebook", active: false }] }, ctx).ok, false);
  assertEquals(validateChannelPlan({ mode: "custom", channels: [{ platform: "facebook", active: true, count: 4 }, { platform: "instagram", active: true, count: 0 }] }, ctx).ok, false);
  assertEquals(validateChannelPlan({ mode: "even", channels: [{ platform: "facebook", active: true }, { platform: "instagram", active: true }] }, { connected: new Set(["facebook", "instagram"]), quota: 1 }).ok, false);
  assertEquals(validateChannelPlan({ mode: "even", channels: [{ platform: "myspace", active: true }] }, ctx).ok, false);
});

Deno.test("remainingSlots: only the shortfall is placed, around days other channels used", () => {
  const out = remainingSlots({
    counts: { facebook: 3, instagram: 3 },
    connected: new Set(["facebook", "instagram"]),
    existing: [
      { platform: "facebook", day: "2026-11-05" },
      { platform: "facebook", day: "2026-11-12" },
      { platform: "instagram", day: "2026-11-06" },
    ],
    rangeStart: WS, rangeEnd: WE, todayStart: WS,
  });
  assertEquals(out.filter((s) => s.platform === "facebook").length, 1);
  assertEquals(out.filter((s) => s.platform === "instagram").length, 2);
  for (const s of out) assertEquals(["2026-11-05", "2026-11-12", "2026-11-06"].includes(day(s)), false);
});

Deno.test("remainingSlots: unconnected channels are skipped, not redistributed", () => {
  const out = remainingSlots({
    counts: { facebook: 3, instagram: 3 },
    connected: new Set(["facebook"]),
    existing: [], rangeStart: WS, rangeEnd: WE, todayStart: WS,
  });
  assertEquals(out.length, 3);
  assertEquals(out.every((s) => s.platform === "facebook"), true);
});

Deno.test("remainingSlots: never schedules before today", () => {
  const today = d("2026-11-20T00:00:00Z");
  const out = remainingSlots({
    counts: { facebook: 3, instagram: 3 },
    connected: new Set(["facebook", "instagram"]),
    existing: [], rangeStart: WS, rangeEnd: WE, todayStart: today,
  });
  assertEquals(out.length > 0, true);
  for (const s of out) assertEquals(s.at >= today, true);
});
