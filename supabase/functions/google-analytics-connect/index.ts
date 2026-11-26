import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse, errorResponse } from "../_shared/core/http.ts";
import { checkClientOrAdminAuth } from "../_shared/core/auth.ts";
import { SCOPES, redirectUri, safeReturnOrigin, signState, tokenRequest } from "../_shared/google/oauth.ts";
import { decryptToken, encryptToken } from "../_shared/google/tokenCrypto.ts";

// Portal-facing API for the client's Google Analytics connection. One endpoint, several actions:
//   status | start | properties | select_property | report | disconnect
// Tokens never leave this function; the browser only ever sees status + report numbers.

class NeedsReconnect extends Error {}

async function getAccessToken(supabase: SupabaseClient, conn: any): Promise<string> {
  if (conn.access_token_enc && conn.expires_at && new Date(conn.expires_at).getTime() - Date.now() > 60_000) {
    return await decryptToken(conn.access_token_enc);
  }
  const refresh = await decryptToken(conn.refresh_token_enc);
  const r = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  if (!r.ok) {
    // invalid_grant = revoked/expired (Testing-mode tokens last 7 days) -> ask the client to reconnect.
    if (r.body?.error === "invalid_grant") {
      await supabase.from("google_analytics_connections").update({ status: "needs_reconnect", updated_at: new Date().toISOString() }).eq("id", conn.id);
      throw new NeedsReconnect();
    }
    throw new Error(`Google token refresh failed (${r.status})`);
  }
  await supabase.from("google_analytics_connections").update({
    access_token_enc: await encryptToken(r.body.access_token),
    expires_at: new Date(Date.now() + (Number(r.body.expires_in) || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", conn.id);
  return r.body.access_token;
}

async function google(token: string, url: string, body?: unknown) {
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("google api error:", url, r.status, JSON.stringify(j?.error ?? j).slice(0, 300));
    throw new Error(r.status === 403 ? "Google denied access to this property. Check the account's permissions." : `Google API error (${r.status})`);
  }
  return j;
}

const listProperties = async (token: string) => {
  const j = await google(token, "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200");
  return (j.accountSummaries ?? []).flatMap((a: any) =>
    (a.propertySummaries ?? []).map((p: any) => ({ id: p.property as string, name: p.displayName as string, account: a.displayName as string })));
};

Deno.serve(async (req) => {
  const opts = handleOptions(req);
  if (opts) return opts;

  try {
    const { action, client_account_id, ...args } = await req.json().catch(() => ({}));
    if (!client_account_id || !action) return errorResponse("action and client_account_id are required", 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = await checkClientOrAdminAuth(req, supabase, client_account_id);
    if (!auth.authorized) return errorResponse("Unauthorized", 401);

    const { data: conn } = await supabase.from("google_analytics_connections")
      .select("*").eq("client_id", client_account_id).maybeSingle();

    if (action === "status") {
      return jsonResponse({
        connected: !!conn,
        needs_reconnect: conn?.status === "needs_reconnect",
        email: conn?.google_email ?? null,
        property: conn?.property_id ? { id: conn.property_id, name: conn.property_name } : null,
      });
    }

    if (action === "start") {
      const state = await signState({ c: client_account_id, u: auth.userId, o: safeReturnOrigin(args.return_origin) });
      const q = new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, redirect_uri: redirectUri(), response_type: "code",
        scope: SCOPES.join(" "), access_type: "offline", prompt: "consent select_account",
        include_granted_scopes: "true", state,
      });
      return jsonResponse({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
    }

    if (action === "disconnect") {
      if (conn) {
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(await decryptToken(conn.refresh_token_enc))}`, { method: "POST" });
        } catch (e) { console.error("google revoke failed (continuing):", e); }
        const { error } = await supabase.from("google_analytics_connections").delete().eq("id", conn.id);
        if (error) throw error;
      }
      return jsonResponse({ ok: true });
    }

    // Everything below needs a live connection.
    if (!conn) return jsonResponse({ state: "not_connected" });
    if (conn.status === "needs_reconnect") return jsonResponse({ state: "needs_reconnect" });

    try {
      const token = await getAccessToken(supabase, conn);

      if (action === "properties") return jsonResponse({ properties: await listProperties(token) });

      if (action === "select_property") {
        const id = String(args.property_id ?? "");
        if (!/^properties\/\d+$/.test(id)) return errorResponse("Invalid property", 400);
        // Only accept a property this Google account can actually see.
        const match = (await listProperties(token)).find((p: any) => p.id === id);
        if (!match) return errorResponse("That property isn't available to this Google account.", 400);
        const { error } = await supabase.from("google_analytics_connections")
          .update({ property_id: match.id, property_name: match.name, updated_at: new Date().toISOString() }).eq("id", conn.id);
        if (error) throw error;
        return jsonResponse({ ok: true, property: { id: match.id, name: match.name } });
      }

      if (action === "report") {
        if (!conn.property_id) return jsonResponse({ state: "no_property" });
        // Window = the last N days including today; "previous" is the N days before that.
        const days = [7, 28, 90].includes(Number(args.days)) ? Number(args.days) : 28;
        const cur = { startDate: `${days - 1}daysAgo`, endDate: "today" };
        const prev = { startDate: `${days * 2 - 1}daysAgo`, endDate: `${days}daysAgo` };
        const j = await google(token, `https://analyticsdata.googleapis.com/v1beta/${conn.property_id}:batchRunReports`, {
          requests: [
            { // 0: daily trend
              dateRanges: [cur],
              dimensions: [{ name: "date" }],
              metrics: [{ name: "sessions" }, { name: "activeUsers" }],
              orderBys: [{ dimension: { dimensionName: "date" } }],
            },
            { // 1: totals, this 28 days vs the 28 before
              dateRanges: [cur, prev],
              metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }, { name: "engagementRate" }],
            },
            { // 2: top pages
              dateRanges: [cur],
              dimensions: [{ name: "pagePath" }],
              metrics: [{ name: "screenPageViews" }],
              orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
              limit: 5,
            },
            { // 3: channels
              dateRanges: [cur],
              dimensions: [{ name: "sessionDefaultChannelGroup" }],
              metrics: [{ name: "sessions" }],
              orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
              limit: 5,
            },
          ],
        });
        const [daily, totals, pages, channels] = j.reports ?? [];
        const num = (v: any) => Number(v?.value ?? 0);
        const tot = (rangeIdx: number) => {
          const row = (totals?.rows ?? []).find((r: any) => r.dimensionValues?.[0]?.value === `date_range_${rangeIdx}`) ?? totals?.rows?.[rangeIdx];
          const m = row?.metricValues ?? [];
          return { sessions: num(m[0]), users: num(m[1]), pageviews: num(m[2]), engagement_rate: num(m[3]) };
        };
        return jsonResponse({
          state: "active",
          days,
          property: { id: conn.property_id, name: conn.property_name },
          email: conn.google_email,
          current: tot(0),
          previous: tot(1),
          daily: (daily?.rows ?? []).map((r: any) => {
            const d = r.dimensionValues[0].value as string;
            return { day: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, sessions: num(r.metricValues[0]), users: num(r.metricValues[1]) };
          }),
          top_pages: (pages?.rows ?? []).map((r: any) => ({ path: r.dimensionValues[0].value, views: num(r.metricValues[0]) })),
          channels: (channels?.rows ?? []).map((r: any) => ({ channel: r.dimensionValues[0].value, sessions: num(r.metricValues[0]) })),
          generated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      if (e instanceof NeedsReconnect) return jsonResponse({ state: "needs_reconnect" });
      throw e;
    }

    return errorResponse("Unknown action", 400);
  } catch (e) {
    console.error("google-analytics-connect failed:", e);
    return errorResponse(e);
  }
});
