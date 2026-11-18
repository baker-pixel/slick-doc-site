// The fit gate for outbound prospects. A discovered company is scored against
// the client's ideal customer profile; only those at or above the client's
// threshold are worth spending an email lookup on and showing to the client.
// Everything below is dropped (its contact data deleted) and remembered only as
// a bare domain so discovery doesn't keep re-finding it.

export const DEFAULT_MIN_FIT = 60;
/** Scoring can answer "can't tell" (thin or unreadable site). Retry this many times, then give up on it. */
export const MAX_UNKNOWN_ATTEMPTS = 2;
/** Discovery ignores "already judged" memories older than this: the company or the ICP may have changed. */
export const SEEN_MEMORY_DAYS = 90;

/** Same normalisation discovery uses to dedupe, so a ledger hit means the same company. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Per-client threshold (outreach_settings.min_fit, 1-100); everyone else gets 60. */
export function minFitFor(outreachSettings: unknown): number {
  const v = (outreachSettings as { min_fit?: unknown } | null)?.min_fit;
  return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 100 ? Math.round(v) : DEFAULT_MIN_FIT;
}

export interface GateCandidate {
  status: string;
  approved_at: string | null;
  source: string | null;
  campaign_id: string | null;
  submission_id: string | null;
}

/**
 * Only machine-discovered, still-unreviewed outbound prospects may be dropped
 * automatically. Anything a person approved, anything already in outreach or
 * replied/unsubscribed, a campaign's own contact list, and inbound leads are
 * never touched.
 */
export function isDroppable(p: GateCandidate): boolean {
  return p.status === "discovered" && !p.approved_at && p.source === "outbound" && !p.campaign_id && !p.submission_id;
}

export type GateVerdict = "keep" | "drop" | "retry" | "drop_unscorable";

/**
 * @param fit      the score, or null when scoring could not tell
 * @param attempts how many times scoring has already come back unknown
 */
export function gateVerdict(fit: number | null, attempts: number, minFit: number): GateVerdict {
  if (fit === null) return attempts + 1 >= MAX_UNKNOWN_ATTEMPTS ? "drop_unscorable" : "retry";
  return fit >= minFit ? "keep" : "drop";
}
