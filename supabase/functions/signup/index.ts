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
const URL_RE = /^https?:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+/;

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.warn("RESEND_API_KEY not set; skipping email to", to);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Orange Door Consultants <hello@orangedoormarketing.com>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// A pending signup used to sit silently until an admin happened to open the
// panel, and the client was told "we'll email you" without any email going
// out. Tell both sides right away.
async function notifySignup(
  supabase: any,
  s: { email: string; businessName: string; firstName: string | null; tier: string; websiteUrl: string },
) {
  const { data: setting } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "admin_notification_email")
    .maybeSingle();
  const adminEmail = setting?.value || "yash.ch@navtech.io";

  await Promise.allSettled([
    sendEmail(
      adminEmail,
      `New signup awaiting approval: ${s.businessName}`,
      `<p><strong>${esc(s.businessName)}</strong> just signed up and is waiting for approval.</p>
       <ul><li>Email: ${esc(s.email)}</li><li>Plan: ${esc(s.tier)}</li><li>Website: ${esc(s.websiteUrl)}</li></ul>
       <p>Approve them in the admin panel under Clients.</p>`,
    ),
    sendEmail(
      s.email,
      "We got your signup - Orange Door",
      `<p>Hi ${esc(s.firstName || "there")},</p>
       <p>Thanks for signing up <strong>${esc(s.businessName)}</strong>. We're reviewing your account and will email you your portal invitation as soon as it's approved - usually within one business day.</p>
       <p>- The Orange Door Team</p>`,
    ),
  ]);
}

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
    if (typeof website_url !== "string" || !URL_RE.test(website_url.trim())) {
      return errorResponse("A valid website URL (starting with http:// or https://) is required", 400);
    }

    // Emails are matched case-insensitively everywhere else (invites, portal
    // login), so normalize once here -- "Bob@x.com" and "bob@x.com" used to
    // become two separate accounts.
    const normalizedEmail = email.trim().toLowerCase();

    const { data: existing } = await supabase
      .from("client_accounts")
      .select("id")
      .ilike("email", normalizedEmail.replace(/[\\%_]/g, "\\$&"))
      .maybeSingle();

    // Don't hand back a client id or reuse the row here: unlike
    // inviteLeadToPortal.ts, the caller is an anonymous stranger, not an
    // admin confirming a known lead. Answer exactly like a fresh signup so
    // this endpoint can't be used to check whether an email is registered.
    if (existing) {
      return jsonResponse({ success: true, status: "created" });
    }

    const { error: insertErr } = await supabase.from("client_accounts").insert({
      email: normalizedEmail,
      business_name: business_name.trim(),
      first_name,
      last_name,
      website_url: website_url.trim(),
      tier,
      plan_tier: tier,
      status: "pending",
    });

    if (insertErr) {
      // idx_client_accounts_business_name_unique -- a different business can't
      // reuse a name already on file, case-insensitively.
      if (insertErr.code === "23505") {
        return errorResponse("A business with this name is already registered. Contact us if this is a mistake.", 409);
      }
      throw insertErr;
    }

    // Best-effort: a mail failure must never fail a signup that already saved.
    await notifySignup(supabase, {
      email: normalizedEmail,
      businessName: business_name.trim(),
      firstName: first_name,
      tier,
      websiteUrl: website_url.trim(),
    }).catch((e) => console.error("signup notification failed:", e));

    return jsonResponse({ success: true, status: "created" });
  } catch (err) {
    console.error("signup failed:", err);
    return errorResponse(err);
  }
});
