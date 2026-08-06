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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { site_id } = await req.json();
    if (!site_id) {
      return new Response(JSON.stringify({ error: "site_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller owns this site via RLS
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { authorization: authHeader } } },
    );
    const { data: owned } = await userClient
      .from("connected_sites")
      .select("id")
      .eq("id", site_id)
      .maybeSingle();

    if (!owned) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to update status
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Clear the token, not just the status label -- otherwise a
    // "disconnected" site keeps working forever (confirmed live: a fix
    // could still be applied to it), and the portal shows a misleading
    // "reconnect from scratch" flow for an integration that never actually
    // stopped working.
    const { data: site } = await supabase
      .from("connected_sites")
      .select("client_id")
      .eq("id", site_id)
      .maybeSingle();

    await supabase
      .from("connected_sites")
      .update({ status: "disconnected", token: "", updated_at: new Date().toISOString() })
      .eq("id", site_id);

    if (site?.client_id) {
      await supabase
        .from("client_credentials")
        .update({ wordpress_plugin_api_key: null })
        .eq("client_id", site.client_id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("disconnect-site error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
