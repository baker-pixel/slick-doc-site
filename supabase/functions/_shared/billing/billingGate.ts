// Billing -> service gating. Every engine already filters on
// client_accounts.status = 'active', so billing drives that column instead of
// each engine re-checking Stripe state:
//   - paid / trialing                      -> entitled
//   - past_due within the grace window     -> entitled (Stripe is still retrying)
//   - anything else (none, unpaid, canceled, past_due beyond grace) -> not entitled
// Entitled + paused-for-billing -> resume. Not entitled + active -> pause.
// A manual admin pause (paused_for_billing = false) is never auto-resumed.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const GRACE_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BillingAccount {
  status: string;
  subscription_status: string;
  payment_failed_at: string | null;
  paused_for_billing: boolean;
}

export type BillingDecision = "pause" | "resume" | "none";

export function isEntitled(a: BillingAccount, now: Date = new Date()): boolean {
  if (a.subscription_status === "active" || a.subscription_status === "trialing") return true;
  if (a.subscription_status === "past_due") {
    // The webhook always stamps payment_failed_at on entering past_due; a
    // missing stamp means we can't prove the grace expired, so don't pause.
    if (!a.payment_failed_at) return true;
    return now.getTime() < new Date(a.payment_failed_at).getTime() + GRACE_DAYS * DAY_MS;
  }
  return false;
}

export function billingDecision(a: BillingAccount, now: Date = new Date()): BillingDecision {
  if (isEntitled(a, now)) {
    return a.status === "paused" && a.paused_for_billing ? "resume" : "none";
  }
  return a.status === "active" ? "pause" : "none";
}

export async function isBillingEnforced(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "billing_enforcement")
    .maybeSingle();
  return (data?.value ?? "on") !== "off";
}

/**
 * Re-evaluates one account and applies a pause/resume. Resume always applies;
 * pause is skipped when the billing_enforcement kill switch is off.
 */
export async function applyBillingDecision(
  supabase: SupabaseClient,
  clientId: string,
  enforced?: boolean,
): Promise<BillingDecision> {
  const { data: acct, error } = await supabase
    .from("client_accounts")
    .select("status, subscription_status, payment_failed_at, paused_for_billing")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!acct) return "none";

  const decision = billingDecision(acct as BillingAccount);
  if (decision === "pause") {
    if (!(enforced ?? await isBillingEnforced(supabase))) return "none";
    const { error: e } = await supabase
      .from("client_accounts")
      .update({ status: "paused", paused_for_billing: true })
      .eq("id", clientId)
      .eq("status", "active");
    if (e) throw e;
  } else if (decision === "resume") {
    const { error: e } = await supabase
      .from("client_accounts")
      .update({ status: "active", paused_for_billing: false })
      .eq("id", clientId)
      .eq("status", "paused")
      .eq("paused_for_billing", true);
    if (e) throw e;
  }
  return decision;
}
