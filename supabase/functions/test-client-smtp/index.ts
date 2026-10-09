import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaClientEmail } from "../_shared/clientEmailSend.ts";
import { ImapLite } from "../_shared/imapLite.ts";
import { inferImapHost } from "../_shared/clientMailboxPoll.ts";
import { domainOf, lookupMx } from "../_shared/mailboxHealth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId } = await req.json();
    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Caller must be a portal user of this client, or an admin -- same check
    // every other client-portal edge function does, since verify_jwt is off
    // and clientId alone would otherwise let anyone probe/trigger sends for
    // any client's connected mailbox.
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("client_account_id", clientId)
      .maybeSingle();
    if (!portalUser) {
      const { data: isAdmin } = await supabase.rpc("has_role", { _role: "admin", _user_id: user.id });
      if (isAdmin !== true) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: cred } = await supabase
      .from("client_oauth_tokens")
      .select("page_id, access_token, token_metadata")
      .eq("client_id", clientId)
      .eq("platform", "smtp")
      .maybeSingle();

    if (!cred?.page_id) {
      return new Response(JSON.stringify({ error: "No SMTP credentials saved for this client" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send to itself -- proves the credentials actually work end-to-end
    // without needing a real prospect to test against.
    const result = await sendViaClientEmail(supabase, clientId, {
      to: cred.page_id,
      subject: "Test email — your outreach sender is connected",
      html: "<p>This is a test email confirming your SMTP connection works. Lead outreach emails will now send from this address.</p>",
    });

    // Record verification status on the row itself so the portal can show
    // "needs verification" instead of a bare "Connected" for a mailbox that
    // has never actually been proven to send/receive (see the bad from-email
    // bounce this was added for -- saving a row never confirmed deliverability).
    const meta = { ...(cred.token_metadata as Record<string, unknown> ?? {}) };
    if (result.sent) {
      meta.verified = true;
      meta.verified_at = new Date().toISOString();
      delete meta.last_test_error;
    } else {
      meta.verified = false;
      meta.last_test_error = result.error ?? "Send failed";
      meta.last_tested_at = new Date().toISOString();
    }
    // Sending is only half of the connection: replies must be able to come
    // back AND be read. Both checks only record warnings -- they never flip
    // `verified`, which still means "can send".
    const warnings: string[] = [];
    if (result.sent) {
      const domain = domainOf(cred.page_id);
      const mx = domain ? await lookupMx(domain) : ({ status: "error", error: "no from address" } as const);
      if (mx.status === "none") {
        warnings.push(`${domain} has no MX record, so replies to your outreach cannot be delivered. Add MX records at your domain's DNS provider.`);
      }
      const m = meta as { host?: string; username?: string };
      let imapError: string | null = null;
      if (m.host && m.username) {
        const imap = new ImapLite({ host: inferImapHost(m.host), port: 993, timeoutMs: 10_000 });
        try {
          await imap.connect();
          await imap.login(m.username, (cred as { access_token?: string }).access_token ?? "");
          await imap.examine("INBOX");
        } catch (e) {
          imapError = e instanceof Error ? e.message : "IMAP login failed";
        } finally {
          try { await imap.close(); } catch { /* best-effort */ }
        }
      }
      if (imapError) warnings.push(`We can send from this mailbox but could not read its inbox over IMAP (${imapError}), so replies will not be detected.`);
      meta.mailbox_checks = {
        checked_at: new Date().toISOString(),
        mx: mx.status,
        imap_ok: !imapError,
        ...(imapError ? { imap_error: imapError } : {}),
      };
    }
    await supabase
      .from("client_oauth_tokens")
      .update({ token_metadata: meta })
      .eq("client_id", clientId)
      .eq("platform", "smtp");

    if (!result.sent) {
      return new Response(JSON.stringify({ error: result.error ? `Send failed: ${result.error}` : "Send failed — check host, port, username, and password" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, ...(warnings.length ? { warnings } : {}) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("test-client-smtp error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
