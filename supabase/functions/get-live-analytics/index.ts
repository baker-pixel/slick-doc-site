import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/http.ts";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { generatedLeadsOnly } from "../_shared/campaignBoundary.ts";
import { LATEST_PLUGIN_VERSION, pluginSupportsTracking } from "../_shared/pluginVersion.ts";

// Live view for the client portal Analytics tab. client_analytics only holds
// weekly snapshots, so between Mondays the portal would be up to a week stale.
// This computes "right now" on demand:
//   * traffic    -> the site's own pageview data, collected by the WordPress plugin
//   * engagement -> leads / opens / clicks for the last 7 days from prospects
// Nothing is written. The two parts are independent: a traffic problem never
// hides the engagement numbers.
//
// traffic.state tells the portal what to show:
//   no_site       no WordPress plugin connected yet            -> "connect the plugin"
//   needs_update  connected, but the plugin is older than 1.3.0 -> "install the new plugin"
//   off           visitor counting switched off for this site
//   waiting       plugin is current, no visit recorded yet
//   active        live numbers

type Traffic =
  | { state: "no_site" }
  | { state: "needs_update"; plugin_version: string | null; latest_version: string }
  | { state: "off" }
  | { state: "waiting" }
  | {
    state: "active";
    active_now: number;
    viewing: { path: string; visitors: number }[];
    daily: { day: string; visits: number; pageviews: number }[];
    visits_today: number;
    visits_7d: number;
    pageviews_7d: number;
    last_event_at: string | null;
  };

Deno.serve(async (req) => {
  const opts = handleOptions(req);
  if (opts) return opts;

  try {
    const { client_account_id } = await req.json().catch(() => ({}));
    if (!client_account_id) return errorResponse("client_account_id is required", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin (session/password) or a portal user who owns this client account.
    const auth = await checkClientOrAdminAuth(req, supabase, client_account_id);
    if (!auth.authorized) return errorResponse("Unauthorized", 401);

    const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const trafficPromise = (async (): Promise<Traffic> => {
      const { data: site, error } = await supabase
        .from("connected_sites")
        .select("id, status, plugin_version, tracking_enabled")
        .eq("client_id", client_account_id)
        .maybeSingle();
      if (error) throw error;
      if (!site || site.status === "disconnected" || site.status === "pending") return { state: "no_site" };
      if (!pluginSupportsTracking(site.plugin_version)) {
        return { state: "needs_update", plugin_version: site.plugin_version ?? null, latest_version: LATEST_PLUGIN_VERSION };
      }
      if (!site.tracking_enabled) return { state: "off" };

      const { data: live, error: liveErr } = await supabase.rpc("get_site_live_traffic", { p_site_id: site.id });
      if (liveErr) throw liveErr;
      if (!live || !live.last_event_at) return { state: "waiting" };
      return { state: "active", ...live };
    })().catch((e) => {
      // Don't take the whole response down; the portal shows its generic "unavailable" note.
      console.error("get-live-analytics traffic failed:", e);
      return null;
    });

    const engagementPromise = (async () => {
      const [leadsRes, opensRes, clicksRes] = await Promise.all([
        // Same definitions as send-weekly-recap / admin get_client_engagement_stats so live and snapshot numbers agree.
        generatedLeadsOnly(supabase.from("prospects").select("id", { count: "exact", head: true })
          .eq("client_id", client_account_id).gte("created_at", windowStart)),
        supabase.from("prospects").select("id", { count: "exact", head: true })
          .eq("client_id", client_account_id).gte("opened_at", windowStart),
        supabase.from("prospects").select("id", { count: "exact", head: true })
          .eq("client_id", client_account_id).gte("clicked_at", windowStart),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      if (opensRes.error) throw opensRes.error;
      if (clicksRes.error) throw clicksRes.error;
      return {
        leads_generated: leadsRes.count ?? 0,
        email_opens: opensRes.count ?? 0,
        email_clicks: clicksRes.count ?? 0,
      };
    })();

    const [traffic, engagement] = await Promise.all([trafficPromise, engagementPromise]);

    return jsonResponse({
      generated_at: new Date().toISOString(),
      window: "last_7_days",
      traffic, // null = couldn't be loaded right now
      engagement,
    });
  } catch (e) {
    console.error("get-live-analytics failed:", e);
    return errorResponse(e);
  }
});
