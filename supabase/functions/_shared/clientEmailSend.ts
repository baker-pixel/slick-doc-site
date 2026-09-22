import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

interface SmtpCredentialRow {
  access_token: string | null; // SMTP password
  page_id: string | null; // from address
  token_metadata: {
    host?: string;
    port?: number;
    username?: string;
    secure?: boolean;
    from_name?: string;
  } | null;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  listUnsubscribeUrl?: string;
  // Tags the outbound Message-ID so a reply/bounce landing back in the
  // client's own mailbox can be matched to this send via the standard
  // In-Reply-To/References headers -- see _shared/clientMailboxPoll.ts.
  trackingId?: string;
}

/**
 * Sends via the client's own connected SMTP mailbox so lead outreach lands
 * from an address the recipient can actually reply to, instead of the shared
 * no-reply sender. Returns false (never throws) whenever there's no
 * connected mailbox or the send fails, so callers can fall back to Resend --
 * a client's outreach must never silently stop just because their SMTP
 * credentials are wrong or a provider hiccuped.
 */
export async function sendViaClientEmail(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  clientId: string,
  args: SendArgs,
): Promise<{ sent: boolean; provider?: string; error?: string }> {
  try {
    const { data: row } = await supabase
      .from("client_oauth_tokens")
      .select("access_token, page_id, token_metadata")
      .eq("client_id", clientId)
      .eq("platform", "smtp")
      .maybeSingle();

    const cred = row as SmtpCredentialRow | null;
    const meta = cred?.token_metadata;
    if (!cred?.access_token || !cred.page_id || !meta?.host || !meta?.port || !meta?.username) {
      return { sent: false, error: "No SMTP credentials saved for this client" };
    }

    const client = new SMTPClient({
      connection: {
        hostname: meta.host,
        port: meta.port,
        tls: !!meta.secure,
        auth: { username: meta.username, password: cred.access_token },
      },
    });

    const fromHeader = meta.from_name ? `${meta.from_name} <${cred.page_id}>` : cred.page_id;
    const sendDomain = cred.page_id.split("@")[1] || "orangedoormarketing.com";
    const extraHeaders: Record<string, string> = {};
    if (args.trackingId) extraHeaders["Message-ID"] = `<odm-${args.trackingId}@${sendDomain}>`;
    if (args.listUnsubscribeUrl) {
      extraHeaders["List-Unsubscribe"] = `<${args.listUnsubscribeUrl}>`;
      extraHeaders["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    // denomailer's send() has no built-in timeout -- a stalled handshake
    // (bad host/port/TLS combo) hangs until the platform kills the whole
    // function, which returns a bare 503 with no CORS header instead of
    // our own JSON error. Race it so a stuck connection fails fast instead.
    // Racing alone isn't enough: Promise.race only stops US waiting, it
    // doesn't cancel the dangling client.send() call. If we don't also
    // force-close the socket on timeout, the abandoned connection keeps the
    // isolate alive until the platform kills it anyway -- same bare 503.
    const SEND_TIMEOUT_MS = 15_000;
    let timedOut = false;
    try {
      await Promise.race([
        client.send({
          from: fromHeader,
          to: args.to,
          subject: args.subject,
          content: "auto",
          html: args.html,
          ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
        }),
        new Promise((_, reject) =>
          setTimeout(() => {
            timedOut = true;
            reject(new Error("SMTP send timed out after 15s"));
          }, SEND_TIMEOUT_MS)
        ),
      ]);
    } finally {
      if (timedOut) {
        try {
          await client.close();
        } catch {
          // best-effort -- we're abandoning this connection either way
        }
      }
    }
    try {
      await client.close();
    } catch {
      // best-effort cleanup -- the send already succeeded above
    }

    return { sent: true, provider: "smtp" };
  } catch (err) {
    console.error("[clientEmailSend] SMTP send failed, caller should fall back to Resend:", err);
    return { sent: false, error: err instanceof Error ? err.message : "Unknown SMTP error" };
  }
}
