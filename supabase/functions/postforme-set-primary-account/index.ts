import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Lets a client pick which connected account is "the" page used for publishing
// when a platform (e.g. LinkedIn) has more than one connected page/profile.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const { clientId, platform, pfmAccountId, password } = await req.json();
    if (!clientId || !platform || !pfmAccountId) {
      return json({ error: "clientId, platform and pfmAccountId are required" }, 400);
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

    const { error: clearErr } = await supabase
      .from("client_postforme_accounts")
      .update({ is_primary: false })
      .eq("client_id", clientId)
      .eq("platform", platform);
    if (clearErr) return json({ error: clearErr.message }, 500);

    const { error: setErr } = await supabase
      .from("client_postforme_accounts")
      .update({ is_primary: true })
      .eq("client_id", clientId)
      .eq("platform", platform)
      .eq("postforme_account_id", pfmAccountId);
    if (setErr) return json({ error: setErr.message }, 500);

    return json({ success: true });
  } catch (err: unknown) {
    console.error("postforme-set-primary-account error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
