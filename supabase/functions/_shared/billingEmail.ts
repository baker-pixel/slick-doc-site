// Transactional billing emails (best-effort: a mail failure must never fail a
// webhook, or Stripe retries the whole event).
import { GRACE_DAYS } from "./billingGate.ts";

const PORTAL_URL = Deno.env.get("CLIENT_PORTAL_URL") || "https://client.orangedoormarketing.com";

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function send(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.warn("RESEND_API_KEY not set; skipping billing email to", to);
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
