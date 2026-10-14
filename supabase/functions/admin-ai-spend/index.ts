import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import {
  buildReport, explainError, fetchBuckets, OpenAIApiError, parseCostBuckets, parseUsageBuckets,
  type Attribution, type CostRow, type UsageRow,
} from "../_shared/openaiSpend.ts";

// Admin AI Spend & Budget backend. OpenAI is the source of truth for dollars.
//   { action: "overview", force? }  -> the report (live from OpenAI's Costs/Usage APIs, cached 10 min)
//   { action: "set_budget", amount } -> monthly budget in USD (0/null clears it)
// Needs the OPENAI_ADMIN_KEY secret (an organization Admin key). It never leaves this function.
// Admin only (session or password).

const BUDGET_KEY = "ai_monthly_budget_usd";
const MAX_BUDGET = 1_000_000;
const CACHE_KEY = "openai_spend_v1";
const FRESH_MS = 10 * 60_000;

interface Snapshot { costs: CostRow[]; usage: UsageRow[]; usage_available: boolean; other_currencies: string[]; fetched_at: string }
type Supabase = ReturnType<typeof serviceClient>;

async function loadFromOpenAI(adminKey: string, now: Date): Promise<Snapshot> {
  // Costs and usage for last month and this month.
  const start = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1) / 1000);
  const costBuckets = await fetchBuckets("costs", adminKey, { start_time: String(start), bucket_width: "1d", limit: "180", group_by: ["line_item"] });
  const { rows, otherCurrencies } = parseCostBuckets(costBuckets);

  // Request/token counts are a nicety. If only these fail, the dollars are still right.
  let usage: UsageRow[] = [];
  let usageAvailable = true;
  try {
    usage = parseUsageBuckets(await fetchBuckets("usage/completions", adminKey, { start_time: String(start), bucket_width: "1d", limit: "31", group_by: ["model"] }));
  } catch (e) {
    usageAvailable = false;
    console.warn("OpenAI usage endpoint unavailable (costs still fine):", e instanceof Error ? e.message : e);
  }
  return { costs: rows, usage, usage_available: usageAvailable, other_currencies: otherCurrencies, fetched_at: now.toISOString() };
}

async function overview(supabase: Supabase, force: boolean) {
  const now = new Date();
  const { data, error } = await supabase.rpc("ai_usage_attribution");
  if (error) throw error;
  const attribution = data as Attribution;
  const build = (s: Snapshot | null) => buildReport({ costs: s?.costs ?? [], usage: s?.usage ?? [], attribution, now });

  const adminKey = Deno.env.get("OPENAI_ADMIN_KEY");
  if (!adminKey) {
    const problem = explainError(new OpenAIApiError("not_connected", "no admin key"));
    return { state: "not_connected", problem, fetched_at: null, usage_available: false, other_currencies: [], report: build(null) };
  }

  const { data: cached } = await supabase.from("ai_spend_cache").select("payload, fetched_at").eq("key", CACHE_KEY).maybeSingle();
  const cachedSnap = (cached?.payload ?? null) as Snapshot | null;
  const age = cached ? now.getTime() - new Date(cached.fetched_at).getTime() : Infinity;
  if (!force && cachedSnap && age < FRESH_MS) {
    return { state: "ok", problem: null, fetched_at: cachedSnap.fetched_at, usage_available: cachedSnap.usage_available, other_currencies: cachedSnap.other_currencies, report: build(cachedSnap) };
  }

  try {
    const snap = await loadFromOpenAI(adminKey, now);
    await supabase.from("ai_spend_cache").upsert({ key: CACHE_KEY, payload: snap, fetched_at: snap.fetched_at }, { onConflict: "key" });
    return { state: "ok", problem: null, fetched_at: snap.fetched_at, usage_available: snap.usage_available, other_currencies: snap.other_currencies, report: build(snap) };
  } catch (e) {
    const err = e instanceof OpenAIApiError ? e : new OpenAIApiError("server", e instanceof Error ? e.message : "unknown error");
    console.error("OpenAI spend fetch failed:", err.kind, err.status, err.message);
    const problem = { ...explainError(err), detail: err.message };
    // Show the last good numbers if we have them, clearly marked as out of date.
    if (cachedSnap) return { state: "stale", problem, fetched_at: cachedSnap.fetched_at, usage_available: cachedSnap.usage_available, other_currencies: cachedSnap.other_currencies, report: build(cachedSnap) };
    return { state: "error", problem, fetched_at: null, usage_available: false, other_currencies: [], report: build(null) };
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
