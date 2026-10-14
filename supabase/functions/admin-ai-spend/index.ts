import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import {
  buildReport, explainError, fetchBuckets, fetchProjects, filterByProjects, OpenAIApiError, parseCostBuckets, parseUsageBuckets, PROJECT_ID,
  type Attribution, type CostRow, type KeyKind, type UsageRow,
} from "../_shared/openaiSpend.ts";

// Admin AI Spend & Budget backend. OpenAI is the source of truth for dollars.
//   { action: "overview", force? }     -> the report (live from OpenAI's Costs/Usage APIs, cached 10 min)
//   { action: "list_projects" }        -> the OpenAI projects in the organization, and which are selected
//   { action: "set_projects", projects: [{id,name}] } -> count only these OpenAI projects (empty = all)
//   { action: "set_budget", amount }   -> monthly budget in USD (0/null clears it)
// Uses the OPENAI_ADMIN_KEY secret (an organization Admin key). If it isn't set we try the platform's
// everyday OPENAI_API_KEY, which OpenAI normally refuses for billing; the page then says to create an
// Admin key. Neither key ever leaves this function.
// Admin only (session or password).

const BUDGET_KEY = "ai_monthly_budget_usd";
const PROJECTS_KEY = "openai_project_ids";
const MAX_BUDGET = 1_000_000;
const MAX_PROJECTS = 20;
const FRESH_MS = 10 * 60_000;

interface Snapshot { costs: CostRow[]; usage: UsageRow[]; usage_available: boolean; other_currencies: string[]; fetched_at: string }
interface ScopeProject { id: string; name: string }
type Supabase = ReturnType<typeof serviceClient>;

/** Which OpenAI projects count as ours. Empty = every project in the organization. */
async function loadScope(supabase: Supabase): Promise<ScopeProject[]> {
  const { data } = await supabase.from("admin_settings").select("value").eq("key", PROJECTS_KEY).maybeSingle();
  try {
    const parsed = JSON.parse(data?.value ?? "[]");
    return (Array.isArray(parsed) ? parsed : []).filter((p) => typeof p?.id === "string" && PROJECT_ID.test(p.id)).map((p) => ({ id: p.id as string, name: String(p.name ?? p.id) }));
  } catch {
    return [];
  }
}

const cacheKeyFor = (ids: string[]) => `openai_spend_v2:${ids.length ? [...ids].sort().join(",") : "all"}`;

function adminKeyAndKind(): { key: string | undefined; kind: KeyKind } {
  const admin = Deno.env.get("OPENAI_ADMIN_KEY");
  return { key: admin ?? Deno.env.get("OPENAI_API_KEY"), kind: admin ? "admin" : "standard" };
}

async function loadFromOpenAI(adminKey: string, now: Date, projectIds: string[]): Promise<Snapshot> {
  // Costs and usage for last month and this month.
  const start = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1) / 1000);
  // Always group by project so every row says which project it belongs to, then filter on that ourselves
  // as well as asking OpenAI to: a server-side filter alone has been reported to misbehave.
  const scope: Record<string, string[]> = projectIds.length ? { project_ids: projectIds } : {};
  const costBuckets = await fetchBuckets("costs", adminKey, { start_time: String(start), bucket_width: "1d", limit: "180", group_by: ["line_item", "project_id"], ...scope });
  const { rows, otherCurrencies } = parseCostBuckets(costBuckets);

  // Request/token counts are a nicety. If only these fail, the dollars are still right.
  let usage: UsageRow[] = [];
  let usageAvailable = true;
  try {
    usage = parseUsageBuckets(await fetchBuckets("usage/completions", adminKey, { start_time: String(start), bucket_width: "1d", limit: "31", group_by: ["model", "project_id"], ...scope }));
  } catch (e) {
    usageAvailable = false;
    console.warn("OpenAI usage endpoint unavailable (costs still fine):", e instanceof Error ? e.message : e);
  }
  return {
    costs: filterByProjects(rows, projectIds), usage: filterByProjects(usage, projectIds),
    usage_available: usageAvailable, other_currencies: otherCurrencies, fetched_at: now.toISOString(),
  };
}

async function overview(supabase: Supabase, force: boolean) {
  const now = new Date();
  const { data, error } = await supabase.rpc("ai_usage_attribution");
  if (error) throw error;
  const attribution = data as Attribution;
  const scope = await loadScope(supabase);
  const ids = scope.map((p) => p.id);
  const build = (s: Snapshot | null) => buildReport({ costs: s?.costs ?? [], usage: s?.usage ?? [], attribution, now });
  const base = { projects: scope };

  const { key: adminKey, kind: keyKind } = adminKeyAndKind();
  if (!adminKey) {
    const problem = explainError(new OpenAIApiError("not_connected", "no admin key"));
    return { ...base, state: "not_connected", problem, fetched_at: null, usage_available: false, other_currencies: [], report: build(null) };
  }

  const cacheKey = cacheKeyFor(ids);
  const { data: cached } = await supabase.from("ai_spend_cache").select("payload, fetched_at").eq("key", cacheKey).maybeSingle();
  const cachedSnap = (cached?.payload ?? null) as Snapshot | null;
  const age = cached ? now.getTime() - new Date(cached.fetched_at).getTime() : Infinity;
  if (!force && cachedSnap && age < FRESH_MS) {
    return { ...base, state: "ok", key_kind: keyKind, problem: null, fetched_at: cachedSnap.fetched_at, usage_available: cachedSnap.usage_available, other_currencies: cachedSnap.other_currencies, report: build(cachedSnap) };
  }

  try {
    const snap = await loadFromOpenAI(adminKey, now, ids);
    await supabase.from("ai_spend_cache").upsert({ key: cacheKey, payload: snap, fetched_at: snap.fetched_at }, { onConflict: "key" });
    return { ...base, state: "ok", key_kind: keyKind, problem: null, fetched_at: snap.fetched_at, usage_available: snap.usage_available, other_currencies: snap.other_currencies, report: build(snap) };
  } catch (e) {
    const err = e instanceof OpenAIApiError ? e : new OpenAIApiError("server", e instanceof Error ? e.message : "unknown error");
    console.error("OpenAI spend fetch failed:", err.kind, err.status, err.message);
    const problem = { ...explainError(err, keyKind), detail: err.message };
    // Show the last good numbers if we have them, clearly marked as out of date.
    if (cachedSnap) return { ...base, state: "stale", problem, fetched_at: cachedSnap.fetched_at, usage_available: cachedSnap.usage_available, other_currencies: cachedSnap.other_currencies, report: build(cachedSnap) };
    return { ...base, state: "error", problem, fetched_at: null, usage_available: false, other_currencies: [], report: build(null) };
  }
}

serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const supabase = serviceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await checkAdminAuth(req, supabase, body.password);
    if (!auth.authorized) return errorResponse("Unauthorized", 401);

    switch (body.action) {
      case "overview":
        return jsonResponse(await overview(supabase, body.force === true));

      case "list_projects": {
        const { key, kind } = adminKeyAndKind();
        if (!key) return jsonResponse({ projects: [], selected: [], problem: explainError(new OpenAIApiError("not_connected", "no admin key")) });
        const selected = (await loadScope(supabase)).map((p) => p.id);
        try {
          return jsonResponse({ projects: await fetchProjects(key), selected, problem: null });
        } catch (e) {
          const err = e instanceof OpenAIApiError ? e : new OpenAIApiError("server", e instanceof Error ? e.message : "unknown error");
          return jsonResponse({ projects: [], selected, problem: { ...explainError(err, kind), detail: err.message } });
        }
      }

      case "set_projects": {
        const raw = Array.isArray(body.projects) ? body.projects : [];
        if (raw.length > MAX_PROJECTS) return errorResponse(`Choose at most ${MAX_PROJECTS} projects`, 400);
        const projects: ScopeProject[] = [];
        for (const p of raw) {
          if (typeof p?.id !== "string" || !PROJECT_ID.test(p.id)) return errorResponse("That doesn't look like an OpenAI project id", 400);
          projects.push({ id: p.id, name: String(p.name ?? p.id).slice(0, 80) });
        }
        const { data: existing } = await supabase.from("admin_settings").select("id").eq("key", PROJECTS_KEY).maybeSingle();
        if (projects.length === 0) {
          if (existing) await supabase.from("admin_settings").delete().eq("id", existing.id);
        } else if (existing) {
          const { error } = await supabase.from("admin_settings").update({ value: JSON.stringify(projects), updated_at: new Date().toISOString() }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("admin_settings").insert({ key: PROJECTS_KEY, value: JSON.stringify(projects), description: "OpenAI projects counted as OrangeDoor's in the AI Spend page (empty = all)" });
          if (error) throw error;
        }
        return jsonResponse({ ok: true, projects });
      }

      case "set_budget": {
        const amount = body.amount === null || body.amount === "" ? 0 : Number(body.amount);
        if (!Number.isFinite(amount) || amount < 0 || amount > MAX_BUDGET) return errorResponse("Budget must be a number between 0 and 1,000,000", 400);
        const { data: existing } = await supabase.from("admin_settings").select("id").eq("key", BUDGET_KEY).maybeSingle();
        if (amount === 0) {
          if (existing) await supabase.from("admin_settings").delete().eq("id", existing.id);
        } else if (existing) {
          const { error } = await supabase.from("admin_settings").update({ value: String(amount), updated_at: new Date().toISOString() }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("admin_settings").insert({ key: BUDGET_KEY, value: String(amount), description: "Monthly AI spend budget in USD (admin AI Spend page)" });
          if (error) throw error;
        }
        return jsonResponse({ ok: true, budget: amount || null });
      }

      default:
        return errorResponse("Unknown action", 400);
    }
  } catch (err) {
    console.error("admin-ai-spend error:", err);
    return errorResponse(err);
  }
});
