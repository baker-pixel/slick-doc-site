// deno-lint-ignore-file no-explicit-any
// The cycle review: when a cycle closes, one AI call reads that cycle's numbers next to the
// cycle before it (cycle_metrics), judges the bets made last time, and proposes at most two new
// bets for the next cycle. It decides nothing alone: code enforces the sample-size rule (small
// samples are always "inconclusive"), caps and shapes the output, and in "shadow" mode the result
// is only stored. In "live" mode its lines are added to `learned`, which the social strategy and
// the lead-research focus already read. Settings (admin_settings, text):
//   cycle_review          off (default) | shadow | live
//   cycle_review_clients  comma-separated client ids; empty = every client
import { callAIJson, MODELS } from "../ai/ai.ts";

export type ReviewMode = "off" | "shadow" | "live";
export type Scope = "social" | "prospect";
export const METRICS = ["posts", "social_views", "leads", "opens", "clicks", "replies", "visits", "seo_score"] as const;
export type Metric = typeof METRICS[number];
export type VerdictKind = "worked" | "failed" | "inconclusive";

export interface Bet { id: string; hypothesis: string; change: string; scope: Scope; metric: Metric }
export interface Verdict { bet_id: string; verdict: VerdictKind; evidence: string }
export interface Review {
  mode: ReviewMode;
  reviewed_cycle_no: number;
  reviewed_at: string;
  verdicts: Verdict[];
  findings: string[];
  bets: Bet[];
  learned: string[];
  /** Lines live mode appends to `learned`; stored so a resumed run does not recompute them. */
  lines: string[];
}

// A change is only believable with enough events in enough days. Same thresholds as the portal card.
export const MIN_DAYS = 5;
export const MIN_EVENTS = 5;
export const MAX_BETS = 2;

/** The slice of cycle_metrics a window carries (see supabase/migrations/20261127100000_cycle_metrics.sql). */
export interface Window {
  window: { days: number };
  social: { published: number; by_platform: Record<string, { views_total: number }> };
  outreach: { leads: number; opens: number; clicks: number; replies: number };
  website: { visits: number };
  seo: { score_end: number | null };
}
export interface CycleMetricsData { cycle: { cycle_no: number }; current: Window; previous: { cycle_no: number; metrics: Window } | null }

export function metricValue(w: Window, m: Metric): number | null {
  switch (m) {
    case "posts": return w.social.published;
    case "social_views": return Object.values(w.social.by_platform).reduce((a, p) => a + p.views_total, 0);
    case "leads": return w.outreach.leads;
    case "opens": return w.outreach.opens;
    case "clicks": return w.outreach.clicks;
    case "replies": return w.outreach.replies;
    case "visits": return w.website.visits;
    case "seo_score": return w.seo.score_end;
  }
}

/** Enough evidence to call a result a win or a loss? Decided in code, never by the model. */
export function sampleOk(d: CycleMetricsData, m: Metric): boolean {
  const p = d.previous?.metrics;
  if (!p) return false;
  const cur = metricValue(d.current, m);
  const prev = metricValue(p, m);
  if (cur === null || prev === null) return false;
  if (m === "seo_score") return true; // a score, not a count of events
  return d.current.window.days >= MIN_DAYS && p.window.days >= MIN_DAYS && cur + prev >= MIN_EVENTS;
}

const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const asList = (v: unknown, max: number, n: number) =>
  (Array.isArray(v) ? v : []).map((x) => clip(x, n)).filter(Boolean).slice(0, max);

/** Shapes the model's JSON into a Review. Unknown bet ids, bad scopes/metrics and extra bets are dropped. */
export function validateReview(raw: any, prior: Bet[], data: CycleMetricsData, mode: ReviewMode, now = new Date()): Review {
  const priorIds = new Set(prior.map((b) => b.id));
  const byId = new Map(prior.map((b) => [b.id, b]));
  const verdicts: Verdict[] = [];
  for (const v of Array.isArray(raw?.verdicts) ? raw.verdicts : []) {
    if (!priorIds.has(v?.bet_id) || verdicts.some((x) => x.bet_id === v.bet_id)) continue;
    const asked: VerdictKind = v.verdict === "worked" || v.verdict === "failed" ? v.verdict : "inconclusive";
    const ok = sampleOk(data, byId.get(v.bet_id)!.metric);
    verdicts.push({ bet_id: v.bet_id, verdict: ok ? asked : "inconclusive", evidence: clip(v.evidence, 300) });
  }
  // A bet nobody judged is still reported, as inconclusive, so it is never silently dropped.
  for (const b of prior) if (!verdicts.some((v) => v.bet_id === b.id)) verdicts.push({ bet_id: b.id, verdict: "inconclusive", evidence: "Not assessed." });

  const bets: Bet[] = [];
  for (const b of Array.isArray(raw?.bets) ? raw.bets : []) {
    if (bets.length >= MAX_BETS) break;
    if ((b?.scope !== "social" && b?.scope !== "prospect") || !METRICS.includes(b?.metric)) continue;
    const hypothesis = clip(b.hypothesis, 240), change = clip(b.change, 240);
    if (!hypothesis || !change) continue;
    bets.push({ id: `c${data.cycle.cycle_no}-b${bets.length + 1}`, hypothesis, change, scope: b.scope, metric: b.metric });
  }
  return {
    mode, reviewed_cycle_no: data.cycle.cycle_no, reviewed_at: now.toISOString(), verdicts,
    findings: asList(raw?.findings, 5, 240), bets, learned: asList(raw?.learned, 4, 200), lines: [],
  };
}

/** Lines appended to `learned` in live mode. The planners already read that list. */
export function reviewLines(r: Omit<Review, "lines">, prior: Bet[]): string[] {
  const byId = new Map(prior.map((b) => [b.id, b]));
  const out: string[] = [];
  for (const v of r.verdicts) {
    const b = byId.get(v.bet_id);
    if (b && v.verdict === "worked") out.push(`Keep doing: ${b.change}`);
    if (b && v.verdict === "failed") out.push(`Stop: ${b.change}`);
  }
  for (const b of r.bets) out.push(`Try this cycle (${b.scope}): ${b.change}`);
  out.push(...r.learned);
  return out.slice(0, 8);
}

export const REVIEW_SYSTEM = `You review one marketing client's last billing cycle for an agency's AI planner.
You get that cycle's numbers next to the cycle before it, the bets made last time, and the client's goals.

Rules:
- Use only the numbers given. Never invent a figure, cause or result.
- Samples are usually small and cycles differ in length. If the data cannot show a difference, say so: verdict "inconclusive", and say what is missing. Do not guess a winner.
- Judge each previous bet against its own metric: "worked", "failed" or "inconclusive".
- Propose at most ${MAX_BETS} new bets. Change little, so the result can be attributed. A bet changes ONE thing the planners control: a content topic or pillar, platform mix or posting cadence (scope "social"), or a lead-research angle (scope "prospect").
- Never propose publishing, sending, brand or offer changes, or spending.
- "metric" must be one of: ${METRICS.join(", ")}.
Reply with JSON only: {"verdicts":[{"bet_id":"","verdict":"","evidence":""}],"findings":[""],"bets":[{"hypothesis":"","change":"","scope":"","metric":""}],"learned":[""]}
"findings" are 3 to 5 plain observations. "learned" are short lines a content planner can follow.`;

export interface ReviewDeps {
  callModel: (system: string, prompt: string, clientId: string) => Promise<unknown>;
  now?: () => Date;
}
const defaultModel: ReviewDeps["callModel"] = (system, prompt, clientId) =>
  callAIJson({ system, prompt, model: MODELS.default, maxTokens: 1500, temperature: 0.2, source: "cycle-review", clientId, promptId: "cycle-review.v1" });

export async function reviewMode(supabase: any, clientId: string): Promise<ReviewMode> {
  const { data } = await supabase.from("admin_settings").select("key, value").in("key", ["cycle_review", "cycle_review_clients"]);
  const get = (k: string) => (data ?? []).find((r: any) => r.key === k)?.value ?? "";
  const mode = get("cycle_review");
  if (mode !== "shadow" && mode !== "live") return "off";
  const only = String(get("cycle_review_clients")).split(",").map((s) => s.trim()).filter(Boolean);
  return only.length === 0 || only.includes(clientId) ? mode : "off";
}

/**
 * Reviews the latest closed cycle before `before` (the cycle now being planned). Returns null when
 * the review is off or there is nothing to review. It throws on a model or database failure; the
 * caller catches that so rollover is never blocked.
 */
export async function runCycleReview(
  supabase: any,
  clientId: string,
  before: { period_end: string },
  deps: ReviewDeps = { callModel: defaultModel },
): Promise<Review | null> {
  const mode = await reviewMode(supabase, clientId);
  if (mode === "off") return null;

  const { data: closed } = await supabase.from("client_cycles").select("id, plan")
    .eq("client_account_id", clientId).eq("status", "closed").lt("period_end", before.period_end)
    .order("period_end", { ascending: false }).limit(1).maybeSingle();
  if (!closed) return null;

  const { data: metrics, error } = await supabase.rpc("cycle_metrics", { p_client_account_id: clientId, p_cycle_id: closed.id });
  if (error) throw new Error(`cycle_metrics failed: ${error.message}`);
  if (!metrics) return null;
  const data = metrics as CycleMetricsData;

  const prior: Bet[] = Array.isArray(closed.plan?.review?.bets) ? closed.plan.review.bets : [];
  const { data: goals } = await supabase.from("client_goals")
    .select("engine, objective, metric, baseline_value, target_value, due_date").eq("client_account_id", clientId).eq("status", "active");

  const prompt = JSON.stringify({ cycle_metrics: data, previous_bets: prior, goals: goals ?? [] });
  const raw = await deps.callModel(REVIEW_SYSTEM, prompt, clientId);
  const review = validateReview(raw, prior, data, mode, deps.now?.());
  review.lines = reviewLines(review, prior);
  return review;
}
