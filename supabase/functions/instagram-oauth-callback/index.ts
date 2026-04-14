import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APP_ID = Deno.env.get("FACEBOOK_APP_ID") || "";
  const APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET") || "";
  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/instagram-oauth-callback`;

  const portalRedirect = (params: string) =>
    new Response(null, { status: 302, headers: { Location: `/portal?tab=integrations&${params}` } });

  if (errorParam || !code || !state) {
    return portalRedirect("error=" + encodeURIComponent(errorParam || "missing_code"));
  }

  if (!APP_ID || !APP_SECRET) {
    return portalRedirect("error=" + encodeURIComponent("Instagram OAuth not configured. Contact your admin."));
  }

  try {
    // Instagram uses Facebook's OAuth — exchange code for user token
    const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", APP_ID);
    tokenUrl.searchParams.set("client_secret", APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    if (!tokenRes.ok) {
      console.error("Instagram token exchange failed:", await tokenRes.text());
      return portalRedirect("error=" + encodeURIComponent("Token exchange failed"));
    }

    const tokenData = await tokenRes.json();
    let accessToken = tokenData.access_token;
    let expiresIn = tokenData.expires_in || 5184000;

    // Long-lived token exchange
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
    } catch { /* ignore */ }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Find Instagram Business Account via Facebook Page
    let igAccountId = null;
    let igUsername = null;
    let pageToken = accessToken;
    try {
      const pagesRes = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`
      );
      if (pagesRes.ok) {
        const pagesData = await pagesRes.json();
        for (const page of pagesData.data || []) {
          if (page.instagram_business_account) {
            igAccountId = page.instagram_business_account.id;
            pageToken = page.access_token || accessToken;
            // Get IG username
            const igRes = await fetch(
              `https://graph.facebook.com/v19.0/${igAccountId}?fields=username&access_token=${pageToken}`
            );
            if (igRes.ok) {
              const igData = await igRes.json();
              igUsername = igData.username || null;
            }
            break;
          }
        }
      }
    } catch { /* ignore */ }

    if (!igAccountId) {
      return portalRedirect("error=" + encodeURIComponent("No Instagram Business account found. Please connect one to a Facebook Page first."));
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    await supabase.from("client_oauth_tokens").delete().eq("client_id", state).eq("platform", "instagram");

    const { error: insertErr } = await supabase.from("client_oauth_tokens").insert({
      client_id: state,
      platform: "instagram",
      access_token: pageToken,
      expires_at: expiresAt,
      page_id: igAccountId,
      token_metadata: { page_name: igUsername ? `@${igUsername}` : "Instagram Business" },
    });

    if (insertErr) {
      console.error("DB insert error:", insertErr);
      return portalRedirect("error=" + encodeURIComponent("Failed to save token"));
    }

    return portalRedirect("connected=instagram&success=true");
  } catch (err) {
    console.error("Instagram OAuth error:", err);
    return portalRedirect("error=" + encodeURIComponent("Unexpected error"));
  }
});
