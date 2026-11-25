import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkPipelineAuth } from "../_shared/core/auth.ts";
import { buildVisualBrief } from "../_shared/social/visualBrief.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Clients handled per scheduled run; each costs one small vision call.
const SWEEP_LIMIT = 3;
// A brief is refreshed at most this often (a site's photography rarely changes).
const REFRESH_DAYS = 90;
// After a failed attempt (no usable photos, blocked site) wait before retrying.
const RETRY_DAYS = 14;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    if (!(await checkPipelineAuth(req, supabase, body.password))) return json({ error: "Unauthorized" }, 401);
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OPENAI_API_KEY is not configured" }, 503);

    const clientId: string | undefined = body.client_id;
    const force = !!body.force;
    const dryRun = !!body.dry_run; // returns the brief without saving it

    let q = supabase.from("client_accounts").select("id, business_name, website_url, context_profile").not("website_url", "is", null);
    if (clientId) q = q.eq("id", clientId);
    else q = q.in("status", ["active", "onboarding"]).limit(100);
    const { data: clients, error } = await q;
    if (error) throw new Error(error.message);

    const now = Date.now();
    const due = (clients || []).filter((c: any) => {
      if (!c.website_url?.trim()) return false;
      if (force || clientId) return true;
      const p = c.context_profile || {};
      const stamp = p.visual_brief?.generated_at ?? p.visual_brief_attempted_at;
      const days = p.visual_brief ? REFRESH_DAYS : RETRY_DAYS;
      return !stamp || now - new Date(stamp).getTime() > days * 86_400_000;
    }).slice(0, clientId ? 1 : SWEEP_LIMIT);

    const results: Record<string, unknown>[] = [];
    for (const c of due as any[]) {
      const { brief, reason } = await buildVisualBrief(openaiKey, c.website_url);
      if (dryRun) { results.push({ client: c.business_name, brief, reason }); continue; }
      // Re-read right before writing so a concurrent profile edit isn't lost.
      const { data: fresh } = await supabase.from("client_accounts").select("context_profile").eq("id", c.id).single();
      const profile = { ...(fresh?.context_profile || {}) } as Record<string, unknown>;
      if (brief) { profile.visual_brief = brief; delete profile.visual_brief_attempted_at; }
      else profile.visual_brief_attempted_at = new Date().toISOString();
      await supabase.from("client_accounts").update({ context_profile: profile }).eq("id", c.id);
      results.push({ client: c.business_name, saved: !!brief, reason, brief });
    }
    return json({ processed: results.length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("extract-visual-brief error:", msg);
    return json({ error: msg }, 500);
  }
});
