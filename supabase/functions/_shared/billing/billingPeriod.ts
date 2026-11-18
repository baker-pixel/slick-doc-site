// Per-client monthly cadence anchored to the client's own signup date
// instead of the calendar 1st -- matches how Stripe subscription periods
// roll forward from the original signup date, not a shared calendar
// boundary. Two shapes of the same anchor-date math:
//   - dueForRegen: "has it been >= N days since X" (regen/reprobe cadence,
//     same pattern as tierPolicy.seo.reauditCadenceDays)
//   - billingPeriodStart: "start of the current N-day period" (progress %
//     denominators that need a rolling window, not just a yes/no)

const DAY_MS = 24 * 60 * 60 * 1000;

export function dueForRegen(
  lastRun: string | Date | null | undefined,
  cadenceDays: number,
  now: Date = new Date(),
): boolean {
  if (!lastRun) return true;
  const last = typeof lastRun === "string" ? new Date(lastRun) : lastRun;
  return now.getTime() - last.getTime() >= cadenceDays * DAY_MS;
}

export function billingPeriodStart(
  anchor: string | Date,
  now: Date = new Date(),
  periodDays = 30,
): Date {
  const start = typeof anchor === "string" ? new Date(anchor) : anchor;
  const elapsedPeriods = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (periodDays * DAY_MS)));
  return new Date(start.getTime() + elapsedPeriods * periodDays * DAY_MS);
}
