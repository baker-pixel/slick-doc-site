import {
  BOUNCE_FROM_RE,
  BOUNCE_SUBJECT_RE,
  buildSnippet,
  extractSenderAddress,
  isAutoReply,
  normalizeMessageId,
  parseReceivedAt,
  stripHtml,
  trimQuotedReply,
} from "./clientMailboxPoll.ts";
import { ingestReply } from "./replyIngest.ts";

// Central reply inbox. Client outreach carries
//   Reply-To: replies+<email_logs.tracking_id>@<REPLY_INBOX_DOMAIN>
// so a prospect's reply lands in Resend's inbound mail for that domain and
// arrives at resend-webhook as an `email.received` event -- no IMAP polling.
// The tag is the same tracking id already stamped on the Message-ID
// (clientEmailSend.ts), so In-Reply-To/References remains a fallback.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TAG_RE = new RegExp(`(?:^|[<\\s,"])replies\\+(${UUID})@`, "i");
const MESSAGE_ID_TAG_RE = new RegExp(`odm-(${UUID})@`, "i");

/** Reply-To value for a send, or null when the central inbox is not configured. */
export function buildReplyToAddress(trackingId: string, domain: string | undefined | null): string | null {
  const d = (domain ?? "").trim().toLowerCase();
  if (!d || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
  return `replies+${trackingId}@${d}`;
}

/** Tracking id from the first recipient address carrying a replies+<id> tag. */
export function extractTagFromRecipients(addresses: string[]): string | null {
  for (const a of addresses) {
    const m = a.match(TAG_RE);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** Tracking id from In-Reply-To / References (our odm-<id>@ Message-ID). */
export function extractTrackingIdFromHeaders(headers: Record<string, string>): string | null {
  for (const name of ["in-reply-to", "references"]) {
    const m = (headers[name] ?? "").match(MESSAGE_ID_TAG_RE);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  message_id: string;
  created_at: string;
  received_for?: string[];
}

export interface InboundEventData {
  email_id: string;
  from: string;
  to: string[];
  cc?: string[];
  received_for?: string[];
  message_id?: string;
  subject?: string;
  created_at?: string;
}

/** Reply text a human typed: plain text preferred, HTML stripped, quoted history cut. */
export function replyBodyFrom(text: string | null, html: string | null): string | null {
  let body = (text ?? "").trim();
  if (!body && html) body = stripHtml(html);
  if (!body) return null;
  const trimmed = trimQuotedReply(body) || body.trim();
  return trimmed ? trimmed.slice(0, 4000) : null;
}

function lowerKeys(h: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h ?? {})) out[k.toLowerCase()] = Array.isArray(v) ? v.join(" ") : String(v ?? "");
  return out;
}

export type InboundOutcome =
  | { handled: true; classification: "reply" | "bounce"; stored: boolean }
  | { handled: false; reason: "no_tracking_id" | "auto_reply" | "unknown_send" };

/**
 * Handles one `email.received` event: fetch the full message, tie it to the
 * outreach send via the tracking id, and hand it to the shared ingest. A
 * thrown error means "retry" (the webhook returns 5xx so Resend redelivers);
 * an unrelated or auto-generated message returns handled:false and is dropped.
 */
export async function handleInboundEmail(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  event: InboundEventData,
  fetchReceived: (emailId: string) => Promise<ReceivedEmail>,
): Promise<InboundOutcome> {
  const email = await fetchReceived(event.email_id);
  const headers = lowerKeys(email.headers);

  const trackingId = extractTagFromRecipients([
    ...(event.to ?? []), ...(event.received_for ?? []), ...(event.cc ?? []),
    ...(email.to ?? []), ...(email.received_for ?? []), ...(email.cc ?? []),
  ]) ?? extractTrackingIdFromHeaders(headers);
  if (!trackingId) return { handled: false, reason: "no_tracking_id" };

  const fromHeader = headers["from"] || email.from || event.from || "";
  const subject = email.subject ?? event.subject ?? "";
  const isBounce = BOUNCE_FROM_RE.test(fromHeader) || BOUNCE_SUBJECT_RE.test(subject);
  if (!isBounce && isAutoReply(subject, headers["auto-submitted"] ?? "")) return { handled: false, reason: "auto_reply" };

  const { data: log } = await supabase
    .from("email_logs")
    .select("id, metadata")
    .eq("tracking_id", trackingId)
    .maybeSingle();
  const logMeta = (log?.metadata ?? {}) as Record<string, unknown>;
  const prospectId = typeof logMeta.prospect_id === "string" ? logMeta.prospect_id : null;
  let clientId = typeof logMeta.client_id === "string" ? logMeta.client_id : null;
  if (!clientId && prospectId) {
    const { data: p } = await supabase.from("prospects").select("client_id").eq("id", prospectId).maybeSingle();
    clientId = p?.client_id ?? null;
  }
  // Without a client we cannot file the reply anywhere; a forged/stale tag.
  if (!clientId) return { handled: false, reason: "unknown_send" };

  const replyBody = isBounce ? null : replyBodyFrom(email.text, email.html);
  const out = await ingestReply(supabase, {
    clientId,
    prospectId,
    emailLogId: log?.id ?? null,
    messageId: normalizeMessageId(headers["message-id"] || email.message_id || event.message_id || "", clientId, 0),
    inReplyTo: headers["in-reply-to"] || null,
    fromAddress: extractSenderAddress(fromHeader),
    subject,
    receivedAt: parseReceivedAt(headers["date"] ?? "", new Date(email.created_at ?? event.created_at ?? Date.now())),
    isBounce,
    matchMethod: "tracking_id",
    replyBody,
    snippet: buildSnippet(replyBody),
  });
  return { handled: true, classification: isBounce ? "bounce" : "reply", stored: out.stored };
}

/** Real fetch of Resend's "retrieve received email" endpoint. */
export function resendFetchReceived(apiKey: string): (id: string) => Promise<ReceivedEmail> {
  return async (id: string) => {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Resend retrieve received email ${id} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return await res.json() as ReceivedEmail;
  };
}
