import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAdminAuth } from "../_shared/auth.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { upsertSocialStrategy } from "../_shared/socialStrategy.ts";
import { logActivity } from "../_shared/activityLog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isServer = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!isServer) {
      const auth = await checkAdminAuth(req, supabase, body.password);
      if (!auth.authorized) return json({ error: "Unauthorized" }, 401);
    }

    const clientId: string = body.clientId ?? body.client_id;
    if (!clientId) return json({ error: "clientId is required" }, 400);

    const { data: client, error: cErr } = await supabase
      .from("client_accounts").select("id, business_name, industry, tier, context_profile").eq("id", clientId).single();
    if (cErr || !client) return json({ error: "Client not found" }, 404);
    if (!client.context_profile) return json({ error: "Client has no context profile yet -- complete intake first" }, 422);

    const policy = tierPolicy(client.tier);
    const { projectId, pillars } = await upsertSocialStrategy(supabase, client, policy);
    if (!projectId) return json({ error: "Could not generate a social strategy for this client" }, 502);

    await logActivity(supabase, clientId, {
      type: "social_strategy",
      title: `Social media plan updated — ${pillars.length} content pillars`,
      description: `${policy.social.postsPerMonth} posts/month across ${policy.social.contentTypes.join(", ")}.`,
      icon: "share-2",
      metadata: { project_id: projectId, pillars: pillars.map((p) => p.name) },
    });

    return json({ project_id: projectId, pillars });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("generate-social-strategy error:", msg);
    return json({ error: msg }, 500);
  }
});
