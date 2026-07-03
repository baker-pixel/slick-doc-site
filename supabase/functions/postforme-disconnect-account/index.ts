import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PFM_API = "https://api.postforme.dev";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const { clientId, platform, pfmAccountId, password } = await req.json();
    if (!clientId || !platform) return json({ error: "clientId and platform are required" }, 400);

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

    // If pfmAccountId not provided, look it up from our DB
    let accountId = pfmAccountId;
    if (!accountId) {
      const { data: row } = await supabase
        .from("client_postforme_accounts")
        .select("postforme_account_id")
        .eq("client_id", clientId)
        .eq("platform", platform)
        .maybeSingle();
      accountId = row?.postforme_account_id ?? null;
    }

    // Revoke on PfM side — best effort (don't fail if PfM rejects)
    if (accountId && pfmApiKey) {
      const pfmRes = await fetch(`${PFM_API}/v1/social-accounts/${accountId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${pfmApiKey}` },
      });
      if (!pfmRes.ok) {
        const text = await pfmRes.text();
        console.warn(`PfM DELETE /v1/social-accounts/${accountId} returned ${pfmRes.status}: ${text}`);
        // Don't hard-fail — still remove locally so UI is consistent
      } else {
        console.log(`PfM account ${accountId} revoked`);
      }
    }

    // Remove from our DB
    const { error: deleteErr } = await supabase
      .from("client_postforme_accounts")
      .delete()
      .eq("client_id", clientId)
      .eq("platform", platform);

    if (deleteErr) {
      console.error("DB delete error:", deleteErr.message);
      return json({ error: deleteErr.message }, 500);
    }

    console.log(`Disconnected ${platform} for client ${clientId}`);
    return json({ success: true });
  } catch (err: unknown) {
    console.error("postforme-disconnect-account error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
