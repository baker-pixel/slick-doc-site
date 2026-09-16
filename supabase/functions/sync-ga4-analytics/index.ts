import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/http.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import { getGoogleAccessToken } from "../_shared/googleServiceAccount.ts";

// Weekly cron (see migration 20260916120000): for every active client with a
// ga4_property_id set, pulls last-7-days Sessions from the GA4 Data API and
// upserts it into client_analytics.metrics.website_visits -- the same field
// the client portal Home tab already reads, so no downstream change is
// needed. A request naming a single `client_id` is instead an admin
// manually re-running the pull for one client from the analytics panel;
// that path requires admin auth, same shape as auto-discover-prospects'
// manual-trigger mode.

interface ClientRow {
  id: string;
  business_name: string;
  ga4_property_id: string | null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  const opts = handleOptions(req);
  if (opts) return opts;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Record<string, string> = {};

  try {
    const { client_id: onlyClientId, password } = await req.json().catch(() => ({}));

    if (onlyClientId) {
      const auth = await checkAdminAuth(req, supabase, password);
      if (!auth.authorized) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: config, error: configError } = await supabase
      .from("integration_configs")
      .select("settings")
      .eq("integration_type", "google_analytics")
      .eq("is_active", true)
      .maybeSingle();

    if (configError) throw configError;
    const settings = (config?.settings || {}) as { client_email?: string; private_key?: string };
    if (!settings.client_email || !settings.private_key) {
      const msg = "No active google_analytics integration configured (client_email/private_key missing) -- add one in Admin > Integrations";
      if (onlyClientId) {
        return new Response(JSON.stringify({ error: msg }), {
          status: 412,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(msg);
    }

    const clientQuery = supabase
      .from("client_accounts")
      .select("id, business_name, ga4_property_id")
      .eq("status", "active")
      .not("ga4_property_id", "is", null);
    const { data: clients, error } = onlyClientId
      ? await clientQuery.eq("id", onlyClientId)
      : await clientQuery;
    if (error) throw error;

    if (onlyClientId && (clients ?? []).length === 0) {
      return new Response(JSON.stringify({ error: "Client not found, inactive, or has no GA4 Property ID set" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getGoogleAccessToken(
      settings as { client_email: string; private_key: string },
      "https://www.googleapis.com/auth/analytics.readonly",
    );

    const periodEnd = new Date();
    periodEnd.setUTCDate(periodEnd.getUTCDate() - 1); // yesterday -- GA4 same-day data is incomplete
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - 6); // trailing 7-day window
    const periodStartStr = isoDate(periodStart);
    const periodEndStr = isoDate(periodEnd);

    for (const client of (clients ?? []) as ClientRow[]) {
      try {
        const reportRes = await fetch(
          `https://analyticsdata.googleapis.com/v1beta/properties/${client.ga4_property_id}:runReport`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              dateRanges: [{ startDate: periodStartStr, endDate: periodEndStr }],
              metrics: [{ name: "sessions" }],
            }),
          },
        );

        if (!reportRes.ok) {
          const body = await reportRes.text();
          throw new Error(`GA4 API ${reportRes.status}: ${body}`);
        }

        const report = await reportRes.json();
        const sessions = Number(report?.rows?.[0]?.metricValues?.[0]?.value ?? 0);

        const { data: existing } = await supabase
          .from("client_analytics")
          .select("id, metrics")
          .eq("client_account_id", client.id)
          .eq("period_start", periodStartStr)
          .eq("period_end", periodEndStr)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("client_analytics")
            .update({ metrics: { ...(existing.metrics as Record<string, number>), website_visits: sessions } })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("client_analytics")
            .insert({
              client_account_id: client.id,
              period_start: periodStartStr,
              period_end: periodEndStr,
              metrics: { website_visits: sessions },
            });
        }

        results[client.id] = `synced: ${sessions} sessions (${periodStartStr} to ${periodEndStr})`;
      } catch (e) {
        results[client.id] = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-ga4-analytics failed:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e), results }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
