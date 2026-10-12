// Guard for public (unauthenticated) functions that send branded email to an
// address the *caller* supplies. Without it they are an open relay: anyone can
// make hello@orangedoormarketing.com mail any address with attacker-chosen
// text (spam/phishing, and it burns the sender's reputation).
import { isServiceRequest } from "./auth.ts";
import { jsonResponse } from "./http.ts";
import { checkRateLimit, getClientIp } from "./rateLimit.ts";

export const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

/** Escape for interpolation into HTML text or attribute values. */
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Single-line plain text: strips control characters (blocks header/ICS line
 * injection via CR/LF) and caps the length.
 */
export function cleanText(v: unknown, max = 100): string {
  return String(v ?? "")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Returns a ready 400/429 Response when the request must be refused, or null
 * when it may proceed. Limits both the caller (IP) and the recipient, so one
 * address can't be bombed from many IPs either.
 */
export async function guardPublicSender(
  req: Request,
  supabase: unknown,
  endpoint: string,
  email: unknown,
): Promise<Response | null> {
  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email.trim())) {
    return jsonResponse({ error: "A valid email is required" }, 400);
  }
  // Our own backend (e.g. generate-analysis -> send-gap-report) presents the
  // service key; all such calls share one source IP, so rate limiting them
  // would block legitimate reports. Only anonymous public callers are limited.
  if (isServiceRequest(req)) return null;

  const ip = await checkRateLimit(supabase, getClientIp(req), endpoint);
  const rcpt = await checkRateLimit(supabase, `email:${email.trim().toLowerCase()}`, endpoint);
  if (ip.limited || rcpt.limited) {
    return jsonResponse({ error: "Too many requests. Please try again later." }, 429);
  }
  return null;
}
