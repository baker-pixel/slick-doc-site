// Spots a social account whose connection has gone bad and flags it, so the portal can tell the
// client to reconnect. A bad connection otherwise only shows up as posts that fail one by one
// while the Connected Accounts tab keeps saying "connected".
//
// Real example (Facebook, 2026-11-11): "Account needs to be reconnected: Any of the
// pages_read_engagement, pages_manage_metadata, ... permission(s) must be granted before
// impersonating a user's page."

import { notifyClientBlocked } from "./clientAlerts.ts";

// Platform wording that means "the grant is gone or too narrow; the client has to authorise again".
// Deliberately specific: generic failures ("Invalid Request", a 5xx, a rate limit) must NOT match,
// or a passing blip would tell a client to reconnect an account that is fine.
const RECONNECT_PATTERNS: RegExp[] = [
  /\bneeds? to be reconnected\b/i,
  /\bplease reconnect\b/i,
  /\bpermissions?\b.{0,20}\bmust be granted\b/i,
  /\bpermission\(s\) must be granted\b/i,
  /\b(access\s+)?token\b.{0,40}\b(expired|invalid|revoked|invalidated)\b/i,
  /\b(expired|invalid|revoked|invalidated)\b.{0,40}\b(access\s+)?token\b/i,
  /\bsession (has )?(expired|been invalidated)\b/i,
  /\bOAuthException\b/i,
  /\bcode\W{0,3}190\b/i,
  /\b(user|you) (has|have) (not )?(revoked|removed) (access|permission)/i,
  /\bauthorization (has been )?(revoked|expired)\b/i,
];

export function isReconnectError(message: string | null | undefined): boolean {
  if (!message) return false;
  return RECONNECT_PATTERNS.some((re) => re.test(message));
}

export function platformLabel(platform: string): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

/**
 * Mark the account `needs_reauth` and tell the client once (notifyClientBlocked dedupes per day).
 * `pfmAccountId` targets one connected page/profile; without it every connected account on that
 * platform for the client is flagged. Only rows that are currently `connected` change, and a
 * successful reconnect resets the status through postforme-sync-accounts.
 */
export async function flagNeedsReauth(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: { clientId: string; platform: string; pfmAccountId?: string | null },
): Promise<void> {
  let q = supabase
    .from("client_postforme_accounts")
    .update({ status: "needs_reauth" })
    .eq("client_id", opts.clientId)
    .eq("platform", opts.platform)
    .eq("status", "connected");
  if (opts.pfmAccountId) q = q.eq("postforme_account_id", opts.pfmAccountId);
  await q;

  const label = platformLabel(opts.platform);
  await notifyClientBlocked(supabase, opts.clientId, {
    notificationType: "integration_needs_reauth",
    title: `Your ${label} connection needs to be reconnected`,
    description:
      `${label} stopped accepting our posts because the connection has expired or is missing permissions. ` +
      `Open Social & Accounts and click Reconnect, and tick every permission when ${label} asks. ` +
      `Your posts start going out again as soon as it's reconnected.`,
  });
}
