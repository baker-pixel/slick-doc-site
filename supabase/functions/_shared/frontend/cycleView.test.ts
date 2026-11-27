// Tests for the pure rules in src/lib/cycleView.ts. They live here because this is where CI runs Deno tests.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { compare, cycleDay, fmtRate, goalProgress, goalScale, metricLabel, perDay, sampleLabel, type Goal } from "../../../../src/lib/cycleView.ts";

Deno.test("compare: per day, only with enough days and events, and not inside chance variation", () => {
  // 150 events in 30 days against 100: 50% more per day, well past chance (noise is 20% at n=100).
  assertEquals(compare({ total: 150, days: 30 }, { total: 100, days: 30 }), { state: "up", pct: 50 });
  assertEquals(compare({ total: 40, days: 30 }, { total: 100, days: 30 }), { state: "down", pct: -60 });
  // 10 in 7 days against 10 in 8 days is +14% per day, but with 10 events chance alone moves it ~63%: "about the same".
  assertEquals(compare({ total: 10, days: 7 }, { total: 10, days: 8 }), { state: "flat", pct: 14 });
  assertEquals(compare({ total: 10, days: 10 }, { total: 10, days: 10 }), { state: "flat", pct: 0 });
  // A shorter cycle with the same rate is not a drop: 4 in 8 days is 0.5 a day, 15 in 30 is 0.5 a day.
  assertEquals(compare({ total: 40, days: 8 }, { total: 150, days: 30 }), { state: "flat", pct: 0 });
  assertEquals(compare({ total: 30, days: 3 }, { total: 30, days: 30 }), { state: "too_few" }); // a 3-day window
  assertEquals(compare({ total: 2, days: 30 }, { total: 2, days: 30 }), { state: "too_few" }); // 4 events
  assertEquals(compare({ total: 9, days: 30 }, { total: 0, days: 30 }), { state: "too_few" }); // nothing to divide by
  assertEquals(compare({ total: 9, days: 30 }, null), { state: "too_few" });
  assertEquals(compare({ total: null, days: 30 }, { total: 9, days: 30 }), { state: "too_few" });
});

Deno.test("perDay and fmtRate", () => {
  assertEquals(perDay(59, 2), 29.5);
  assertEquals(perDay(null, 8), null);
  assertEquals(perDay(5, 0), null);
  assertEquals([fmtRate(21.25), fmtRate(0.375), fmtRate(7.38), fmtRate(null)], ["21", "0.4", "7.4", "—"]);
});

Deno.test("sampleLabel: small samples are called early data", () => {
  assertEquals(sampleLabel(3, "post"), { text: "Early data · 3 posts", thin: true });
  assertEquals(sampleLabel(1, "post"), { text: "Early data · 1 post", thin: true });
  assertEquals(sampleLabel(16, "post"), { text: "16 posts", thin: false });
});

const g = (o: Partial<Goal>): Goal => ({ engine: "seo", objective: "o", metric: "seo_score", baseline: 83, target: 90, due: null, current: 75, ...o });

Deno.test("goalProgress: states, and nothing when it cannot be measured", () => {
  assertEquals(goalProgress(g({})), { state: "below_start", moved: -8, toGo: 15 });
  assertEquals(goalProgress(g({ current: 86 })), { state: "progress", moved: 3, toGo: 4 });
  assertEquals(goalProgress(g({ current: 83 })), { state: "unchanged", moved: 0, toGo: 7 });
  assertEquals(goalProgress(g({ current: 91 })), { state: "reached", moved: 8, toGo: 0 });
  assertEquals(goalProgress(g({ current: null })), null);
  assertEquals(goalProgress(g({ baseline: null })), null);
  assertEquals(goalProgress(g({ target: 83 })), null);
  // A goal to lower something (cost per lead 50 -> 30).
  assertEquals(goalProgress(g({ baseline: 50, target: 30, current: 40 })), { state: "progress", moved: 10, toGo: 10 });
  assertEquals(goalProgress(g({ baseline: 50, target: 30, current: 55 })), { state: "below_start", moved: -5, toGo: 25 });
});

Deno.test("goalScale: markers stay inside the track, in order", () => {
  const s = goalScale(83, 75, 90);
  assertEquals(s.now < s.start && s.start < s.target, true);
  assertEquals([s.now, s.start, s.target].every((v) => v > 0 && v < 100), true);
  const flat = goalScale(80, 80, 80);
  assertEquals(Number.isFinite(flat.now), true);
});

Deno.test("metricLabel", () => {
  assertEquals(metricLabel("seo_score"), "SEO score");
  assertEquals(metricLabel("qualified_leads"), "Qualified leads");
});

Deno.test("cycleDay: whole days from 1, null once the cycle is over", () => {
  const start = "2026-11-20T12:00:30Z", end = "2026-12-20T12:00:30Z";
  assertEquals(cycleDay(start, end, new Date("2026-11-27T11:30:00Z")), { day: 7, total: 30, left: 23 });
  assertEquals(cycleDay(start, end, new Date("2026-11-20T12:10:00Z")), { day: 1, total: 30, left: 29 });
  assertEquals(cycleDay(start, end, new Date("2026-12-20T12:00:30Z")), null);
  assertEquals(cycleDay(start, end, new Date("2027-01-05T00:00:00Z")), null);
});
