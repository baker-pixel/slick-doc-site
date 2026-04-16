import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // client_account_id
  const errorParam = url.searchParams.get("error");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APP_ID = Deno.env.get("FACEBOOK_APP_ID") || "";
  const APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET") || "";
  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;
  const APP_URL = Deno.env.get("APP_URL") || "https://slick-doc-site.lovable.app";

  const portalRedirect = (params: string) =>
    new Response(null, { status: 302, headers: { Location: `${APP_URL}/portal?tab=integrations&${params}` } });

  if (errorParam || !code || !state) {
    return portalRedirect("error=" + encodeURIComponent(errorParam || "missing_code"));
  }

  if (!APP_ID || !APP_SECRET) {
    return portalRedirect("error=" + encodeURIComponent("Facebook OAuth not configured. Contact your admin."));
  }

  try {
    // Exchange code for short-lived user token
    const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", APP_ID);
    tokenUrl.searchParams.set("client_secret", APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    if (!tokenRes.ok) {
      console.error("Facebook token exchange failed:", await tokenRes.text());
      return portalRedirect("error=" + encodeURIComponent("Token exchange failed"));
    }

    const tokenData = await tokenRes.json();
    let accessToken = tokenData.access_token;
    let expiresIn = tokenData.expires_in || 5184000;

    // Exchange for long-lived token
    try {
      const longUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
      longUrl.searchParams.set("grant_type", "fb_exchange_token");
      longUrl.searchParams.set("client_id", APP_ID);
      longUrl.searchParams.set("client_secret", APP_SECRET);
      longUrl.searchParams.set("fb_exchange_token", accessToken);

      const longRes = await fetch(longUrl.toString());
      if (longRes.ok) {
        const longData = await longRes.json();
        accessToken = longData.access_token || accessToken;
        expiresIn = longData.expires_in || expiresIn;
      }
    } catch { /* use short-lived if long-lived fails */ }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Get page access token (first page)
    let pageId = null;
    let pageName = null;
    let pageToken = accessToken;
    try {
      const pagesRes = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
      );
      if (pagesRes.ok) {
        const pagesData = await pagesRes.json();
        const firstPage = pagesData.data?.[0];
        if (firstPage) {
          pageId = firstPage.id;
          pageName = firstPage.name;
          pageToken = firstPage.access_token || accessToken;
        }
      }
    } catch { /* ignore */ }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    await supabase.from("client_oauth_tokens").delete().eq("client_id", state).eq("platform", "facebook");

    const { error: insertErr } = await supabase.from("client_oauth_tokens").insert({
      client_id: state,
      platform: "facebook",
      access_token: pageToken,
      expires_at: expiresAt,
      page_id: pageId,
      token_metadata: { page_name: pageName || "Facebook Page" },
    });

    if (insertErr) {
      console.error("DB insert error:", insertErr);
      return portalRedirect("error=" + encodeURIComponent("Failed to save token"));
    }

    return portalRedirect("connected=facebook&success=true");
  } catch (err) {
    console.error("Facebook OAuth error:", err);
    return portalRedirect("error=" + encodeURIComponent("Unexpected error"));
  }
});
