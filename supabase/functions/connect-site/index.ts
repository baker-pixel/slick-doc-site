import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isPublicSiteUrl,
  normalizeSiteUrl,
  pluginAcceptsToken,
  siteUrlVariants,
} from "../_shared/wpSite.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ConnectBody {
  site_url: string;
  token: string;
  wp_version?: string;
  plugin_version?: string;
  plugins?: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as ConnectBody;
    const { site_url, token, wp_version, plugin_version, plugins = [] } = body;

    if (!site_url || !token) return json({ error: "site_url and token required" }, 400);

    const normalizedUrl = normalizeSiteUrl(site_url);
    if (!normalizedUrl || !isPublicSiteUrl(normalizedUrl)) return json({ error: "Invalid site_url" }, 400);

    const yoastActive    = plugins.includes("yoast-seo");
    const rankmathActive = plugins.includes("rank-math");
    const variants = siteUrlVariants(normalizedUrl);

    // Find the existing row for this site under any http/https/www spelling
    // (prepare-connection may have stored what the client typed), preferring
    // an exact match.
    const { data: candidates } = await supabase
      .from("connected_sites")
      .select("id, client_id, token, site_url")
      .in("site_url", variants);
    const existing = candidates?.find((r) => r.site_url === normalizedUrl) ?? candidates?.[0] ?? null;

    // Token claim rules:
    //  - no token on file (new, pending, or disconnected): claim freely
    //  - same token (plugin reactivation / re-sync): idempotent
    //  - a DIFFERENT token: only if the plugin at that URL actually accepts
    //    it. That's what a genuine reinstall / site restore looks like (fresh
    //    od_secret_token) and previously left the site stuck on a 409 with no
    //    way out; a stranger who only knows the public URL can't pass this.
    if (existing?.token && existing.token !== token) {
      const proven = await pluginAcceptsToken(normalizedUrl, token);
      if (!proven) {
        return json({ error: "Site already connected with a different token" }, 409);
      }
    }

    // Match to a client: the row prepare-connection already linked wins,
    // else the URL the client stored in client_credentials.
    let clientId: string | null = existing?.client_id ?? null;
    if (!clientId) {
      const { data: creds } = await supabase
        .from("client_credentials")
        .select("client_id")
        .in("wordpress_url", variants)
        .limit(1)
        .maybeSingle();
      clientId = (creds?.client_id as string | undefined) ?? null;
    }

    const fields: Record<string, unknown> = {
      site_url:        normalizedUrl,
      token,
      status:          "connected",
      yoast_active:    yoastActive,
      rankmath_active: rankmathActive,
      wp_version:      wp_version ?? null,
      plugin_version:  plugin_version ?? "1.0.0",
      updated_at:      new Date().toISOString(),
    };
    if (clientId) fields.client_id = clientId;

    let siteId: string;
    if (existing) {
      const { error } = await supabase.from("connected_sites").update(fields).eq("id", existing.id);
      if (error) throw new Error("Failed to register site: " + error.message);
      siteId = existing.id;
    } else {
      const { data: site, error } = await supabase
        .from("connected_sites")
        .upsert(fields, { onConflict: "site_url" })
        .select("id")
        .single();
      if (error || !site) throw new Error("Failed to register site: " + (error?.message ?? "unknown"));
      siteId = site.id;
    }

    // Keep client_credentials in step with the live plugin token and URL --
    // the canonical seo-audit apply path reads them from there.
    if (clientId) {
      await supabase
        .from("client_credentials")
        .upsert(
          { client_id: clientId, wordpress_url: normalizedUrl, wordpress_plugin_api_key: token },
          { onConflict: "client_id" },
        );
    }

    // Fire-and-forget first scan; ClientSeoTab's auto-scan is the backstop.
    supabase.functions.invoke("scan-wordpress-site", { body: { site_id: siteId } }).catch(() => {});

    return json({ status: "connected", site_id: siteId, linked_to_client: !!clientId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("connect-site error:", msg);
    return json({ error: msg }, 500);
  }
});
