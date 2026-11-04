import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkClientOrAdminAuth, isServiceRequest } from "../_shared/auth.ts";
import { functionErrorAlert } from "../_shared/alerts.ts";
import { callAIWithTools, MODELS } from "../_shared/ai.ts";
import { loadProfileRows } from "../_shared/crawler/supabaseStore.ts";
import { buildCorpus, contentHash } from "../_shared/profile/corpus.ts";
import { runProfileAgent, type AgentDeps } from "../_shared/profile/agent.ts";
import { planWrite, hasSuggestions } from "../_shared/profile/merge.ts";

// Builds the company profile from the stored crawl: what the business does, for whom, where, and the facts the
// website states. A tool-using agent reads the pages; every claim must carry a quote that is really on the page
// it cites (see _shared/profile/evidence.ts). Empty fields in the client's record are filled; anything a person
// already wrote is left alone and new findings become suggestions. Runs from the job queue after each crawl.
const DEADLINE_MS = 110_000;
const REBUILD_AFTER_DAYS = 30;

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = serviceClient();
  let runId: string | null = null;
  let clientId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    clientId = body.clientId ?? body.client_id;
    if (!clientId) return jsonResponse({ error: "clientId is required" }, 400);
    const auth = isServiceRequest(req) ? { authorized: true } : await checkClientOrAdminAuth(req, supabase, clientId, body.password);
    if (!auth.authorized) return jsonResponse({ error: "Unauthorized" }, 401);
    const force = body.force === true;

    const { data: client } = await supabase.from("client_accounts").select("id, business_name, website_url, industry, website_summary, context_profile").eq("id", clientId).maybeSingle();
    if (!client) return jsonResponse({ error: "Client not found" }, 404);

    const crawlQuery = supabase.from("site_crawls").select("id, pages_crawled").eq("client_account_id", clientId).eq("status", "complete");
    const { data: crawl } = body.crawlId
      ? await crawlQuery.eq("id", body.crawlId).maybeSingle()
      : await crawlQuery.order("finished_at", { ascending: false }).limit(1).maybeSingle();
    if (!crawl) return jsonResponse({ error: "No finished crawl to read yet. Run a crawl first." }, 422);

    const corpus = buildCorpus(await loadProfileRows(supabase, crawl.id));
    const hash = contentHash(corpus);
    const record = (patch: Record<string, unknown>) => supabase.from("company_profile_runs").insert({ client_account_id: clientId, crawl_id: crawl.id, source_hash: hash, pages_read: corpus.pages.length, ...patch }).select("id").single();

    if (corpus.pages.length === 0) {
      await record({ status: "skipped", note: "The crawl found no readable pages to build a profile from.", finished_at: new Date().toISOString() });
      return jsonResponse({ ok: true, skipped: true, reason: "no_readable_pages" });
    }

    // Nothing worth re-reading changed since the last profile: don't spend a model run on it.
    if (!force) {
      const { data: last } = await supabase.from("company_profile_runs").select("source_hash, created_at").eq("client_account_id", clientId).eq("status", "complete").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const ageDays = last ? (Date.now() - Date.parse(last.created_at)) / 86_400_000 : Infinity;
      if (last && last.source_hash === hash && ageDays < REBUILD_AFTER_DAYS) {
        await record({ status: "skipped", note: "The website's key pages haven't changed since the last profile.", finished_at: new Date().toISOString() });
        return jsonResponse({ ok: true, skipped: true, reason: "unchanged" });
      }
    }

    const { data: run } = await record({ status: "running" });
    runId = run?.id ?? null;

    const deadline = Date.now() + DEADLINE_MS;
    const deps: AgentDeps = {
      callModel: async (messages, tools, toolChoice) => {
        if (Date.now() > deadline) throw new Error("time budget used up");
        const t = await callAIWithTools({
          messages, tools, toolChoice, model: MODELS.default, maxTokens: 3000, temperature: 0.2,
          source: "build-company-profile", clientId, promptId: "company-profile.v1", silent: true,
        });
        return { content: t.content, toolCalls: t.toolCalls, usage: t.usage };
      },
    };
    const result = await runProfileAgent({ business: { name: client.business_name, website: client.website_url, industry: client.industry }, corpus, deps });

    const plan = planWrite({ website_summary: client.website_summary, industry: client.industry, context_profile: client.context_profile as Record<string, unknown> | null }, result.profile);
    const { data: applied, error: applyErr } = await supabase.rpc("apply_website_profile", {
      p_client: clientId, p_summary: plan.website_summary, p_industry: plan.industry, p_fill: plan.fill, p_suggestions: plan.suggestions,
      p_meta: { generated_at: new Date().toISOString(), crawl_id: crawl.id, run_id: runId, path: result.path, source: "website" },
    });
    if (applyErr) throw new Error(`could not save the profile: ${applyErr.message}`);
    const filled: string[] = (applied as { filled?: string[] } | null)?.filled ?? [];

    await supabase.from("company_profile_runs").update({
      status: "complete", path: result.path, model: MODELS.default, turns: result.turns, tool_calls: result.toolCalls,
      prompt_tokens: result.tokens.prompt, completion_tokens: result.tokens.completion,
      proposal: result.profile, dropped: result.dropped, filled, suggestions_count: Object.values(plan.suggestions).reduce((n, v) => n + (v?.length ?? 0), 0),
      note: result.path === "fallback" ? `Built from the site's own markup only (${result.error ?? "the AI step was unavailable"}).` : null,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);

    return jsonResponse({ ok: true, run_id: runId, path: result.path, filled, suggestions: hasSuggestions(plan.suggestions), dropped: result.dropped.length, tool_calls: result.toolCalls });
  } catch (err) {
    console.error("[build-company-profile]", err);
    if (runId) await supabase.from("company_profile_runs").update({ status: "failed", error: err instanceof Error ? err.message : String(err), finished_at: new Date().toISOString() }).eq("id", runId);
    await functionErrorAlert(supabase, "build-company-profile", err, { client_id: clientId });
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
