// Business-hours send window for cold outreach.
//
// Now that approval is automatic and step 1 is queued immediately, nothing
// stopped an email going out at 3am on a Sunday (the queue sends whatever is
// due). Cold email lands better, and looks less like a bot, when it arrives on
// a weekday during the working day. Prospects carry a city but no timezone, so
// this uses one window that is working hours across US timezones:
// Mon-Fri 14:00-20:00 UTC (10am-4pm Eastern, 7am-1pm Pacific).
//
// A time inside the window is left alone. A time outside it moves to the next
// window opening, plus a deterministic spread (seeded by the lead + step) over
// the first two hours so a batch approved overnight does not fire in one
// burst at 14:00 sharp.

export const WINDOW_START_HOUR_UTC = 14;
export const WINDOW_END_HOUR_UTC = 20;
export const SPREAD_MINUTES = 120;

function isWeekday(d: Date): boolean {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}

function windowStartOn(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), WINDOW_START_HOUR_UTC));
}

export function isInSendWindow(d: Date): boolean {
  if (!isWeekday(d)) return false;
  const start = windowStartOn(d).getTime();
  return d.getTime() >= start && d.getTime() < start + (WINDOW_END_HOUR_UTC - WINDOW_START_HOUR_UTC) * 3_600_000;
}

/** Small stable hash -> 0..1, so the same lead+step always gets the same spread. */
function unit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/** First instant at or after `d` that is inside a send window (no spread). */
export function nextWindowOpen(d: Date): Date {
  if (isInSendWindow(d)) return d;
  let day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Today's window may still be ahead of us (before 14:00 on a weekday).
  if (isWeekday(day) && d.getTime() < windowStartOn(day).getTime()) return windowStartOn(day);
  do {
    day = new Date(day.getTime() + 24 * 3_600_000);
  } while (!isWeekday(day));
  return windowStartOn(day);
}

/**
 * Snap a desired send time into the window. Inside it: unchanged. Outside it:
 * the next opening plus a 0-120 minute spread derived from `seed`.
 */
export function snapToSendWindow(desired: Date, seed: string): Date {
  if (isInSendWindow(desired)) return desired;
  const open = nextWindowOpen(desired);
  return new Date(open.getTime() + Math.floor(unit(seed) * SPREAD_MINUTES) * 60_000);
}
