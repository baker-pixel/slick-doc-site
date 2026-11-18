// Pure helpers for prospect-outreach email sending, kept free of I/O so they
// can be unit tested (process-email-queue itself starts a server on import).

export type GateDecision =
  | { action: "send" }
  | { action: "hold"; reason: string }
  | { action: "cancel"; reason: string };

// paused/pending/discovered prospects keep their queued steps (they resume
// when the prospect does); every other non-nurture status is terminal.
const HOLD_STATUSES = new Set(["paused", "pending", "discovered"]);

/**
 * Decides whether a queued outreach step may go out right now, from the
 * prospect's LIVE status. Steps are queued at enrollment, so without this
 * gate a reply / pause / rejection / opt-out after enrollment did nothing.
 */
export function decideProspectGate(
  prospect: { status: string; drip_step: number | null } | undefined,
  stepNumber: number | null,
): GateDecision {
  if (!prospect) return { action: "cancel", reason: "prospect no longer exists" };
  if (HOLD_STATUSES.has(prospect.status)) return { action: "hold", reason: `prospect_${prospect.status}` };
  if (prospect.status !== "nurture") return { action: "cancel", reason: `prospect status is ${prospect.status}` };
  if (stepNumber !== null && stepNumber <= (prospect.drip_step ?? 0)) {
    return { action: "cancel", reason: `step ${stepNumber} already sent or superseded` };
  }
  return { action: "send" };
}

/**
 * Adds the unsubscribe token to /email-preferences links that lack one. The
 * preferences page rejects a tokenless link, and older queued drip bodies
 * were written that way.
 */
export function repairPreferencesLinks(html: string, email: string): string {
  const token = btoa(email);
  return html.replace(
    /href="(https?:\/\/[^"]*\/email-preferences\?email=[^"&]*)"/g,
    (_m, url) => `href="${url}&token=${token}"`,
  );
}
