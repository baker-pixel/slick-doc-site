import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";
import { upsertSocialStrategy } from "../_shared/socialStrategy.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";

const COOLDOWN_HOURS = 24;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Client-triggered re-run of the social strategy LLM call. Unlike
// client-context-refresh's cron path (which only ever generates pillars once,
// the first time a client has no project), this always regenerates -- the
// client wants different/refreshed topics, not just a progress-percent tick.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { client_id, password } = await req.json();
    if (!client_id) return json({ error: "client_id is required" }, 400);

    const auth = await checkClientOrAdminAuth(req, supabase, client_id, password);
    if (!auth.authorized) return json({ error: "Unauthorized" }, 401);

    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("id, business_name, industry, tier, context_profile")
      .eq("id", client_id)
      .single();
    if (clientErr || !client) return json({ error: "Client not found" }, 404);

    // Cheap spam guard: this calls an LLM every time, so cap how often a
    // client can re-roll their topics.
    const { data: existingProject } = await supabase
      .from("client_projects")
      .select("updated_at")
      .eq("client_account_id", client_id)
      .eq("kind", "social")
      .maybeSingle();

    if (existingProject) {
      const hoursSince = (Date.now() - new Date(existingProject.updated_at).getTime()) / 3_600_000;
      if (hoursSince < COOLDOWN_HOURS) {
        const retryInHours = Math.ceil(COOLDOWN_HOURS - hoursSince);
        return json({ error: `You can regenerate topics once a day. Try again in ${retryInHours}h.` }, 429);
      }
    }

    const { projectId, pillars } = await upsertSocialStrategy(supabase, client, tierPolicy(client.tier));
    if (!projectId) return json({ error: "Failed to regenerate topics" }, 500);

    return json({ success: true, projectId, pillars });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("regenerate-social-strategy error:", msg);
    return json({ error: msg }, 500);
  }
});
