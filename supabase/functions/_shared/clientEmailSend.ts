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
): Promise<{ sent: boolean; provider?: string }> {
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
      return { sent: false };
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

    await client.send({
      from: fromHeader,
      to: args.to,
      subject: args.subject,
      content: "auto",
      html: args.html,
      ...(args.listUnsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${args.listUnsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
    });
    await client.close();

    return { sent: true, provider: "smtp" };
  } catch (err) {
    console.error("[clientEmailSend] SMTP send failed, caller should fall back to Resend:", err);
    return { sent: false };
  }
}
