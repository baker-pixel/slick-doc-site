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
//
// Per-client auth: prefers a client_oauth_tokens row (from the client's own
// "Connect Google Analytics" OAuth flow, google-analytics-oauth-callback)
// and falls back to the shared service-account credential in
// integration_configs (the older "share your property with our service
// account" manual setup) only when no such row exists.

interface ClientRow {
  id: string;
  business_name: string;
  ga4_property_id: string | null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";

// A client who connected via the "Connect Google Analytics" OAuth flow has
// their own token in client_oauth_tokens instead of relying on the shared
// service account -- refresh it here if it's stale (access tokens are
// 1hr-lived) so the weekly sync doesn't need a separate refresh cron.
async function getClientOAuthToken(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
): Promise<string | null> {
  const { data: token } = await supabase
    .from("client_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("client_id", clientId)
    .eq("platform", "google_analytics")
    .maybeSingle();
  if (!token) return null;

  if (token.expires_at && new Date(token.expires_at) > new Date(Date.now() + 60_000)) {
    return token.access_token as string;
  }
  if (!token.refresh_token || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return token.access_token as string; // best effort -- let the report call fail loudly if it's actually expired
  }

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token as string,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    }),
  });
  if (!refreshRes.ok) {
    console.error("Google token refresh failed:", await refreshRes.text());
    return token.access_token as string;
  }
  const refreshed = await refreshRes.json();
  const expiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();
  await supabase
    .from("client_oauth_tokens")
    .update({ access_token: refreshed.access_token, expires_at: expiresAt })
    .eq("client_id", clientId)
    .eq("platform", "google_analytics");
  return refreshed.access_token as string;
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

    // Shared service-account fallback for clients who did the old manual
    // "grant our service account Viewer access" setup instead of the OAuth
    // connect flow. Not required up front -- a client with their own
    // client_oauth_tokens row never touches this.
    const { data: config, error: configError } = await supabase
      .from("integration_configs")
      .select("settings")
      .eq("integration_type", "google_analytics")
      .eq("is_active", true)
      .maybeSingle();
    if (configError) throw configError;
    const settings = (config?.settings || {}) as { client_email?: string; private_key?: string };
    let sharedAccessToken: string | null = null;
    const getSharedAccessToken = async (): Promise<string> => {
      if (sharedAccessToken) return sharedAccessToken;
      if (!settings.client_email || !settings.private_key) {
        throw new Error("No active google_analytics integration configured (client_email/private_key missing) -- add one in Admin > Integrations");
      }
      sharedAccessToken = await getGoogleAccessToken(
        settings as { client_email: string; private_key: string },
        "https://www.googleapis.com/auth/analytics.readonly",
      );
      return sharedAccessToken;
    };

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

    const periodEnd = new Date();
    periodEnd.setUTCDate(periodEnd.getUTCDate() - 1); // yesterday -- GA4 same-day data is incomplete
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - 6); // trailing 7-day window
    const periodStartStr = isoDate(periodStart);
    const periodEndStr = isoDate(periodEnd);

    for (const client of (clients ?? []) as ClientRow[]) {
      try {
        const accessToken = (await getClientOAuthToken(supabase, client.id)) ?? (await getSharedAccessToken());
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
