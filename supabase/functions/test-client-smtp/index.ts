import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaClientEmail } from "../_shared/clientEmailSend.ts";

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
      .select("page_id")
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

    if (!result.sent) {
      return new Response(JSON.stringify({ error: "Send failed — check host, port, username, and password" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("test-client-smtp error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
