import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PFM_API = "https://api.postforme.dev";

// PfM's platform enum uses "x" for Twitter/X; our app uses "twitter" internally.
// Map at the API boundary in both directions.
const TO_PFM_PLATFORM: Record<string, string> = { twitter: "x" };

// LinkedIn: PfM Quickstart requires connection_type.
//   "organization" = Company Page (requires rw_organization_admin scope — may need PfM approval)
//   "personal"     = Personal profile (r_liteprofile + w_member_social)
// We try "organization" first per PfM Quickstart docs; if PfM's LinkedIn app is restricted
// to personal scope, switch to "personal" here.
// Instagram must specify connection_type "instagram" to trigger Meta's Instagram login flow.
function buildPlatformData(platform: string): Record<string, unknown> | undefined {
  switch (platform) {
    case "linkedin":
      return { linkedin: { connection_type: "personal" } };
    case "instagram":
      return { instagram: { connection_type: "instagram" } };
    default:
      return undefined;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const pfmApiKey = Deno.env.get("POSTFORME_API_KEY");

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    if (!pfmApiKey) {
      return json({ error: "POSTFORME_API_KEY not configured" }, 500);
    }

    const { clientId, platform, permissions, password } = await req.json();

    if (!clientId || !platform) {
      return json({ error: "clientId and platform are required" }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Two auth paths: admin panel (ADMIN_PASSWORD) or portal user / admin-role JWT
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const isAdminCall = !!adminPassword && password === adminPassword;

    if (!isAdminCall) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);

      // Caller must be a portal user of this client, or an admin
      const { data: portalUser } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("client_account_id", clientId)
        .maybeSingle();
      if (!portalUser) {
        const { data: isAdmin } = await supabase.rpc("has_role", { _role: "admin", _user_id: user.id });
        if (isAdmin !== true) return json({ error: "Forbidden" }, 403);
      }
    }

    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("id, business_name")
      .eq("id", clientId)
      .single();

    if (clientErr || !client) {
      return json({ error: "Client not found" }, 404);
    }

    const pfmPlatform = TO_PFM_PLATFORM[platform] ?? platform;
    const platformData = buildPlatformData(platform);

    const pfmRes = await fetch(`${PFM_API}/v1/social-accounts/auth-url`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pfmApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform: pfmPlatform,
        external_id: clientId,
        permissions: permissions ?? ["posts", "feeds"],
        ...(platformData ? { platform_data: platformData } : {}),
      }),
    });

    if (!pfmRes.ok) {
      const text = await pfmRes.text();
      console.error("PfM auth-url error:", pfmRes.status, text);
      let friendlyError = `Post for Me error (${pfmRes.status})`;
      try {
        const parsed = JSON.parse(text);
        friendlyError = parsed.message || parsed.error || parsed.detail || friendlyError;
      } catch { /* ignore */ }
      return json({ error: friendlyError }, 200);
    }

    const pfmData = await pfmRes.json();
    return json({ url: pfmData.url, platform: pfmData.platform });
  } catch (err: unknown) {
    console.error("postforme-connect-account error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
