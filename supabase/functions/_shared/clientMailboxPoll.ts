import { ImapLite } from "./imapLite.ts";
import { notifyClientBlocked } from "./clientAlerts.ts";
import { logActivity } from "./activityLog.ts";

interface SmtpMeta {
  host?: string;
  port?: number;
  username?: string;
  secure?: boolean;
  verified?: boolean;
}

export interface PollResult {
  polled: number;
  bounced: number;
  replied: number;
  error?: string;
}

// Only Gmail and Microsoft 365 have well-known IMAP hosts we can infer from
// the SMTP host already on file -- a fully custom SMTP server could be
// anything, so we fall back to a smtp->imap subdomain guess (works for a lot
// of providers) and let the connection attempt itself fail closed if wrong.
function inferImapHost(smtpHost: string): string {
  if (smtpHost === "smtp.gmail.com") return "imap.gmail.com";
  if (smtpHost === "smtp.office365.com") return "outlook.office365.com";
  return smtpHost.replace(/^smtp\./i, "imap.");
}

// Every client-SMTP send tags its Message-ID with the email_logs.tracking_id
// (see clientEmailSend.ts) so a reply/bounce landing back in the client's
// mailbox can be tied to the exact prospect it was sent to, via standard
// In-Reply-To / References headers -- no new column needed.
const TRACKING_ID_RE = /odm-([0-9a-f-]{36})@/i;

function extractTrackingId(headerValue: string): string | null {
  const m = headerValue.match(TRACKING_ID_RE);
  return m ? m[1] : null;
}

function getHeader(headers: Record<string, string | string[]> | undefined, name: string): string {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return Array.isArray(v) ? v.join(" ") : v;
  }
  return "";
}

// "Name <addr@x.com>" or bare "addr@x.com" -> lowercase address.
export function extractSenderAddress(fromHeader: string): string | null {
  const m = fromHeader.match(/<([^>]+)>/) ?? fromHeader.match(/([^\s<>"]+@[^\s<>"]+)/);
  const addr = m?.[1]?.trim().toLowerCase();
  return addr && addr.includes("@") ? addr : null;
}

// Out-of-office / vacation / auto-acknowledge mail is not a human reply and
// must not stop a sequence or notify the client.
const AUTO_REPLY_SUBJECT_RE = /^(auto(matic)?[ -]?reply|automatische antwort|out of office|ooo\b|vacation|away from|abwesenheit)|auto.?reply|out of the office/i;
export function isAutoReply(subject: string, autoSubmitted: string): boolean {
  if (autoSubmitted && !/^no$/i.test(autoSubmitted.trim())) return true;
  return AUTO_REPLY_SUBJECT_RE.test(subject.trim());
}

const BOUNCE_FROM_RE = /mailer-daemon|postmaster|mail delivery (sub)?system/i;
const BOUNCE_SUBJECT_RE = /undeliver|delivery status notification|delivery (has )?failed|failure notice|returned mail|couldn't be delivered|address not found/i;

interface MimePart {
  contentType: string;
  encoding: string;
  body: string;
}

function splitHeaderBody(raw: string): { headers: Record<string, string>; body: string } {
  const idx = raw.indexOf("\n\n");
  const headerBlock = idx === -1 ? raw : raw.slice(0, idx);
  const body = idx === -1 ? "" : raw.slice(idx + 2);
  // RFC 2822 header folding: a line starting with space/tab continues the previous header.
  const unfolded = headerBlock.replace(/\n[ \t]+/g, " ");
  const headers: Record<string, string> = {};
  for (const line of unfolded.split("\n")) {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  return { headers, body };
}

function parseContentType(value: string | undefined): { type: string; boundary?: string } {
  if (!value) return { type: "text/plain" };
  const type = value.split(";")[0].trim().toLowerCase();
  const boundaryMatch = value.match(/boundary="?([^";]+)"?/i);
  return { type, boundary: boundaryMatch?.[1] };
}

// Walks a (possibly multipart/nested) raw MIME message and collects every
// text/plain and text/html leaf part -- good enough for real-world reply
// emails (plain text, or multipart/alternative with an HTML copy, optionally
// wrapped in multipart/mixed when there's a signature image attached).
function collectTextParts(raw: string, parts: MimePart[], depth = 0): void {
  if (depth > 4) return; // guard against pathological/malicious nesting
  const { headers, body } = splitHeaderBody(raw);
  const { type, boundary } = parseContentType(headers["content-type"]);
  const encoding = (headers["content-transfer-encoding"] || "7bit").trim().toLowerCase();

  if (type.startsWith("multipart/") && boundary) {
    const segments = body.split(`--${boundary}`).slice(1, -1);
    for (const seg of segments) collectTextParts(seg.replace(/^\n/, ""), parts, depth + 1);
    return;
  }

  if (type === "text/plain" || type === "text/html") {
    parts.push({ contentType: type, encoding, body });
  }
}

function decodeQuotedPrintable(input: string): string {
  const soft = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    if (soft[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(soft.charCodeAt(i));
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
}

function decodeTransferEncoding(body: string, encoding: string): string {
  if (encoding === "base64") {
    try {
      const binary = atob(body.replace(/\s+/g, ""));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      return body;
    }
  }
  if (encoding === "quoted-printable") return decodeQuotedPrintable(body);
  return body;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

// Cuts off the quoted history a reply client appends below a new message, so
// what we store is what the prospect actually typed, not the full thread.
// Best-effort heuristic -- a reply with no recognizable quote marker is kept
// as-is rather than risk trimming real content.
function trimQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const cutPatterns = [/^On .{0,120}wrote:\s*$/i, /^-{2,}\s*Original Message\s*-{2,}/i, /^>/];
  for (let i = 0; i < lines.length; i++) {
    if (cutPatterns.some((re) => re.test(lines[i]))) {
      return lines.slice(0, i).join("\n").trim();
    }
  }
  return text.trim();
}

export function extractReplySnippet(raw: Uint8Array): string | null {
  try {
    // IMAP delivers CRLF; the MIME splitter below keys on "\n\n", so without
    // normalizing, header/body were never separated and every snippet was null.
    const text = new TextDecoder("utf-8", { fatal: false }).decode(raw).replace(/\r\n/g, "\n");
    const parts: MimePart[] = [];
    collectTextParts(text, parts);
    const preferred = parts.find((p) => p.contentType === "text/plain") ?? parts.find((p) => p.contentType === "text/html");
    if (!preferred) return null;

    let decoded = decodeTransferEncoding(preferred.body, preferred.encoding);
    if (preferred.contentType === "text/html") decoded = stripHtml(decoded);

    const trimmed = trimQuotedReply(decoded) || decoded.trim();
    return trimmed ? trimmed.slice(0, 4000) : null;
  } catch (e) {
    console.warn("[clientMailboxPoll] reply body parse failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

const MAX_MESSAGES_PER_RUN = 200;
const POLL_TIMEOUT_MS = 40_000;
// IMAP SINCE works on whole days; a reply is only acted on once (see the
// status guards below), so re-scanning a window every run is safe and does
// not depend on the client leaving mail unread.
const LOOKBACK_DAYS = 21;
// A reply/bounce may only change a prospect that is still in the outreach
// funnel -- never resurrect an unsubscribed or converted one.
const REPLYABLE_STATUSES = ["nurture", "exhausted", "pending"];

/**
 * Polls one client's connected mailbox for recent mail, classifies each
 * message as a bounce or a genuine reply (only when it can be tied back to a
 * specific sent email via In-Reply-To/References), and updates that
 * prospect's status accordingly. Read-only: it never marks the client's mail
 * as read. Never throws -- a broken mailbox for one client must not block
 * polling every other client's.
 */
export async function pollClientMailbox(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  clientId: string,
): Promise<PollResult> {
  const result: PollResult = { polled: 0, bounced: 0, replied: 0 };

  const { data: cred } = await supabase
    .from("client_oauth_tokens")
    .select("access_token, token_metadata")
    .eq("client_id", clientId)
    .eq("platform", "smtp")
    .maybeSingle();

  const meta = (cred?.token_metadata ?? {}) as SmtpMeta;
  // Only poll mailboxes that have actually proven they work (see
  // test-client-smtp) -- a broken/unverified connection means the password
  // on file may well be stale, which would otherwise just spam auth failures.
  if (!cred?.access_token || !meta.host || !meta.port || !meta.username || meta.verified !== true) {
    return result;
  }

  const client = new ImapLite({ host: inferImapHost(meta.host), port: 993, timeoutMs: 15_000 });

  const run = async () => {
    await client.connect();
    await client.login(meta.username!, cred.access_token);
    await client.examine("INBOX");

    const uids = await client.searchSince(new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
    const batch = uids.slice(-MAX_MESSAGES_PER_RUN);
    const headersByUid = await client.fetchHeaders(batch, ["SUBJECT", "FROM", "MESSAGE-ID", "IN-REPLY-TO", "REFERENCES", "AUTO-SUBMITTED"]);

    for (const [uid, headers] of headersByUid) {
      try {
        result.polled++;

        const fromHeader = getHeader(headers, "From");
        const subject = getHeader(headers, "Subject");
        const trackingId = extractTrackingId(getHeader(headers, "In-Reply-To")) ||
          extractTrackingId(getHeader(headers, "References"));
        const isBounce = BOUNCE_FROM_RE.test(fromHeader) || BOUNCE_SUBJECT_RE.test(subject);
        const autoReply = !isBounce && isAutoReply(subject, getHeader(headers, "Auto-Submitted"));
        if (autoReply) continue;

        // Primary link: the Message-ID tag on what we sent. Fallback for a real
        // reply that lost its threading headers (new compose, forwarding
        // client): the sender is one of THIS client's prospects.
        let prospectId: string | null = null;
        if (trackingId) {
          const { data: log } = await supabase
            .from("email_logs")
            .select("metadata")
            .eq("tracking_id", trackingId)
            .maybeSingle();
          const logMeta = (log?.metadata ?? {}) as Record<string, unknown>;
          prospectId = typeof logMeta.prospect_id === "string" ? logMeta.prospect_id : null;
        } else if (!isBounce) {
          const sender = extractSenderAddress(fromHeader);
          if (sender && sender !== meta.username?.toLowerCase()) {
            const { data: bySender } = await supabase
              .from("prospects")
              .select("id")
              .eq("client_id", clientId)
              .ilike("email", sender.replace(/[%_\\]/g, "\\$&"))
              .limit(2);
            // Ambiguous (same address on two prospects) -> don't guess.
            if (bySender?.length === 1) prospectId = bySender[0].id;
          }
        }
        if (!prospectId) continue; // unrelated inbox mail, or a bounce we cannot attribute

        const { data: prospect } = await supabase
          .from("prospects")
          .select("name, status, reply_snippet")
          .eq("id", prospectId)
          .maybeSingle();
        if (!prospect) continue;
        // A prospect someone already marked "replied" by hand still gets its
        // reply text captured once; every other settled status is left alone.
        const needsBackfill = prospect.status === "replied" && !prospect.reply_snippet;
        if (!REPLYABLE_STATUSES.includes(prospect.status) && !needsBackfill) continue; // already handled

        if (isBounce) {
          result.bounced++;
          await supabase.from("prospects").update({ status: "bounced" }).eq("id", prospectId);
        } else {
          // Only counts as a genuine reply when it's tied back to a specific
          // sent email or a known prospect. Body fetched only for confirmed replies.
          result.replied++;
          let replySnippet: string | null = null;
          try {
            const raw = await client.fetchRaw(uid);
            if (raw) replySnippet = extractReplySnippet(raw);
          } catch (e) {
            console.warn(`[clientMailboxPoll] ${clientId} uid=${uid}: reply body fetch failed:`, e instanceof Error ? e.message : e);
          }
          await supabase.from("prospects").update({
            status: "replied",
            replied_at: new Date().toISOString(),
            ...(replySnippet ? { reply_snippet: replySnippet } : {}),
          }).eq("id", prospectId);

          // Tell the client -- a reply is the whole point of outreach and used
          // to sit unseen until someone opened the prospect. Deduped per
          // prospect (notifyClientBlocked keys on title) so re-scanning the
          // lookback window never re-notifies.
          const who = prospect.name ?? "A prospect";
          const preview = replySnippet ? `"${replySnippet.replace(/\s+/g, " ").slice(0, 280)}${replySnippet.length > 280 ? "…" : ""}"` : "Open your portal to read it in your inbox.";
          await notifyClientBlocked(supabase, clientId, {
            notificationType: "prospect_reply",
            title: `${who} replied to your outreach`,
            description: preview,
            dedupeHours: 24 * 60,
          });
          await logActivity(supabase, clientId, {
            type: "prospect_replied",
            title: `${who} replied to your outreach`,
            description: replySnippet ? replySnippet.slice(0, 140) : undefined,
            icon: "mail",
            metadata: { prospect_id: prospectId },
          });
        }
        // Stop the rest of the sequence either way.
        await supabase.from("email_queue").update({ status: "cancelled", error_message: isBounce ? "Prospect bounced" : "Prospect replied" })
          .filter("metadata->>prospect_id", "eq", prospectId).eq("status", "pending");
      } catch (msgErr) {
        console.error(`[clientMailboxPoll] ${clientId} uid=${uid}:`, msgErr);
      }
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("IMAP poll timed out")), POLL_TIMEOUT_MS); }),
    ]);
  } catch (err) {
    console.error(`[clientMailboxPoll] ${clientId}:`, err);
    result.error = err instanceof Error ? err.message : "IMAP poll failed";
  } finally {
    clearTimeout(timer);
    await client.close();
  }

  return result;
}
