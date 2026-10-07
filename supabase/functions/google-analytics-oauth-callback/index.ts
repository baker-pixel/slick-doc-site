import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Client-initiated "Connect Google Analytics" flow, same shape as
// linkedin-oauth-callback -- but here the CLIENT is the one authorizing
// (they're the ones with a Google login that can see their own GA4
// property), which is what actually removes the manual
// "share your GA4 property with our service account" step. Lists the
// properties this login can see via the GA4 Admin API; sync-ga4-analytics
// reads client_accounts.ga4_property_id, so a single-property login is
// wired up immediately with no extra client action.
serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // client_account_id
  const errorParam = url.searchParams.get("error");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
  const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";
  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-analytics-oauth-callback`;
  // /portal only exists on the client. subdomain; APP_URL (marketing root) 404s on it.
  const APP_URL = Deno.env.get("CLIENT_PORTAL_URL") || "https://client.orangedoormarketing.com";

  const portalRedirect = (params: string) =>
    new Response(null, { status: 302, headers: { Location: `${APP_URL}/portal?tab=analytics&${params}` } });

  if (errorParam || !code || !state) {
    return portalRedirect("error=" + encodeURIComponent(errorParam || "missing_code"));
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return portalRedirect("error=" + encodeURIComponent("Google OAuth not configured. Contact your admin."));
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Google token exchange failed:", errText);
      return portalRedirect("error=" + encodeURIComponent("Token exchange failed"));
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 3600;
    const refreshToken = tokenData.refresh_token || null;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    if (!refreshToken) {
      // Google only returns a refresh_token on the first consent -- if this
      // client reconnected without revoking access first, prompt=consent
      // should have forced a new one, but if it's still missing we can't
      // silently refresh later. Fail loud rather than storing a token that
      // dies in an hour with no way to renew it.
      return portalRedirect("error=" + encodeURIComponent(
        "Google didn't return a refresh token. Revoke access at https://myaccount.google.com/permissions and reconnect.",
      ));
    }

    // List GA4 properties this login can see (GA4 Admin API).
    const summaryRes = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let properties: Array<{ id: string; name: string }> = [];
    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      for (const account of summary.accountSummaries ?? []) {
        for (const p of account.propertySummaries ?? []) {
          // p.property is "properties/123456789"
          const id = String(p.property || "").split("/").pop();
          if (id) properties.push({ id, name: p.displayName || id });
        }
      }
    } else {
      console.warn("GA4 accountSummaries lookup failed:", await summaryRes.text());
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    await supabase
      .from("client_oauth_tokens")
      .delete()
      .eq("client_id", state)
      .eq("platform", "google_analytics");

    const singleProperty = properties.length === 1 ? properties[0] : null;

    const { error: insertErr } = await supabase.from("client_oauth_tokens").insert({
      client_id: state,
      platform: "google_analytics",
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      page_id: singleProperty?.id || null,
      token_metadata: {
        properties,
        selection_required: properties.length > 1,
      },
    });

    if (insertErr) {
      console.error("DB insert error:", insertErr);
      return portalRedirect("error=" + encodeURIComponent("Failed to save token"));
    }

    if (singleProperty) {
      const { error: propErr } = await supabase
        .from("client_accounts")
        .update({ ga4_property_id: singleProperty.id })
        .eq("id", state);
      if (propErr) console.error("Failed to set ga4_property_id:", propErr);
    }

    return portalRedirect("connected=google_analytics&success=true");
  } catch (err) {
    console.error("Google Analytics OAuth error:", err);
    return portalRedirect("error=" + encodeURIComponent("Unexpected error"));
  }
});
