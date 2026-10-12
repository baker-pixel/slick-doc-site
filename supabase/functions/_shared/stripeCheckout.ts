// Shared by the signup function (anonymous, new account) and
// stripe-create-checkout (signed-in client or admin).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type PlanTier, priceIdForTier, stripeRequest } from "./stripe.ts";

export const VALID_TIERS: PlanTier[] = ["foundation", "growth", "transformation"];

const MARKETING_ORIGIN = "https://orangedoormarketing.com";
const PORTAL_ORIGIN = "https://client.orangedoormarketing.com";

/** Redirect targets are built server-side from our own origins (or localhost for dev). */
function trustedOrigin(candidate: string | null | undefined, fallback: string): string {
  if (!candidate) return fallback;
  try {
    const u = new URL(candidate);
    const ok = u.hostname === "localhost" || u.hostname === "127.0.0.1" ||
      u.hostname === "orangedoormarketing.com" || u.hostname.endsWith(".orangedoormarketing.com");
    return ok ? u.origin : fallback;
  } catch {
    return fallback;
  }
}

export function portalOrigin(candidate?: string | null): string {
  return trustedOrigin(candidate, Deno.env.get("CLIENT_PORTAL_URL") || PORTAL_ORIGIN);
}

export interface CheckoutAccount {
  id: string;
  email: string;
  business_name: string;
  first_name?: string | null;
  last_name?: string | null;
  stripe_customer_id: string | null;
  subscription_status?: string | null;
}

export async function ensureStripeCustomer(supabase: SupabaseClient, acct: CheckoutAccount): Promise<string> {
  if (acct.stripe_customer_id) return acct.stripe_customer_id;

  const name = [acct.first_name, acct.last_name].filter(Boolean).join(" ") || undefined;
  const customer = await stripeRequest<{ id: string }>(
    "POST",
    "/customers",
    {
      email: acct.email,
      name: acct.business_name,
      description: name,
      metadata: { client_account_id: acct.id },
    },
    { idempotencyKey: `customer-${acct.id}` },
  );

  const { error } = await supabase.from("client_accounts").update({ stripe_customer_id: customer.id }).eq("id", acct.id);
  if (error) throw error;
  return customer.id;
}

export async function createCheckoutSession(
  supabase: SupabaseClient,
  acct: CheckoutAccount,
  tier: PlanTier,
  flow: "signup" | "portal",
  originHint?: string | null,
): Promise<string> {
  if (acct.subscription_status === "active" || acct.subscription_status === "trialing") {
    throw new Error("This account already has an active subscription. Use Manage billing to change plans.");
  }

  const customerId = await ensureStripeCustomer(supabase, acct);

  const base = flow === "signup"
    ? trustedOrigin(originHint, Deno.env.get("MARKETING_SITE_URL") || MARKETING_ORIGIN)
    : portalOrigin(originHint);
  const successUrl = flow === "signup"
    ? `${base}/signup?checkout=success`
    : `${base}/portal?tab=invoices&checkout=success`;
  const cancelUrl = flow === "signup"
    ? `${base}/signup?checkout=cancelled`
    : `${base}/portal?tab=invoices&checkout=cancelled`;

  const session = await stripeRequest<{ url: string }>("POST", "/checkout/sessions", {
    mode: "subscription",
    customer: customerId,
    client_reference_id: acct.id,
    line_items: [{ price: priceIdForTier(tier), quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { client_account_id: acct.id, tier },
    subscription_data: { metadata: { client_account_id: acct.id, tier } },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}
