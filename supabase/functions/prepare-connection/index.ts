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

    const normalizedUrl = site_url.trim().replace(/\/+$/, "").replace(/\/wp-admin\/?$/i, "");

    // Store site_url in client_credentials so connect-site can match the client
    // when the plugin activates and POSTs its token
    const { error: credErr } = await supabase
      .from("client_credentials")
      .upsert({ client_id, wordpress_url: normalizedUrl }, { onConflict: "client_id" });
    if (credErr) throw new Error("Failed to store credentials: " + credErr.message);

    // Check if the plugin already registered this site (client_id may be null)
    const { data: existing } = await supabase
      .from("connected_sites")
      .select("id, token, status")
      .eq("site_url", normalizedUrl)
      .maybeSingle();

    if (existing) {
      // Plugin already called connect-site — just patch in the client_id
      const { error: siteErr } = await supabase
        .from("connected_sites")
        .update({ client_id, updated_at: new Date().toISOString() })
        .eq("site_url", normalizedUrl);
      if (siteErr) throw siteErr;
    } else {
      // Plugin hasn't activated yet — pre-create pending record
      const { error: siteErr } = await supabase
        .from("connected_sites")
        .insert({ client_id, site_url: normalizedUrl, token: "", status: "pending" });
      if (siteErr) throw siteErr;
    }

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
