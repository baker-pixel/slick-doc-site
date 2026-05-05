import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // client_account_id
  const errorParam = url.searchParams.get("error");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID") || "";
  const CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET") || "";
  const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/linkedin-oauth-callback`;
  const APP_URL = Deno.env.get("APP_URL") || "https://orangedoormarketing.com";

  const portalRedirect = (params: string) =>
    new Response(null, { status: 302, headers: { Location: `${APP_URL}/portal?tab=integrations&${params}` } });

  if (errorParam || !code || !state) {
    return portalRedirect("error=" + encodeURIComponent(errorParam || "missing_code"));
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return portalRedirect("error=" + encodeURIComponent("LinkedIn OAuth not configured. Contact your admin."));
  }

  try {
    const LINKEDIN_VERSION = "202504";

    // Exchange code for token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
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
      console.error("LinkedIn token exchange failed:", errText);
      return portalRedirect("error=" + encodeURIComponent("Token exchange failed"));
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 5184000; // default 60 days
    const refreshToken = tokenData.refresh_token || null;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Fetch profile for display name
    let profileName = null;
    let personSub = null;
    try {
      const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        profileName = profile.name || profile.given_name || null;
        personSub = profile.sub || null; // LinkedIn person ID — needed for UGC post author URN
      }
    } catch { /* ignore profile fetch errors */ }

    const linkedinHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": LINKEDIN_VERSION,
      "Content-Type": "application/json",
    };

    let organizations: Array<{ id: string; name: string; urn: string }> = [];
    try {
      const orgAclRes = await fetch(
        "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&state=APPROVED",
        { headers: linkedinHeaders },
      );

      if (orgAclRes.ok) {
        const orgAclData = await orgAclRes.json();
        const organizationIds = Array.from(
          new Set(
            (orgAclData.elements || [])
              .map((entry: { organization?: string }) => entry.organization || "")
              .filter(Boolean)
              .map((urn: string) => urn.split(":").pop() || "")
              .filter(Boolean),
          ),
        ) as string[];

        if (organizationIds.length > 0) {
          const orgLookupRes = await fetch(
            `https://api.linkedin.com/rest/organizations?ids=List(${organizationIds.join(",")})`,
            { headers: linkedinHeaders },
          );

          if (orgLookupRes.ok) {
            const orgLookupData = await orgLookupRes.json();
            organizations = organizationIds
              .map((id) => {
                const org = orgLookupData.results?.[id];
                if (!org) return null;
                return {
                  id,
                  name: org.localizedName || org.vanityName || `Organization ${id}`,
                  urn: `urn:li:organization:${id}`,
                };
              })
              .filter(Boolean) as Array<{ id: string; name: string; urn: string }>;
          } else {
            console.warn("LinkedIn org details lookup failed — falling back to personal profile");
          }
        }
      } else {
        const aclText = await orgAclRes.text();
        console.warn("LinkedIn organization lookup failed (likely missing MDP approval) — falling back to personal profile:", aclText);
      }
    } catch (orgError) {
      console.warn("LinkedIn organization fetch error — falling back to personal profile:", orgError);
    }

    // Store in DB
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Upsert: delete existing then insert
    await supabase
      .from("client_oauth_tokens")
      .delete()
      .eq("client_id", state)
      .eq("platform", "linkedin");

    const defaultOrganization = organizations.length === 1 ? organizations[0] : null;

    const { error: insertErr } = await supabase.from("client_oauth_tokens").insert({
      client_id: state,
      platform: "linkedin",
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      page_id: defaultOrganization?.urn || null,
      token_metadata: {
        ...(defaultOrganization?.name ? { page_name: defaultOrganization.name } : {}),
        ...(personSub ? { person_id: personSub } : {}),
        ...(profileName ? { member_name: profileName } : {}),
        selection_required: organizations.length > 1,
        organization_options: organizations,
        ...(defaultOrganization
          ? {
              organization_id: defaultOrganization.id,
              organization_urn: defaultOrganization.urn,
            }
          : {}),
      },
    });

    if (insertErr) {
      console.error("DB insert error:", insertErr);
      return portalRedirect("error=" + encodeURIComponent("Failed to save token"));
    }

    return portalRedirect("connected=linkedin&success=true");
  } catch (err) {
    console.error("LinkedIn OAuth error:", err);
    return portalRedirect("error=" + encodeURIComponent("Unexpected error"));
  }
});
