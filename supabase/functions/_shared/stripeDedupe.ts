// Pure decision helpers for duplicate-payment protection (unit-tested).

const LIVE_STATUSES = ["active", "trialing", "past_due"];

/**
 * A second *paid* subscription arriving for an account that already has a
 * different live one is a duplicate checkout (two payable sessions both paid,
 * or a double click). The newer one is cancelled + refunded; the original keeps
 * the account. Plan changes happen inside the same subscription (Customer
 * Portal), so a legitimately different subscription id never appears while one
 * is live.
 */
export function isDuplicateSubscription(
  acct: { stripe_subscription_id: string | null; subscription_status: string },
  sub: { id: string; status: string },
): boolean {
  return !!acct.stripe_subscription_id &&
    acct.stripe_subscription_id !== sub.id &&
    LIVE_STATUSES.includes(acct.subscription_status) &&
    (sub.status === "active" || sub.status === "trialing");
}

export type ClaimDecision = "process" | "duplicate" | "in_progress" | "take_over";

export const STALE_CLAIM_MS = 5 * 60 * 1000;

/**
 * Decide what to do with a webhook event whose id already exists in
 * stripe_events. completed -> already handled; claimed recently -> another
 * delivery is mid-flight (ask Stripe to retry later); claimed long ago and never
 * completed -> the earlier attempt died, so take it over.
 */
export function decideClaim(
  existing: { completed_at: string | null; processed_at: string } | null,
  now: number = Date.now(),
): ClaimDecision {
  if (!existing) return "process";
  if (existing.completed_at) return "duplicate";
  return now - new Date(existing.processed_at).getTime() > STALE_CLAIM_MS ? "take_over" : "in_progress";
}
