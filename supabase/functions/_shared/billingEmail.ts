// Transactional billing emails (best-effort: a mail failure must never fail a
// webhook, or Stripe retries the whole event).
import { GRACE_DAYS } from "./billingGate.ts";
import { emailLogo } from "./brandEmail.ts";
import { tierLabel } from "./systemTier.ts";

const PORTAL_URL = Deno.env.get("CLIENT_PORTAL_URL") || "https://client.orangedoormarketing.com";

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function send(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.warn("RESEND_API_KEY not set; skipping billing email to", to);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Orange Door Marketing <hello@orangedoormarketing.com>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const billingLink = `${PORTAL_URL}/portal?tab=invoices`;

export async function sendPaymentFailedEmail(to: string, firstName: string | null) {
  await send(
    to,
    "Action needed: your Orange Door payment didn't go through",
    `<p>Hi ${esc(firstName || "there")},</p>
     <p>We couldn't process your latest payment. Please update your card within ${GRACE_DAYS} days so your services keep running.</p>
     <p><a href="${billingLink}">Update payment method</a></p>
     <p>- The Orange Door Team</p>`,
  );
}

export async function sendServicesPausedEmail(to: string, firstName: string | null) {
  await send(
    to,
    "Your Orange Door services are paused",
    `<p>Hi ${esc(firstName || "there")},</p>
     <p>Your services are paused because we haven't received payment. They resume automatically as soon as your subscription is paid.</p>
     <p><a href="${billingLink}">Update payment method</a></p>
     <p>- The Orange Door Team</p>`,
  );
}

/**
 * Sent once, when a self-serve signup's first payment activates the account.
 * The portal invitation goes out separately (send-client-invite); this one
 * confirms the purchase and says what happens next.
 */
export async function sendPaymentConfirmationEmail(
  to: string,
  firstName: string | null,
  businessName: string | null,
  tier: string | null,
) {
  const plan = tier ? tierLabel(tier) : null;
  const step = (n: number, title: string, body: string) =>
    `<tr><td valign="top" width="34" style="padding:0 0 18px 0;">
       <div style="width:26px;height:26px;border-radius:13px;background:#F97316;color:#ffffff;font-weight:700;font-size:13px;line-height:26px;text-align:center;">${n}</div>
     </td><td style="padding:0 0 18px 0;font-size:14px;color:#3f3f46;"><strong style="color:#1a1a1a;">${title}</strong><br>${body}</td></tr>`;
  await send(
    to,
    "Welcome to Orange Door - your payment is confirmed",
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Welcome to Orange Door</title></head>
<body style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.6;color:#1a1a1a;margin:0;padding:40px 20px;background-color:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td style="padding-bottom:28px;">${emailLogo(false)}</td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;padding:40px;">
      <p style="font-size:22px;font-weight:700;margin:0 0 6px 0;">Welcome to Orange Door, ${esc(firstName || "there")}.</p>
      <p style="font-size:15px;color:#3f3f46;margin:0 0 24px 0;">
        Thank you - your payment${plan ? ` for the <strong>${esc(plan)}</strong> plan` : ""} went through${businessName ? ` and <strong>${esc(businessName)}</strong> is now an Orange Door client` : ""}.
        Stripe is sending your receipt separately.
      </p>
      <p style="font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#F97316;margin:0 0 14px 0;">What happens next</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${step(1, "Look for your portal invitation", "It arrives from us in a few minutes as a separate email. Check spam if you don't see it.")}
        ${step(2, "Set up your login", "Open the invitation and choose a password. The link is valid for 7 days.")}
        ${step(3, "Tell us about your business", "A short guided setup in the portal connects your website and social accounts so we can start your first month.")}
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr>
        <td align="center" bgcolor="#F97316" style="border-radius:6px;">
          <a href="${PORTAL_URL}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">Go to your client portal</a>
        </td>
      </tr></table>
      <p style="font-size:13px;color:#71717a;margin:28px 0 0 0;">Questions? Just reply to this email - a real person will answer.</p>
    </td></tr>
    <tr><td style="padding:24px 4px 0 4px;font-size:12px;color:#a1a1aa;">&copy; ${new Date().getFullYear()} Orange Door Marketing</td></tr>
  </table>
</body></html>`,
  );
}
