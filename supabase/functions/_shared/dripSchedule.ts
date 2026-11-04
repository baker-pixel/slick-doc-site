// Timing rules for the prospect outreach drip, in one place so the enroller
// and its tests agree.
//
// Approval is automatic (see autoApprove.ts: fit-scored, email-verified, within
// the client's daily budget), so there is no review window to wait out: an
// approved lead enters nurture at the next hourly run and step 1 is queued
// straight away (the send-window rule in sendWindow.ts then picks the hour).
// Later steps keep their configured spacing. This used to hold discovery leads
// 48h after approval and then add the sequence's own 2-day step-1 delay, so a
// lead took about four days to get its first email.

/** No post-approval hold any more; kept as an export so callers/tests can state the rule. */
export const DISCOVERY_NURTURE_HOLD_MS = 0;

export interface DripProspectTiming {
  campaign_id?: string | null;
  approved_at: string | null;
  created_at?: string | null;
}

export function isCampaignLead(p: { campaign_id?: string | null }): boolean {
  return !!p.campaign_id;
}

/** Has this approved, pending prospect reached the point it may enter nurture? */
export function readyForNurture(p: DripProspectTiming, now: Date): boolean {
  if (!p.approved_at) return false;
  return new Date(p.approved_at).getTime() + DISCOVERY_NURTURE_HOLD_MS <= now.getTime();
}

/** When the sequence clock starts (step delays are measured from here). */
export function nurtureStartAt(p: DripProspectTiming): Date {
  if (!p.approved_at) return new Date(p.created_at ?? Date.now());
  return new Date(new Date(p.approved_at).getTime() + DISCOVERY_NURTURE_HOLD_MS);
}

/** Delay (days) before a step, relative to the previous one. stepIndex is 0-based. */
export function stepDelayDays(_p: { campaign_id?: string | null }, stepIndex: number, configuredDays: number | null | undefined): number {
  if (stepIndex === 0) return 0;
  return configuredDays ?? 0;
}
