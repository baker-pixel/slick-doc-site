import { ImapClient } from "jsr:@bobbyg603/deno-imap";

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

const BOUNCE_FROM_RE = /mailer-daemon|postmaster|mail delivery (sub)?system/i;
const BOUNCE_SUBJECT_RE = /undeliver|delivery status notification|delivery (has )?failed|failure notice|returned mail|couldn't be delivered|address not found/i;

const MAX_MESSAGES_PER_RUN = 25;
const POLL_TIMEOUT_MS = 25_000;

/**
 * Polls one client's connected mailbox for unseen mail, classifies each
 * message as a bounce or a genuine reply (only when it can be tied back to a
 * specific sent email via In-Reply-To/References), and updates that
 * prospect's status accordingly. Never throws -- a broken mailbox for one
 * client must not block polling every other client's.
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

  const imapHost = inferImapHost(meta.host);
  const client = new ImapClient({
    host: imapHost,
    port: 993,
    tls: true,
    username: meta.username,
    password: cred.access_token,
    commandTimeout: 15_000,
  });

  const run = async () => {
    await client.connect();
    await client.authenticate();
    await client.selectMailbox("INBOX");

    const uids = await client.search({ flags: { has: ["\\Unseen"] } });
    const batch = (uids ?? []).slice(0, MAX_MESSAGES_PER_RUN);

    for (const uid of batch) {
      try {
        const messages = await client.fetch(String(uid), {
          byUid: true,
          headers: ["Subject", "From", "Message-ID", "In-Reply-To", "References"],
        });
        const msg = messages?.[0];
        if (!msg) continue;
        result.polled++;

        const fromHeader = getHeader(msg.headers, "From");
        const subject = getHeader(msg.headers, "Subject");
        const inReplyTo = getHeader(msg.headers, "In-Reply-To");
        const references = getHeader(msg.headers, "References");

        const trackingId = extractTrackingId(inReplyTo) || extractTrackingId(references);
        const isBounce = BOUNCE_FROM_RE.test(fromHeader) || BOUNCE_SUBJECT_RE.test(subject);

        let prospectId: string | null = null;
        if (trackingId) {
          const { data: log } = await supabase
            .from("email_logs")
            .select("metadata")
            .eq("tracking_id", trackingId)
            .maybeSingle();
          const logMeta = (log?.metadata ?? {}) as Record<string, unknown>;
          prospectId = typeof logMeta.prospect_id === "string" ? logMeta.prospect_id : null;
        }

        if (isBounce) {
          result.bounced++;
          if (prospectId) {
            await supabase.from("prospects").update({ status: "bounced" }).eq("id", prospectId);
            await supabase.from("email_queue").update({ status: "cancelled" })
              .filter("metadata->>prospect_id", "eq", prospectId).eq("status", "pending");
          }
        } else if (trackingId && prospectId) {
          // Only counts as a genuine reply when it's tied back to a specific
          // sent email -- unmatched inbound mail is just regular mail to this
          // client's inbox, not something attributable to a prospect.
          result.replied++;
          await supabase.from("prospects").update({ status: "replied" }).eq("id", prospectId);
        }

        await client.setFlags(String(uid), ["\\Seen"], "add", true);
      } catch (msgErr) {
        console.error(`[clientMailboxPoll] ${clientId} uid=${uid}:`, msgErr);
      }
    }
  };

  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("IMAP poll timed out")), POLL_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.error(`[clientMailboxPoll] ${clientId}:`, err);
    result.error = err instanceof Error ? err.message : "IMAP poll failed";
  } finally {
    try {
      // deno-lint-ignore no-explicit-any
      await (client as any).close?.();
    } catch { /* best-effort */ }
  }

  return result;
}
