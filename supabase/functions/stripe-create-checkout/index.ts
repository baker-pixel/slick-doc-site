import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { createCheckoutSession, VALID_TIERS } from "../_shared/stripeCheckout.ts";
import type { PlanTier } from "../_shared/stripe.ts";

// Starts a Stripe Checkout for an existing account (portal "Subscribe" button,
// or an admin sending a link). New signups get their session from `signup`.
serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { client_account_id, tier, origin, password } = await req.json();
    if (!client_account_id) return errorResponse("client_account_id is required", 400);

    const supabase = serviceClient();
    const auth = await checkClientOrAdminAuth(req, supabase, client_account_id, password);
    if (!auth.authorized) return errorResponse("Unauthorized", 401);

    const { data: acct, error } = await supabase
      .from("client_accounts")
      .select("id, email, business_name, first_name, last_name, tier, stripe_customer_id, subscription_status")
      .eq("id", client_account_id)
      .maybeSingle();
    if (error) throw error;
    if (!acct) return errorResponse("Client not found", 404);

    const chosen: PlanTier = VALID_TIERS.includes(tier) ? tier : acct.tier;
    const url = await createCheckoutSession(supabase, acct, chosen, "portal", origin);
    return jsonResponse({ url });
  } catch (err) {
    console.error("stripe-create-checkout failed:", err);
    return errorResponse(err);
  }
});
