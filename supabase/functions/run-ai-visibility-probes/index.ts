import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { generateVisibilityPrompts, probeOpenAI, probeClaude } from "../_shared/aiVisibilityProbe.ts";
import { logAlert } from "../_shared/alerts.ts";

/** How much a mention is worth toward the rollup score, by rank. A mention
 * with no parseable position (prose answer, not a numbered list) still
 * counts, at a fixed mid-weight -- it's a real citation, just not rankable. */
function positionWeight(position: number | null): number {
  if (position === null) return 0.7;
  if (position === 1) return 1.0;
  if (position === 2) return 0.85;
  if (position === 3) return 0.7;
  return 0.5;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!openaiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // ANTHROPIC_API_KEY isn't provisioned yet -- run the OpenAI half only
  // rather than hard-failing the whole probe. Once the key is added, the
  // Claude half picks up automatically with no code change.
  if (!anthropicKey) {
    console.warn("ANTHROPIC_API_KEY not configured -- skipping the Claude half of every probe this run.");
  }

  let clientsProbed = 0;
  let runsRecorded = 0;

  try {
    const { data: clients, error: clientsErr } = await supabase
      .from("client_accounts")
      .select("id, business_name, website_url, industry, context_profile, tier")
      .eq("status", "active");

    if (clientsErr) throw clientsErr;

    for (const client of clients ?? []) {
      const policy = tierPolicy(client.tier as string | null);
      if (!policy.aiVisibility.enabled) continue;

      const ctx = (client.context_profile ?? {}) as Record<string, unknown>;
      const industry = client.industry || (typeof ctx.industry === "string" ? ctx.industry : "") || "local business";
      // context_profile.location is set by the AI website scan (analyze-website);
      // context_profile.address is set by the manual onboarding form
      // (seed-tier-workflow's business_info step) -- every client has gone through
      // onboarding, not every client has had a scan, so address is the more
      // reliable field. Falling through to the literal "their local area" produced
      // a garbage prompt no LLM could answer (confirmed live: 0% mention rate).
      const location =
        (typeof ctx.location === "string" && ctx.location) ||
        (typeof ctx.address === "string" && ctx.address) ||
        "their local area";
      const services = Array.isArray(ctx.services) ? (ctx.services as string[]).slice(0, 2) : [];

      // Reuse existing active prompts for this client so the score tracks
      // the same questions month over month; only top up if short.
      const { data: existingPrompts } = await supabase
        .from("ai_visibility_prompts")
        .select("id, prompt_text")
        .eq("client_id", client.id)
        .eq("is_active", true);

      let prompts = existingPrompts ?? [];
      if (prompts.length < policy.aiVisibility.promptsPerMonth) {
        const needed = policy.aiVisibility.promptsPerMonth - prompts.length;
        const candidates = generateVisibilityPrompts(industry, location, services, policy.aiVisibility.promptsPerMonth)
          .filter((p) => !prompts.some((existing) => existing.prompt_text === p))
          .slice(0, needed);

        for (const promptText of candidates) {
          const { data: inserted, error: insertErr } = await supabase
            .from("ai_visibility_prompts")
            .insert({ client_id: client.id, prompt_text: promptText })
            .select("id, prompt_text")
            .single();
          if (!insertErr && inserted) prompts.push(inserted);
        }
      }

      const clientName = client.business_name as string;
      const clientDomain = client.website_url as string | null;

      const runs: { mentioned: boolean; position: number | null }[] = [];

      for (const prompt of prompts) {
        try {
          const gpt = await probeOpenAI(openaiKey, prompt.prompt_text, clientName, clientDomain ?? undefined);
          await supabase.from("ai_visibility_runs").insert({
            client_id: client.id,
            prompt_id: prompt.id,
            model: "gpt",
            mentioned: gpt.mentioned,
            position: gpt.position,
            response_excerpt: gpt.excerpt,
          });
          runs.push(gpt);
          runsRecorded++;
        } catch (err) {
          console.error(`OpenAI probe failed for client ${client.id}:`, err);
        }

        if (!anthropicKey) continue;
        try {
          const claude = await probeClaude(anthropicKey, prompt.prompt_text, clientName, clientDomain ?? undefined);
          await supabase.from("ai_visibility_runs").insert({
            client_id: client.id,
            prompt_id: prompt.id,
            model: "claude",
            mentioned: claude.mentioned,
            position: claude.position,
            response_excerpt: claude.excerpt,
          });
          runs.push(claude);
          runsRecorded++;
        } catch (err) {
          console.error(`Claude probe failed for client ${client.id}:`, err);
        }
      }

      if (runs.length > 0) {
        const mentionedRuns = runs.filter((r) => r.mentioned);
        const mentionRate = mentionedRuns.length / runs.length;
        const positioned = mentionedRuns.filter((r) => r.position !== null);
        const avgPosition = positioned.length > 0
          ? positioned.reduce((sum, r) => sum + (r.position as number), 0) / positioned.length
          : null;
        const totalScore = Math.round(
          100 * (runs.reduce((sum, r) => sum + (r.mentioned ? positionWeight(r.position) : 0), 0) / runs.length),
        );

        await supabase.from("ai_visibility_scores").upsert(
          {
            client_id: client.id,
            total_score: totalScore,
            mention_rate: mentionRate,
            avg_position: avgPosition,
            computed_at: new Date().toISOString(),
          },
          { onConflict: "client_id" },
        );
      }

      clientsProbed++;
    }

    return new Response(JSON.stringify({ success: true, clientsProbed, runsRecorded }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("run-ai-visibility-probes error:", error);
    await logAlert(supabase, {
      source: "run-ai-visibility-probes",
      alertType: "function_error",
      severity: "error",
      title: "Error in run-ai-visibility-probes",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
