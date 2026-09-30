import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { removePluginFromSite } from "../_shared/wpSite.ts";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";

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

    const { site_id, password } = await req.json();
    if (!site_id) {
      return new Response(JSON.stringify({ error: "site_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authorize: an admin (session OR the admin-panel password -- RLS on a
    // user client can't see the password case), or a portal user who owns
    // the site's client account.
    const { data: target } = await supabase
      .from("connected_sites")
      .select("client_id")
      .eq("id", site_id)
      .maybeSingle();
    if (!target) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const auth = await checkClientOrAdminAuth(req, supabase, target.client_id, password);
    if (!auth.authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clear the token, not just the status label -- otherwise a
    // "disconnected" site keeps working forever (confirmed live: a fix
    // could still be applied to it), and the portal shows a misleading
    // "reconnect from scratch" flow for an integration that never actually
    // stopped working.
    const { data: site } = await supabase
      .from("connected_sites")
      .select("client_id, site_url, token")
      .eq("id", site_id)
      .maybeSingle();

    // Ask the plugin to deactivate and delete itself (needs the token we're
    // about to erase). Best-effort: an unreachable or pre-1.2 plugin still
    // gets disconnected on our side, and the result tells the UI whether the
    // owner has to remove the plugin by hand.
    const plugin = site?.token
      ? await removePluginFromSite(site.site_url, site.token)
      : { reached: false, deactivated: false, removed: false };

    const { error: updErr } = await supabase
      .from("connected_sites")
      .update({ status: "disconnected", token: "", updated_at: new Date().toISOString() })
      .eq("id", site_id);
    if (updErr) throw new Error("Could not disconnect: " + updErr.message);

    if (site?.client_id) {
      await supabase
        .from("client_credentials")
        .update({ wordpress_plugin_api_key: null })
        .eq("client_id", site.client_id);
    }

    return new Response(JSON.stringify({ ok: true, plugin }), {
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
