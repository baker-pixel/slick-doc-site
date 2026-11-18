// Channel plan: split a window's post quota across the channels a client chose
// and place each channel's slots. Pure functions only -- the scheduler and the
// (later) preview endpoint both call these so they cannot drift apart.

const DAY_MS = 24 * 60 * 60 * 1000;
const BILLING_MONTH_DAYS = 30;

/** Staggered posting hour (UTC) so channels never fire in the same minute. */
const PLATFORM_HOUR: Record<string, number> = { facebook: 9, instagram: 12, linkedin: 10, twitter: 14 };

export function platformHour(platform: string): number {
  return PLATFORM_HOUR[platform] ?? 9;
}

/** Posts a window should hold: the tier's monthly quota scaled by window length. */
export function windowQuota(postsPerMonth: number, start: Date, end: Date): number {
  const days = (end.getTime() - start.getTime()) / DAY_MS;
  return Math.max(0, Math.round((postsPerMonth * days) / BILLING_MONTH_DAYS));
}

/**
 * Split `total` posts across channels by weight, largest-remainder so the
 * counts always sum to `total`. Ties go to the heavier weight, then name, so
 * the result is deterministic. When there are at least as many posts as
 * channels, every channel with weight gets at least one.
 */
export function allocateCounts(
  weights: Record<string, number>,
  total: number,
): Record<string, number> {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const counts: Record<string, number> = {};
  if (entries.length === 0 || total <= 0) return counts;

  const sum = entries.reduce((s, [, w]) => s + w, 0);
  const parts = entries.map(([platform, w]) => {
    const exact = (total * w) / sum;
    return { platform, weight: w, floor: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = total - parts.reduce((s, p) => s + p.floor, 0);
  const byRemainder = [...parts].sort((a, b) =>
    b.rem - a.rem || b.weight - a.weight || a.platform.localeCompare(b.platform)
  );
  for (const p of byRemainder) {
    if (left <= 0) break;
    p.floor += 1;
    left -= 1;
  }
  for (const p of parts) counts[p.platform] = p.floor;

  if (total >= parts.length) {
    for (const p of parts) {
      if (counts[p.platform] > 0) continue;
      const donor = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      counts[donor] -= 1;
      counts[p.platform] = 1;
    }
  }
  return counts;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWeekday(d: Date): boolean {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}

/** Nearest free weekday to `target` inside [start, end): forward first, then backward. */
function nearestFreeWeekday(target: Date, start: Date, end: Date, taken: Set<string>): Date | null {
  const free = (d: Date) => isWeekday(d) && !taken.has(dayKey(d)) && d >= start && d < end;
  for (let i = 0; i < 14; i++) {
    const d = new Date(target.getTime() + i * DAY_MS);
    if (free(d)) return d;
  }
  for (let i = 1; i < 14; i++) {
    const d = new Date(target.getTime() - i * DAY_MS);
    if (free(d)) return d;
  }
  return null;
}

export type PlacedSlot = { platform: string; at: Date };

/**
 * Smooth weighted round-robin: an order in which channels take turns in
 * proportion to their counts (6/6 -> F,I,F,I...; 8/4 -> F,F,I,F,F,I...),
 * so no channel is ever clumped together.
 */
function interleave(remaining: Record<string, number>): string[] {
  const names = Object.keys(remaining).filter((p) => remaining[p] > 0).sort();
  const total = names.reduce((s, p) => s + remaining[p], 0);
  const current: Record<string, number> = {};
  for (const p of names) current[p] = 0;
  const order: string[] = [];
  for (let i = 0; i < total; i++) {
    for (const p of names) current[p] += remaining[p];
    let pick = names[0];
    for (const p of names) if (current[p] > current[pick]) pick = p;
    current[pick] -= total;
    order.push(pick);
  }
  return order;
}

/**
 * Place every channel's remaining posts in one pass so channels alternate
 * days instead of landing together. The window's slots are spread evenly,
 * channels take turns in proportion to their counts, and each slot snaps to
 * the nearest weekday that has NO post from any channel. Only when the window
 * has no such day left (more posts than weekdays) does a post share a day, and
 * then only with a different channel -- the same channel never posts twice in
 * a day. `takenDays` holds each channel's existing post days (any channel's
 * post blocks a day for the others); it is not mutated.
 * Returns fewer slots than requested only when the window is genuinely full.
 */
export function placeSlots(opts: {
  remaining: Record<string, number>;
  windowStart: Date;
  windowEnd: Date;
  takenDays: Record<string, Set<string>>;
}): PlacedSlot[] {
  const order = interleave(opts.remaining);
  const span = opts.windowEnd.getTime() - opts.windowStart.getTime();
  if (order.length === 0 || span <= 0) return [];

  const allDays = new Set<string>();
  const channelDays: Record<string, Set<string>> = {};
  for (const [p, days] of Object.entries(opts.takenDays)) {
    channelDays[p] = new Set(days);
    for (const d of days) allDays.add(d);
  }

  const out: PlacedSlot[] = [];
  order.forEach((platform, i) => {
    const hour = platformHour(platform);
    const target = new Date(opts.windowStart.getTime() + ((i + 0.5) * span) / order.length);
    target.setUTCHours(hour, 0, 0, 0);
    const own = (channelDays[platform] ??= new Set());
    const day = nearestFreeWeekday(target, opts.windowStart, opts.windowEnd, allDays) ??
      nearestFreeWeekday(target, opts.windowStart, opts.windowEnd, own);
    if (!day) return;
    day.setUTCHours(hour, 0, 0, 0);
    if (day < opts.windowStart) return; // earlier today than "now"
    allDays.add(dayKey(day));
    own.add(dayKey(day));
    out.push({ platform, at: day });
  });
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * What still has to be scheduled in a window: each connected channel's count
 * minus the posts it already has, placed by placeSlots. Used verbatim by the
 * scheduler and by the portal preview, so the preview shows exactly what the
 * scheduler will create. `existing` is every post already in the window, on any
 * channel (failed ones included -- a failing channel must not respawn slots).
 * Channels that are not connected are skipped, never redistributed.
 */
export function remainingSlots(opts: {
  counts: Record<string, number>;
  connected: Set<string>;
  existing: { platform: string; day: string }[];
  rangeStart: Date;
  rangeEnd: Date;
  todayStart: Date;
  /**
   * Earliest moment a new slot may be due. Slots are placeholders: the copy is
   * written by the daily fill run and then needs the client's approval, so a
   * slot due in a few hours (or already in the past today) can never go out.
   * Callers pass now + MIN_LEAD_HOURS; omitted, only "not before today" applies.
   */
  notBefore?: Date;
}): PlacedSlot[] {
  const have: Record<string, number> = {};
  const takenDays: Record<string, Set<string>> = {};
  for (const e of opts.existing) {
    have[e.platform] = (have[e.platform] ?? 0) + 1;
    (takenDays[e.platform] ??= new Set()).add(e.day);
  }
  const remaining: Record<string, number> = {};
  for (const [platform, count] of Object.entries(opts.counts)) {
    if (!opts.connected.has(platform)) continue;
    const short = count - (have[platform] ?? 0);
    if (short > 0) remaining[platform] = short;
  }
  const windowStart = new Date(
    Math.max(opts.rangeStart.getTime(), opts.todayStart.getTime(), opts.notBefore?.getTime() ?? 0),
  );
  return placeSlots({ remaining, windowStart, windowEnd: opts.rangeEnd, takenDays });
}

/** A new slot must be due at least this long from now (see remainingSlots.notBefore). */
export const MIN_LEAD_HOURS = 24;

export function earliestNewSlot(now: Date = new Date()): Date {
  return new Date(now.getTime() + MIN_LEAD_HOURS * 60 * 60 * 1000);
}

/**
 * How many posts of each channel's share could NOT be placed: wanted minus
 * what the window already holds minus what placeSlots found room for. Only
 * channels with a positive shortfall are returned. Pass only the channels
 * that are meant to be scheduled (connected ones) in `counts`.
 */
export function slotShortfall(opts: {
  counts: Record<string, number>;
  existing: { platform: string; day: string }[];
  placed: PlacedSlot[];
}): Record<string, number> {
  const have: Record<string, number> = {};
  for (const e of opts.existing) have[e.platform] = (have[e.platform] ?? 0) + 1;
  const put: Record<string, number> = {};
  for (const s of opts.placed) put[s.platform] = (put[s.platform] ?? 0) + 1;
  const out: Record<string, number> = {};
  for (const [platform, count] of Object.entries(opts.counts)) {
    const missing = count - (have[platform] ?? 0) - (put[platform] ?? 0);
    if (missing > 0) out[platform] = missing;
  }
  return out;
}

/**
 * When the weekly scheduling cron (auto-schedule-content, Mondays 06:00 UTC)
 * next runs. A saved plan only becomes calendar slots at that run, or when a
 * new cycle starts, so the portal tells the client this date.
 */
export const SCHEDULER_WEEKDAY_UTC = 1;
export const SCHEDULER_HOUR_UTC = 6;

export function nextSchedulerRun(now: Date = new Date()): Date {
  const run = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SCHEDULER_HOUR_UTC));
  run.setUTCDate(run.getUTCDate() + ((SCHEDULER_WEEKDAY_UTC - run.getUTCDay() + 7) % 7));
  if (run.getTime() <= now.getTime()) run.setUTCDate(run.getUTCDate() + 7);
  return run;
}

export const PLAN_PLATFORMS = ["facebook", "instagram", "linkedin", "twitter"] as const;

export type PlanInput = {
  mode: "even" | "custom";
  channels: { platform: string; active: boolean; count?: number }[];
};

export type PlanCheck =
  | { ok: true; weights: Record<string, number> }
  | { ok: false; error: string };

/**
 * Validate a client's channel plan before it is saved. Even mode stores equal
 * weights; custom mode stores the chosen counts as weights, which must add up
 * to the window quota exactly (the "n of N allocated" the client sees), so
 * the first cycle reproduces what they picked and later, longer or shorter
 * cycles scale it proportionally.
 */
export function validateChannelPlan(
  input: PlanInput,
  ctx: { connected: Set<string>; quota: number },
): PlanCheck {
  const seen = new Set<string>();
  for (const c of input.channels) {
    if (!(PLAN_PLATFORMS as readonly string[]).includes(c.platform)) {
      return { ok: false, error: `Unknown channel: ${c.platform}` };
    }
    if (seen.has(c.platform)) return { ok: false, error: `Duplicate channel: ${c.platform}` };
    seen.add(c.platform);
  }
  const active = input.channels.filter((c) => c.active);
  if (active.length === 0) return { ok: false, error: "Turn on at least one channel." };
  for (const c of active) {
    if (!ctx.connected.has(c.platform)) {
      return { ok: false, error: `${c.platform} is not connected yet.` };
    }
  }
  if (active.length > ctx.quota) {
    return { ok: false, error: `Your plan includes ${ctx.quota} posts, so at most ${ctx.quota} channels can be on.` };
  }

  const weights: Record<string, number> = {};
  if (input.mode === "even") {
    for (const c of active) weights[c.platform] = 1;
    return { ok: true, weights };
  }
  let total = 0;
  for (const c of active) {
    const n = c.count;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
      return { ok: false, error: "Every channel that is on needs at least 1 post." };
    }
    weights[c.platform] = n;
    total += n;
  }
  if (total !== ctx.quota) {
    return { ok: false, error: `Allocate exactly ${ctx.quota} posts (currently ${total}).` };
  }
  return { ok: true, weights };
}
