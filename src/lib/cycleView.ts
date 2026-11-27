// Pure rules behind the cycle-first Analytics page. No imports, so they can be tested on their own.
//
// The page never invents a number and never draws a conclusion from too little. Cycles differ in
// length (a new invoice closes the old cycle early) and website data can start mid-cycle, so every
// comparison is per day, per day WITH data, and only made when both sides carry enough.

export const MIN_DAYS = 5;
export const MIN_EVENTS = 5;

export type Trend =
  | { state: "up" | "down" | "flat"; pct: number }
  | { state: "too_few" };

export interface Side { total: number | null; days: number }

/** A rate per day, or null when it cannot be known. */
export function perDay(total: number | null, days: number): number | null {
  return total === null || days <= 0 ? null : total / days;
}

/** This cycle against the previous one, per day. Small or short data is "too_few"; a change within chance variation is "flat". */
export function compare(cur: Side, prev: Side | null): Trend {
  if (!prev || cur.total === null || prev.total === null) return { state: "too_few" };
  if (cur.days < MIN_DAYS || prev.days < MIN_DAYS) return { state: "too_few" };
  if (cur.total + prev.total < MIN_EVENTS || prev.total === 0) return { state: "too_few" };
  const pct = Math.round(((cur.total / cur.days) / (prev.total / prev.days) - 1) * 100);
  // Counts wobble by chance: roughly 2 / sqrt(n) either way. A change inside that is "about the same",
  // so 10 against 10 never reads as growth just because one cycle was a day shorter.
  const noise = Math.max(15, Math.round(200 / Math.sqrt(Math.max(1, Math.min(cur.total, prev.total)))));
  return { state: Math.abs(pct) < noise ? "flat" : pct > 0 ? "up" : "down", pct };
}

/** "21 a day", "0.4 a day": one decimal under 10, none above. */
export function fmtRate(v: number | null): string {
  if (v === null) return "—";
  return v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}

/** How much a sample can be trusted, in words for the badge. */
export function sampleLabel(n: number, noun: string): { text: string; thin: boolean } {
  const label = `${n} ${noun}${n === 1 ? "" : "s"}`;
  return n < MIN_EVENTS ? { text: `Early data · ${label}`, thin: true } : { text: label, thin: false };
}

export interface Goal { engine: string; objective: string; metric: string; baseline: number | null; target: number | null; due: string | null; current: number | null }

export type GoalState = "reached" | "progress" | "below_start" | "unchanged";
export interface GoalProgress {
  state: GoalState;
  /** Signed distance moved from the start, in the direction of the target. */
  moved: number;
  /** Distance still to go to the target (0 once reached). */
  toGo: number;
}

/** Progress toward a goal, or null when the goal has no measurable current value (nothing is shown then). */
export function goalProgress(g: Goal): GoalProgress | null {
  if (g.current === null || g.baseline === null || g.target === null || g.target === g.baseline) return null;
  const dir = g.target > g.baseline ? 1 : -1;
  const moved = (g.current - g.baseline) * dir;
  const toGo = Math.max(0, (g.target - g.current) * dir);
  if (toGo === 0) return { state: "reached", moved, toGo };
  return { state: moved > 0 ? "progress" : moved < 0 ? "below_start" : "unchanged", moved, toGo };
}

/** Positions (0-100) of start, now and target on one scale, with padding so markers never touch the edge. */
export function goalScale(baseline: number, current: number, target: number): { start: number; now: number; target: number } {
  const lo = Math.min(baseline, current, target);
  const hi = Math.max(baseline, current, target);
  const pad = (hi - lo) * 0.12 || 1;
  const a = lo - pad, b = hi + pad;
  const at = (v: number) => Math.round(((v - a) / (b - a)) * 1000) / 10;
  return { start: at(baseline), now: at(current), target: at(target) };
}

const LABELS: Record<string, string> = { seo_score: "SEO score" };
export function metricLabel(metric: string): string {
  if (LABELS[metric]) return LABELS[metric];
  const t = metric.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "Day 7 of 30" for a cycle still running, null otherwise. Days are counted in whole days, from 1. */
export function cycleDay(start: string, nominalEnd: string, now: Date): { day: number; total: number; left: number } | null {
  const s = new Date(start).getTime(), e = new Date(nominalEnd).getTime(), n = now.getTime();
  if (!(e > s) || n >= e) return null;
  const DAY = 86_400_000;
  const total = Math.round((e - s) / DAY);
  const day = Math.min(total, Math.max(1, Math.floor((n - s) / DAY) + 1));
  return { day, total, left: Math.max(0, total - day) };
}
