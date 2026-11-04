// Automatic approval of discovered outbound prospects.
//
// Discovery used to park every lead in "discovered" until an admin approved it
// by hand, so outreach only moved when someone remembered to click (112 leads
// were waiting, none approved). Nothing here lowers the quality bar, it just
// replaces the person with the same checks the person was doing:
//   - the lead was scored against the client's ICP and cleared the client's
//     minimum fit (prospectGate.ts; below-threshold leads are already deleted),
//   - the website scan finished (so the email can use real context),
//   - Apollo verified a work email,
//   - the client can actually send: active, not paused for billing, plan has
//     prospecting, own SMTP mailbox connected,
//   - approvals per client per day are capped at the plan's discovery batch so
//     a backlog drains at the same rate it was created and the send cap
//     (tierPolicy dailySendCap) is never the thing that overflows.
// Everything run-prospect-drip already enforces at send time (unsubscribes,
// bounces, existing clients, caps, the live prospect gate) still applies after
// approval, so an auto-approved lead can still be stopped.
//
// A client can switch this off with outreach_settings.auto_approve = false, in
// which case leads wait for the manual review queue exactly as before.

export const AUTO_APPROVED_BY = "auto";

const EMAIL_SHAPE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

export function autoApproveEnabled(outreachSettings: unknown): boolean {
  const v = (outreachSettings as { auto_approve?: unknown } | null)?.auto_approve;
  return v !== false;
}

export interface AutoApproveCandidate {
  id: string;
  client_id: string | null;
  status: string;
  approved_at: string | null;
  source: string | null;
  campaign_id: string | null;
  submission_id: string | null;
  email: string | null;
  icp_fit_score: number | null;
  context_profile: { retry?: boolean } | null;
  created_at?: string | null;
}

export interface AutoApproveClient {
  status: string | null;
  paused_for_billing: boolean | null;
  hasMailbox: boolean;
  prospectingEnabled: boolean;
  outreach_settings: unknown;
  minFit: number;
}

export type AutoApproveReason =
  | "ok"
  | "not_discovered_outbound"
  | "no_valid_email"
  | "not_scored"
  | "below_min_fit"
  | "not_enriched"
  | "client_inactive"
  | "billing_paused"
  | "plan_has_no_prospecting"
  | "no_mailbox"
  | "auto_approve_off";

/** Why a lead may not be auto-approved right now ("ok" when it may). */
export function autoApproveReason(p: AutoApproveCandidate, c: AutoApproveClient): AutoApproveReason {
  if (p.status !== "discovered" || p.approved_at || p.source !== "outbound" || p.campaign_id || p.submission_id) {
    return "not_discovered_outbound";
  }
  if (!autoApproveEnabled(c.outreach_settings)) return "auto_approve_off";
  if (c.status !== "active") return "client_inactive";
  if (c.paused_for_billing) return "billing_paused";
  if (!c.prospectingEnabled) return "plan_has_no_prospecting";
  if (!c.hasMailbox) return "no_mailbox";
  if (!p.email || !EMAIL_SHAPE.test(p.email.trim())) return "no_valid_email";
  if (p.icp_fit_score === null || p.icp_fit_score === undefined) return "not_scored";
  if (p.icp_fit_score < c.minFit) return "below_min_fit";
  // A scan that failed and will be retried has no usable context yet.
  if (!p.context_profile || p.context_profile.retry === true) return "not_enriched";
  return "ok";
}

/**
 * Picks which eligible leads to approve now: best fit first (oldest first on a
 * tie), at most `budget`, never two leads with the same email, and never an
 * email this client already has in the funnel (`alreadyInFunnel`, lowercase).
 */
export function selectForAutoApproval<T extends AutoApproveCandidate>(
  candidates: T[],
  client: AutoApproveClient,
  budget: number,
  alreadyInFunnel: Set<string> = new Set(),
): T[] {
  if (budget <= 0) return [];
  const seen = new Set(alreadyInFunnel);
  const eligible = candidates
    .filter((p) => autoApproveReason(p, client) === "ok")
    .sort((a, b) =>
      (b.icp_fit_score ?? 0) - (a.icp_fit_score ?? 0) ||
      new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
    );
  const out: T[] = [];
  for (const p of eligible) {
    if (out.length >= budget) break;
    const key = p.email!.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
