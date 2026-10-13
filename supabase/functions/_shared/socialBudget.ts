// Post-volume budget for tiers that sell a fixed number of posts per month.
// Only transformation is capped here: it is sold as 20 posts/month and the
// scheduler's candidate pattern is built to cover that. Other tiers keep the
// original uncapped behaviour (see the note in auto-schedule-content).
import { tierPolicy } from "./tierPolicy.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const BILLING_MONTH_DAYS = 30;
const ROLLING_WINDOW_DAYS = 28;

export function isBudgetCapped(tier: string | null | undefined): boolean {
  return (tier ?? "").toLowerCase().trim() === "transformation";
}

/** Posts a capped tier should have in a window; null = uncapped. A cycle's budget scales with its length. */
export function windowBudget(tier: string | null | undefined, cycle: { start: Date; end: Date } | null): number | null {
  if (!isBudgetCapped(tier)) return null;
  const days = cycle ? (cycle.end.getTime() - cycle.start.getTime()) / DAY_MS : ROLLING_WINDOW_DAYS;
  return Math.round((tierPolicy(tier).social.postsPerMonth * days) / BILLING_MONTH_DAYS);
}

/** Keeps the earliest rows that still fit once `alreadyScheduled` slots in the window are counted. */
export function trimToBudget<T extends { scheduled_for: string }>(
  rows: T[],
  budget: number | null,
  alreadyScheduled: number,
): T[] {
  if (budget === null) return rows;
  const room = Math.max(0, budget - alreadyScheduled);
  return [...rows].sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)).slice(0, room);
}
