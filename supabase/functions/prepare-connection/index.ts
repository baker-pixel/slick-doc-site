import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { client_id, site_url } = await req.json();

    if (!client_id || !site_url) {
      return new Response(JSON.stringify({ error: "client_id and site_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedUrl = site_url.trim().replace(/\/+$/, "");

    // Store site_url in client_credentials so connect-site can match the client
    // when the plugin activates and POSTs its token
    await supabase
      .from("client_credentials")
      .upsert({ client_id, wordpress_url: normalizedUrl }, { onConflict: "client_id" });

    // Pre-create a pending connected_sites record so the dashboard can show
    // "waiting for plugin" state before the plugin activates
    const { error: siteErr } = await supabase
      .from("connected_sites")
      .upsert(
        {
          client_id,
          site_url: normalizedUrl,
          token: "",          // placeholder — overwritten by connect-site on activation
          status: "pending",
        },
        { onConflict: "site_url" },
      );

    if (siteErr) throw siteErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("prepare-connection error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
