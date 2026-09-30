import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { isPublicSiteUrl, normalizeSiteUrl, siteUrlVariants } from "../_shared/wpSite.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { client_id, site_url, password } = await req.json();
    if (!client_id || !site_url) return json({ error: "client_id and site_url required" }, 400);

    // This rewrites which client a WordPress site belongs to and which URL
    // fixes are written to -- it was previously open to anyone who knew a
    // client id. Caller must be an admin or a portal user of that client.
    const auth = await checkClientOrAdminAuth(req, supabase, client_id, password);
    if (!auth.authorized) return json({ error: "Unauthorized" }, 401);

    const normalizedUrl = normalizeSiteUrl(site_url);
    if (!normalizedUrl || !isPublicSiteUrl(normalizedUrl)) {
      return json({ error: "Enter a valid public website address, e.g. https://yoursite.com" }, 400);
    }

    // connect-site matches the plugin's get_site_url() against this value
    // (www/http spellings are tolerated on that side too).
    const { error: credErr } = await supabase
      .from("client_credentials")
      .upsert({ client_id, wordpress_url: normalizedUrl }, { onConflict: "client_id" });
    if (credErr) throw new Error("Failed to store credentials: " + credErr.message);

    const variants = siteUrlVariants(normalizedUrl);

    // The plugin may have registered this site already (client_id still null).
    const { data: byUrl } = await supabase
      .from("connected_sites")
      .select("id, client_id, site_url")
      .in("site_url", variants)
      .limit(1)
      .maybeSingle();

    if (byUrl?.client_id && byUrl.client_id !== client_id) {
      return json({ error: "This website is already linked to another account. Contact support if that's a mistake." }, 409);
    }

    const { data: byClient } = await supabase
      .from("connected_sites")
      .select("id, site_url, status")
      .eq("client_id", client_id);

    if (byUrl) {
      // Plugin already called connect-site (or this is a repeat click): keep
      // its row and status as-is, just make sure it's linked to this client.
      const { error } = await supabase
        .from("connected_sites")
        .update({ client_id, updated_at: new Date().toISOString() })
        .eq("id", byUrl.id);
      if (error) throw error;

      // One site per client: retire any other row this client had (typo'd or
      // previous URL) so the portal never has to guess which one is current.
      for (const old of (byClient ?? []).filter((r) => r.id !== byUrl.id)) {
        await supabase.from("connected_sites").delete().eq("id", old.id);
      }
    } else if (byClient && byClient.length > 0) {
      // The client changed their site URL. The old token belongs to the old
      // site, so start a fresh pending connection on the same row.
      const [keep, ...extra] = byClient;
      const { error } = await supabase
        .from("connected_sites")
        .update({
          site_url: normalizedUrl,
          token: "",
          status: "pending",
          last_scanned_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", keep.id);
      if (error) throw error;
      await supabase
        .from("client_credentials")
        .update({ wordpress_plugin_api_key: null })
        .eq("client_id", client_id);
      for (const old of extra) await supabase.from("connected_sites").delete().eq("id", old.id);
    } else {
      const { error } = await supabase
        .from("connected_sites")
        .insert({ client_id, site_url: normalizedUrl, token: "", status: "pending" });
      if (error) throw error;
    }

    return json({ ok: true, site_url: normalizedUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("prepare-connection error:", msg);
    return json({ error: msg }, 500);
  }
});
