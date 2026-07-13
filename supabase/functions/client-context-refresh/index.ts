import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refineClientContext } from "../_shared/contextRefine.ts";
import { refreshSocialPlanProgress, upsertSocialStrategy } from "../_shared/socialStrategy.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The pull-based maintenance pass (blackboard feedback model). Per client, on
// a cadence, it:
//   1. refines the shared context from recent outcomes (the feedback loop),
//   2. ensures a Social Media Plan exists (pull, not onboarding-triggered).
// It writes only to context/projects and triggers no downstream work -- every
// agent independently picks up the refined context on its own next run.
const MAX_PER_RUN = 8;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { data: clients } = await supabase
      .from("client_accounts")
      .select("id, business_name, industry, tier, context_profile")
      .eq("status", "active")
      .not("context_profile", "is", null)
      .limit(MAX_PER_RUN);

    const results: { client: string; refined: boolean; social: string }[] = [];
    for (const c of clients ?? []) {
      let refined = false;
      let social = "exists";
      try {
        const r = await refineClientContext(supabase, c.id);
        refined = r.refined;
      } catch (e) {
        console.error("refine failed", c.id, e);
      }
      try {
        const { data: existing } = await supabase
          .from("client_projects").select("id").eq("client_account_id", c.id).eq("kind", "social").maybeSingle();
        if (!existing) {
          const res = await upsertSocialStrategy(supabase, c, tierPolicy(c.tier));
          social = res.projectId ? "created" : "failed";
        } else {
          // Existing plan: keep its progress honest on the weekly cadence
          // (publish-time refreshes cover the common path; this catches
          // month rollover, where progress resets to a new denominator).
          await refreshSocialPlanProgress(supabase, c.id, tierPolicy(c.tier).social.postsPerMonth);
        }
      } catch (e) {
        console.error("social strategy ensure failed", c.id, e);
        social = "error";
      }
      results.push({ client: c.business_name, refined, social });
    }

    console.log(`client-context-refresh: ${results.length} clients processed`);
    return json({ processed: results.length, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("client-context-refresh error:", msg);
    return json({ error: msg }, 500);
  }
});
