// The always-on prospect agent and campaigns (CSV uploads / topic campaigns)
// share one `prospects` table, mailbox and sender, but they are different
// things and must not feed each other's numbers:
//
//   * Pipeline  = prospects with campaign_id IS NULL (found by our agents).
//   * Campaign  = prospects with campaign_id set (a list the client chose).
//
// Pipeline stats, "leads generated", the Lead Generation Plan progress and the
// conversion "wins" that calibrate fit scoring only ever read the pipeline.
// Campaigns are counted per campaign (client_campaign_stats). Anything that
// needs "the pipeline only" uses this one filter so the rule lives in one place.

// deno-lint-ignore no-explicit-any
export function pipelineOnly(query: any) {
  return query.is("campaign_id", null);
}

// "Discovered" prospects are unreviewed candidates the agent hasn't vetted yet;
// the client's Lead Outreach tab hides them, so they are not yet leads. Any
// "leads generated" figure must use this so Home agrees with Lead Outreach.
// deno-lint-ignore no-explicit-any
export function generatedLeadsOnly(query: any) {
  return pipelineOnly(query).neq("status", "discovered");
}

export const EXISTING_CLIENT_SKIP_REASON =
  "Skipped: this address belongs to an existing client account, so no outreach is sent.";

export type ExistingClientDisposition =
  | { status: "converted"; recordConversion: true }
  | { status: "rejected"; recordConversion: false; reason: string };

/**
 * A prospect whose email matches an active platform client account.
 *
 * Pipeline lead -> "converted" (they became a client; a real win that feeds
 * fit scoring). Campaign contact -> only "skipped": the person is on the
 * client's own list, matching one of OUR client logins says nothing about
 * whether they converted for that client, and must not count as a win.
 */
export function existingClientDisposition(p: { campaign_id?: string | null }): ExistingClientDisposition {
  if (p.campaign_id) return { status: "rejected", recordConversion: false, reason: EXISTING_CLIENT_SKIP_REASON };
  return { status: "converted", recordConversion: true };
}
