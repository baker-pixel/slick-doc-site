import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { deletePfmAccounts, listPfmAccountsForClient } from "../_shared/pfmCleanup.ts";

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

    // Disconnect removes EVERY PfM account for this client+platform (our DB
    // deletes all of them below too). Previously only one id was revoked, and
    // with several pages connected (the common LinkedIn/Facebook case) none
    // was -- .maybeSingle() errors on multiple rows -- leaving stale PfM
    // accounts that broke the next OAuth connect. So collect ids from our DB
    // AND from PfM itself (catches orphans our DB never knew about).
    const idsToDelete = new Set<string>();
    if (pfmAccountId) idsToDelete.add(pfmAccountId);
    const { data: rows } = await supabase
      .from("client_postforme_accounts")
      .select("postforme_account_id")
      .eq("client_id", clientId)
      .eq("platform", platform);
    for (const r of rows ?? []) if (r.postforme_account_id) idsToDelete.add(r.postforme_account_id);

    // Revoke on PfM side. remoteRevoked is false if anything failed (including
    // being unable to list PfM accounts), null only if nothing needed revoking
    // or no API key is set. The UI warns on false instead of a clean
    // "Disconnected" -- silent drift is what caused the original incident.
    let remoteRevoked: boolean | null = null;
    if (pfmApiKey) {
      let listFailed = false;
      try {
        for (const a of await listPfmAccountsForClient(pfmApiKey, clientId, platform)) idsToDelete.add(a.id);
      } catch (err) {
        console.warn("PfM list for disconnect failed:", err);
        listFailed = true;
      }
      if (idsToDelete.size > 0) {
        const result = await deletePfmAccounts(pfmApiKey, [...idsToDelete]);
        remoteRevoked = result.failed === 0 && !listFailed;
      } else if (listFailed) {
        remoteRevoked = false;
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
    return json({ success: true, remoteRevoked });
  } catch (err: unknown) {
    console.error("postforme-disconnect-account error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
