import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // client_account_id
  const errorParam = url.searchParams.get("error");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CLIENT_ID = Deno.env.get("TWITTER_CLIENT_ID") || "";
  const CLIENT_SECRET = Deno.env.get("TWITTER_CLIENT_SECRET") || "";
  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/twitter-oauth-callback`;

  const portalRedirect = (params: string) =>
    new Response(null, { status: 302, headers: { Location: `/portal?tab=integrations&${params}` } });

  if (errorParam || !code || !state) {
    return portalRedirect("error=" + encodeURIComponent(errorParam || "missing_code"));
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return portalRedirect("error=" + encodeURIComponent("Twitter OAuth not configured. Contact your admin."));
  }

  try {
    // Twitter OAuth 2.0 PKCE token exchange
    const basicAuth = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

    // Retrieve code_verifier from state (we encode client_id:verifier in state)
    // For simplicity, we store the verifier as part of the state param: client_id|code_verifier
    const parts = state.split("|");
    const clientAccountId = parts[0];
    const codeVerifier = parts[1] || "challenge"; // fallback

    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
        client_id: CLIENT_ID,
      }),
    });

    if (!tokenRes.ok) {
      console.error("Twitter token exchange failed:", await tokenRes.text());
      return portalRedirect("error=" + encodeURIComponent("Token exchange failed"));
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    // Twitter OAuth2 tokens with refresh_token don't expire independently
    const expiresIn = tokenData.expires_in || null;
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    // Get username
    let username = null;
    try {
      const meRes = await fetch("https://api.twitter.com/2/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        username = meData.data?.username || null;
      }
    } catch { /* ignore */ }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    await supabase.from("client_oauth_tokens").delete().eq("client_id", clientAccountId).eq("platform", "twitter");

    const { error: insertErr } = await supabase.from("client_oauth_tokens").insert({
      client_id: clientAccountId,
      platform: "twitter",
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      token_metadata: { page_name: username ? `@${username}` : "Twitter Account" },
    });

    if (insertErr) {
      console.error("DB insert error:", insertErr);
      return portalRedirect("error=" + encodeURIComponent("Failed to save token"));
    }

    return portalRedirect("connected=twitter&success=true");
  } catch (err) {
    console.error("Twitter OAuth error:", err);
    return portalRedirect("error=" + encodeURIComponent("Unexpected error"));
  }
});
