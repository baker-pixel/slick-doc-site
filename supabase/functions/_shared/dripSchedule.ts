// Timing rules for the prospect outreach drip, in one place so the enroller
// and its tests agree.
//
// Discovery leads (found by our own agents) wait 48h after an admin approves
// them before nurture starts -- a review window to catch junk before anything
// is sent -- and the first email then follows the sequence's own step-1 delay.
//
// Campaign leads (CSV upload) are a list a person chose and consented to at
// upload time, so neither wait applies: they enroll at the next hourly run and
// step 1 sends right away. Later steps keep their configured spacing.

export const DISCOVERY_NURTURE_HOLD_MS = 48 * 60 * 60 * 1000;

export interface DripProspectTiming {
  campaign_id?: string | null;
  approved_at: string | null;
  created_at?: string | null;
}

export function isCampaignLead(p: { campaign_id?: string | null }): boolean {
  return !!p.campaign_id;
}

/** Has this approved, pending prospect waited long enough to enter nurture? */
export function readyForNurture(p: DripProspectTiming, now: Date): boolean {
  if (!p.approved_at) return false;
  const hold = isCampaignLead(p) ? 0 : DISCOVERY_NURTURE_HOLD_MS;
  return new Date(p.approved_at).getTime() + hold <= now.getTime();
}

/** When the sequence clock starts (step delays are measured from here). */
export function nurtureStartAt(p: DripProspectTiming): Date {
  if (!p.approved_at) return new Date(p.created_at ?? Date.now());
  const hold = isCampaignLead(p) ? 0 : DISCOVERY_NURTURE_HOLD_MS;
  return new Date(new Date(p.approved_at).getTime() + hold);
}

/** Delay (days) before a step, relative to the previous one. stepIndex is 0-based. */
export function stepDelayDays(p: { campaign_id?: string | null }, stepIndex: number, configuredDays: number | null | undefined): number {
  if (isCampaignLead(p) && stepIndex === 0) return 0;
  return configuredDays ?? 0;
}
