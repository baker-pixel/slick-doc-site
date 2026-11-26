import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GA_SCOPE, redirectUri, safeReturnOrigin, tokenRequest, verifyState } from "../_shared/google/oauth.ts";
import { encryptToken } from "../_shared/google/tokenCrypto.ts";

// Google sends the browser here after consent. Authenticated by the HMAC-signed `state` created in
// google-analytics-connect (no Supabase JWT). Exchanges the code, stores encrypted tokens, then
// sends the user back to the portal Analytics tab.
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const state = await verifyState(url.searchParams.get("state"));
  // Unverifiable state: never redirect anywhere based on it.
  if (!state) return new Response("This link has expired. Please go back to your portal and try again.", { status: 400 });

  const back = (result: string) => {
    const dest = new URL("/portal", safeReturnOrigin(state.o));
    dest.searchParams.set("tab", "analytics");
    dest.searchParams.set("google", result);
    return Response.redirect(dest.toString(), 302);
  };

  try {
    if (url.searchParams.get("error")) return back(url.searchParams.get("error") === "access_denied" ? "denied" : "error");
    const code = url.searchParams.get("code");
    if (!code) return back("error");

    const tok = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
    if (!tok.ok || !tok.body.access_token) {
      console.error("google token exchange failed:", tok.status, tok.body?.error);
      return back("error");
    }
    // Granular consent lets people untick the Analytics permission; without it the connection is useless.
    if (!String(tok.body.scope ?? "").split(" ").includes(GA_SCOPE)) return back("scope");
    if (!tok.body.refresh_token) {
      console.error("google returned no refresh_token");
      return back("error");
    }

    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tok.body.access_token}` },
    }).then((r) => r.json()).catch(() => ({}));

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Switching Google accounts invalidates the previously chosen property.
    const { data: existing } = await supabase.from("google_analytics_connections")
      .select("google_email").eq("client_id", state.c).maybeSingle();
    const sameAccount = existing && existing.google_email === (info.email ?? null);

    const { error } = await supabase.from("google_analytics_connections").upsert({
      client_id: state.c,
      google_email: info.email ?? null,
      refresh_token_enc: await encryptToken(tok.body.refresh_token),
      access_token_enc: await encryptToken(tok.body.access_token),
      expires_at: new Date(Date.now() + (Number(tok.body.expires_in) || 3600) * 1000).toISOString(),
      scopes: tok.body.scope,
      status: "connected",
      updated_at: new Date().toISOString(),
      ...(sameAccount ? {} : { property_id: null, property_name: null }),
    }, { onConflict: "client_id" });
    if (error) throw error;

    return back("connected");
  } catch (e) {
    console.error("google-oauth-callback failed:", e);
    return back("error");
  }
});
