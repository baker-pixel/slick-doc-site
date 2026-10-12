import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { portalOrigin } from "../_shared/stripeCheckout.ts";
import { stripeRequest } from "../_shared/stripe.ts";

// Returns a Stripe Customer Portal URL: update cards, switch plan, cancel,
// download invoices.
serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { client_account_id, origin, password } = await req.json();
    if (!client_account_id) return errorResponse("client_account_id is required", 400);

    const supabase = serviceClient();
    const auth = await checkClientOrAdminAuth(req, supabase, client_account_id, password);
    if (!auth.authorized) return errorResponse("Unauthorized", 401);

    const { data: acct, error } = await supabase
      .from("client_accounts")
      .select("stripe_customer_id")
      .eq("id", client_account_id)
      .maybeSingle();
    if (error) throw error;
    if (!acct?.stripe_customer_id) return errorResponse("No billing profile yet. Subscribe first.", 400);

    const session = await stripeRequest<{ url: string }>("POST", "/billing_portal/sessions", {
      customer: acct.stripe_customer_id,
      // Sandbox portal config (cards, invoices, cancel at period end, plan
      // switch). Override with STRIPE_PORTAL_CONFIG for live mode.
      configuration: Deno.env.get("STRIPE_PORTAL_CONFIG") ?? "bpc_1UPh3cHaqELPL5HRfZY84lQs",
      return_url: `${portalOrigin(origin)}/portal?tab=invoices`,
    });
    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error("stripe-billing-portal failed:", err);
    return errorResponse(err);
  }
});
