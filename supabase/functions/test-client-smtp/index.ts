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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
