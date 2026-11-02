// Pure parsing helpers for inbound replies/bounces (used by inboundReply.ts).
// The IMAP mailbox poller that used to live here was removed; replies arrive via
// the Resend inbound webhook.

// Every client-SMTP send tags its Message-ID with the email_logs.tracking_id
// (see clientEmailSend.ts) so a reply/bounce landing back in the client's
// mailbox can be tied to the exact prospect it was sent to, via standard
// In-Reply-To / References headers -- no new column needed.
const TRACKING_ID_RE = /odm-([0-9a-f-]{36})@/i;

function extractTrackingId(headerValue: string): string | null {
  const m = headerValue.match(TRACKING_ID_RE);
  return m ? m[1] : null;
}

export function getHeader(headers: Record<string, string | string[]> | undefined, name: string): string {
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

export const BOUNCE_FROM_RE = /mailer-daemon|postmaster|mail delivery (sub)?system/i;
export const BOUNCE_SUBJECT_RE = /undeliver|delivery status notification|delivery (has )?failed|failure notice|returned mail|couldn't be delivered|address not found/i;

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

export function stripHtml(html: string): string {
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
export function trimQuotedReply(text: string): string {
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

// A stable per-message key for prospect_replies' unique (client_id, message_id).
// Falls back to a UID-based key for the rare message with no Message-ID header
// so it is still deduped instead of re-stored on every rescan.
export function normalizeMessageId(headerValue: string, clientId: string, uid: number): string {
  const m = headerValue.match(/<([^>]+)>/);
  const id = (m?.[1] ?? headerValue).trim();
  return id ? id.slice(0, 500) : `no-message-id:${clientId}:${uid}`;
}

// IMAP Date headers are RFC 2822 and occasionally missing or garbage; a bad
// date must never block storing the reply, so fall back to the poll time.
export function parseReceivedAt(dateHeader: string, fallback: Date = new Date()): string {
  const t = Date.parse(dateHeader);
  return new Date(Number.isNaN(t) ? fallback.getTime() : t).toISOString();
}

export function buildSnippet(body: string | null, max = 280): string | null {
  if (!body) return null;
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
