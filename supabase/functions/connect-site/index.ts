import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ConnectBody {
  site_url: string;
  token: string;
  wp_version?: string;
  plugins?: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as ConnectBody;
    const { site_url, token, wp_version, plugins = [] } = body;

    if (!site_url || !token) {
      return new Response(JSON.stringify({ error: "site_url and token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedUrl = site_url.trim().replace(/\/+$/, "");
    const yoastActive    = plugins.includes("yoast-seo");
    const rankmathActive = plugins.includes("rank-math");

    // Idempotent claim: a site can be (re-)registered with the token it
    // already has on file (e.g. plugin reactivation resends the same
    // od_secret_token) or claimed fresh if no token is on file yet. Once a
    // real token is stored, a request bearing a *different* token is
    // rejected -- otherwise anyone who knows a client's public site_url
    // could silently overwrite their stored token and break the fix/scan
    // pipeline for that site.
    const { data: currentSite } = await supabase
      .from("connected_sites")
      .select("token")
      .eq("site_url", normalizedUrl)
      .maybeSingle();

    if (currentSite?.token && currentSite.token !== token) {
      return new Response(
        JSON.stringify({ error: "Site already connected with a different token" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Match to a client via previously stored wordpress_url in client_credentials
    let clientId: string | null = null;
    const { data: creds } = await supabase
      .from("client_credentials")
      .select("client_id")
      .ilike("wordpress_url", normalizedUrl)
      .maybeSingle();

    if (creds?.client_id) {
      clientId = creds.client_id as string;
      // Keep client_credentials in sync with the live plugin token
      await supabase
        .from("client_credentials")
        .update({ wordpress_plugin_api_key: token })
        .eq("client_id", clientId);
    }

    // Upsert connected_sites (unique on site_url).
    // Only set client_id if we resolved one — avoids overwriting the value
    // that prepare-connection already stored when the credentials lookup misses.
    const upsertPayload: Record<string, unknown> = {
      site_url:        normalizedUrl,
      token,
      status:          "connected",
      yoast_active:    yoastActive,
      rankmath_active: rankmathActive,
      wp_version:      wp_version ?? null,
      plugin_version:  "1.0.0",
      updated_at:      new Date().toISOString(),
    };
    if (clientId) upsertPayload.client_id = clientId;

    const { data: site, error: siteErr } = await supabase
      .from("connected_sites")
      .upsert(upsertPayload, { onConflict: "site_url" })
      .select("id")
      .single();

    if (siteErr || !site) {
      throw new Error("Failed to register site: " + (siteErr?.message ?? "unknown"));
    }

    // Fire-and-forget: trigger first scan async
    supabase.functions.invoke("scan-wordpress-site", {
      body: { site_id: site.id },
    }).catch(() => {});

    return new Response(
      JSON.stringify({ status: "connected", site_id: site.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("connect-site error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
