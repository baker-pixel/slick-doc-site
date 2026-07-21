import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { checkRateLimit, getClientIp } from "../_shared/rateLimit.ts";

// Public, unauthenticated self-serve signup. Creates a *pending* client
// account -- it does not seed the onboarding workflow, generate projects,
// or send an invite (unlike inviteLeadToPortal.ts). Those fire once an
// admin approves the pending row; this endpoint only captures the request.
const VALID_TIERS = ["foundation", "growth", "transformation"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const {
      email,
      business_name,
      tier,
      first_name = null,
      last_name = null,
      website_url = null,
      // Hidden field on the real form -- only bots fill it in.
      honeypot = "",
    } = body;

    const ip = getClientIp(req);
    const { limited } = await checkRateLimit(supabase, ip, "signup");
    if (limited) return errorResponse("Too many requests. Please try again later.", 429);

    // Bot tripped the honeypot: pretend it worked, don't tip it off.
    if (honeypot) return jsonResponse({ success: true });

    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return errorResponse("A valid email is required", 400);
    }
    if (typeof business_name !== "string" || !business_name.trim()) {
      return errorResponse("Business name is required", 400);
    }
    if (!VALID_TIERS.includes(tier)) {
      return errorResponse("A valid tier is required", 400);
    }

    const { data: existing } = await supabase
      .from("client_accounts")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    // Don't hand back a client id or reuse the row here: unlike
    // inviteLeadToPortal.ts, the caller is an anonymous stranger, not an
    // admin confirming a known lead.
    if (existing) {
      return jsonResponse({ success: true, status: "existing_account" });
    }

    const { error: insertErr } = await supabase.from("client_accounts").insert({
      email,
      business_name: business_name.trim(),
      first_name,
      last_name,
      website_url,
      tier,
      status: "pending",
    });

    if (insertErr) throw insertErr;

    return jsonResponse({ success: true, status: "created" });
  } catch (err) {
    console.error("signup failed:", err);
    return errorResponse(err);
  }
});
