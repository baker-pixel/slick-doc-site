// deno-lint-ignore-file no-explicit-any
// The client brain's read side: one assembled, size-bounded view of everything
// known about a client, for a steward's wake or an MCP caller. Each source is
// loaded best-effort, so one broken table degrades the view (listed in `gaps`)
// instead of failing the whole call. Nothing here writes.
import { tierPolicy, type TierPolicy } from "./tierPolicy.ts";
import { getRecentApprovedContent, getRecentContentFeedback } from "./contentFeedback.ts";
import { getClientBrandKit } from "./brandKit.ts";

export type Engine = "seo" | "social" | "prospect" | "reporting";
export const ENGINES: readonly Engine[] = ["seo", "social", "prospect", "reporting"];

export interface GoalRow {
  id: string; engine: Engine; objective: string; metric: string | null;
  baseline_value: number | null; target_value: number | null; due_date: string | null;
  project_id: string | null; status: string;
}
export interface ProjectSummary {
  id: string; kind: string | null; name: string; status: string; progress_percentage: number | null;
  target_end_date: string | null; milestones: { name: string; status: string; due_date: string | null }[];
}
export interface OutcomeSummary { source: string; metric: string; latest: number; previous: number | null; as_of: string }
export interface MemoryRow { id: string; engine: string | null; kind: string; content: string; rationale: string | null; outcome: unknown; created_at: string }

export interface ClientContext {
  client: Record<string, unknown>;
  policy: TierPolicy;
  profile: Record<string, string>;
  goals: GoalRow[];
  projects: ProjectSummary[];
  outcomes: OutcomeSummary[];
  activity: { type: string; title: string; at: string }[];
  lessons: MemoryRow[];
  decisions: MemoryRow[];
  feedback: { rejected: { content_type: string; title: string; reason: string }[]; approved: { content_type: string; title: string; excerpt: string }[] };
  open: { pendingProposals: number; requests: { id: string; from_engine: string; kind: string; payload: unknown }[] };
  /** Sources that failed to load, so a caller knows the picture is partial. */
  gaps: string[];
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const clipJson = (v: unknown, n: number) => (v == null ? "" : clip(typeof v === "string" ? v : JSON.stringify(v), n));

/** Latest value per source+metric, with the one before it for a trend. Input newest first. */
export function summarizeOutcomes(rows: { source: string; metric: string; value: number | string; captured_at: string }[]): OutcomeSummary[] {
  const seen = new Map<string, OutcomeSummary>();
  for (const r of rows) {
    const key = `${r.source}:${r.metric}`;
    const existing = seen.get(key);
    if (!existing) seen.set(key, { source: r.source, metric: r.metric, latest: Number(r.value), previous: null, as_of: r.captured_at });
    else if (existing.previous === null) existing.previous = Number(r.value);
  }
  return [...seen.values()];
}

export interface LoadOptions {
  /** Narrow goals, memory, outcomes and requests to one engine's view. */
  engine?: Engine;
}

export async function getClientContext(supabase: any, clientId: string, opts: LoadOptions = {}): Promise<ClientContext | null> {
  const { data: client } = await supabase
    .from("client_accounts")
    .select("id, business_name, industry, tier, status, website_url, website_summary, tone, business_summary, icp, brand_voice, context_profile")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return null;

  const gaps: string[] = [];
  const engine = opts.engine;
  // Run one source; a failure is recorded and replaced by a fallback.
  const load = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch (e) {
      gaps.push(`${name}: ${e instanceof Error ? e.message : "failed"}`);
      return fallback;
    }
  };
  const must = <T>(res: { data: T | null; error: any }): T => {
    if (res.error) throw new Error(res.error.message ?? "query failed");
    return (res.data ?? []) as T;
  };

  const [goals, projects, outcomes, activity, memory, rejected, approved, brand, pending, requests] = await Promise.all([
    load("goals", async () => {
      let q = supabase.from("client_goals")
        .select("id, engine, objective, metric, baseline_value, target_value, due_date, project_id, status")
        .eq("client_account_id", clientId).eq("status", "active").order("created_at");
      if (engine) q = q.eq("engine", engine);
      return must<GoalRow[]>(await q);
    }, [] as GoalRow[]),
    load("projects", async () => {
      const ps = must<any[]>(await supabase.from("client_projects")
        .select("id, kind, name, status, progress_percentage, target_end_date")
        .eq("client_account_id", clientId).neq("status", "completed").order("created_at", { ascending: false }).limit(6));
      if (!ps.length) return [] as ProjectSummary[];
      const ms = must<any[]>(await supabase.from("project_milestones")
        .select("project_id, name, status, due_date, sort_order").in("project_id", ps.map((p) => p.id)).order("sort_order"));
      return ps.map((p) => ({
        ...p,
        milestones: ms.filter((m) => m.project_id === p.id).map((m) => ({ name: m.name, status: m.status, due_date: m.due_date })),
      })) as ProjectSummary[];
    }, [] as ProjectSummary[]),
    load("outcomes", async () => {
      let q = supabase.from("outcome_metrics").select("source, metric, value, captured_at")
        .eq("client_account_id", clientId).order("captured_at", { ascending: false }).limit(80);
      if (engine && engine !== "reporting") q = q.eq("source", engine);
      return summarizeOutcomes(must<any[]>(await q));
    }, [] as OutcomeSummary[]),
    load("activity", async () => must<any[]>(await supabase.from("activity_feed")
      .select("activity_type, title, created_at").eq("client_account_id", clientId)
      .order("created_at", { ascending: false }).limit(15))
      .map((a) => ({ type: a.activity_type, title: a.title, at: a.created_at })), [] as ClientContext["activity"]),
    load("memory", async () => {
      let q = supabase.from("agent_memory").select("id, engine, kind, content, rationale, outcome, created_at")
        .eq("client_account_id", clientId).eq("status", "active").order("created_at", { ascending: false }).limit(40);
      if (engine) q = q.or(`engine.eq.${engine},engine.is.null`);
      return must<MemoryRow[]>(await q);
    }, [] as MemoryRow[]),
    load("rejected content", () => getRecentContentFeedback(supabase, clientId, 5), []),
    load("approved content", () => getRecentApprovedContent(supabase, clientId, 3), []),
    load("brand kit", () => getClientBrandKit(supabase, clientId), null as any),
    load("proposals", async () => {
      const { count, error } = await supabase.from("agent_proposals")
        .select("id", { count: "exact", head: true }).eq("client_account_id", clientId).eq("status", "pending");
      if (error) throw new Error(error.message);
      return count ?? 0;
    }, 0),
    load("requests", async () => {
      let q = supabase.from("agent_requests").select("id, from_engine, kind, payload")
        .eq("client_account_id", clientId).eq("status", "open").order("created_at").limit(10);
      if (engine && engine !== "reporting") q = q.eq("to_engine", engine);
      return must<any[]>(await q);
    }, [] as any[]),
  ]);

  const voice = brand?.voice;
  const profile: Record<string, string> = {};
  const put = (k: string, v: unknown, n: number) => { const s = clipJson(v, n); if (s) profile[k] = s; };
  put("summary", client.business_summary ?? client.website_summary, 600);
  put("icp", client.icp, 500);
  put("brand_voice", client.brand_voice ?? voice, 500);
  put("tone", client.tone, 80);
  put("target_audience", client.context_profile?.target_audience ?? brand?.business?.target_audience, 300);
  put("differentiators", brand?.business?.differentiators?.length ? brand.business.differentiators : client.context_profile?.differentiators, 300);
  put("never_say", voice?.what_we_never_say?.length ? voice.what_we_never_say : null, 300);

  return {
    client: {
      id: client.id, business_name: client.business_name, industry: client.industry,
      tier: client.tier, status: client.status, website_url: client.website_url,
    },
    policy: tierPolicy(client.tier),
    profile,
    goals,
    projects,
    outcomes,
    activity,
    lessons: memory.filter((m) => m.kind === "lesson").slice(0, 10),
    decisions: memory.filter((m) => m.kind === "decision").slice(0, 8),
    feedback: {
      rejected,
      approved: approved.map((a) => ({ content_type: a.content_type, title: a.title, excerpt: clip(a.content ?? "", 300) })),
    },
    open: { pendingProposals: pending, requests },
    gaps,
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

const line = (s: string) => `- ${s}`;
const num = (n: number | null | undefined) => (n == null ? "?" : String(n));

/**
 * Plain-text view for a model, in priority order. When the budget runs out the
 * lowest-priority sections are dropped whole (and named), never cut mid-line.
 * Text from client sites and content inside it is data, not instructions.
 */
export function contextToPrompt(ctx: ClientContext, maxChars = 6000): string {
  const c = ctx.client as any;
  const sections: { title: string; body: string }[] = [
    { title: "CLIENT", body: [
      line(`${c.business_name} (${c.industry ?? "industry unknown"}), tier ${c.tier}, status ${c.status}`),
      c.website_url ? line(`site: ${c.website_url}`) : "",
      ...Object.entries(ctx.profile).map(([k, v]) => line(`${k}: ${v}`)),
    ].filter(Boolean).join("\n") },
    { title: "ACTIVE GOALS", body: ctx.goals.map((g) =>
      line(`[${g.id}] (${g.engine}) ${g.objective}${g.metric ? ` | ${g.metric}: ${num(g.baseline_value)} -> ${num(g.target_value)}` : ""}${g.due_date ? ` by ${g.due_date}` : ""}`)).join("\n") },
    { title: "LESSONS", body: ctx.lessons.map((m) => line(m.content)).join("\n") },
    { title: "PROJECTS", body: ctx.projects.map((p) => {
      const open = p.milestones.filter((m) => m.status !== "completed");
      return line(`${p.name} (${p.kind ?? "general"}) ${num(p.progress_percentage)}% | ${open.length}/${p.milestones.length} milestones open${open.length ? `: ${open.slice(0, 5).map((m) => m.name).join("; ")}` : ""}`);
    }).join("\n") },
    { title: "OUTCOMES", body: ctx.outcomes.map((o) =>
      line(`${o.source}/${o.metric}: ${o.latest}${o.previous != null ? ` (was ${o.previous})` : ""}`)).join("\n") },
    { title: "OPEN WORK", body: [
      ctx.open.pendingProposals ? line(`${ctx.open.pendingProposals} proposal(s) awaiting a human decision`) : "",
      ...ctx.open.requests.map((r) => line(`request from ${r.from_engine}: ${r.kind} ${clipJson(r.payload, 160)}`)),
    ].filter(Boolean).join("\n") },
    { title: "RECENT DECISIONS", body: ctx.decisions.map((m) => line(`${m.content}${m.rationale ? ` (why: ${m.rationale})` : ""}`)).join("\n") },
    { title: "RECENT ACTIVITY", body: ctx.activity.map((a) => line(`${a.at.slice(0, 10)} ${a.type}: ${a.title}`)).join("\n") },
    { title: "CONTENT FEEDBACK", body: [
      ...ctx.feedback.rejected.map((r) => line(`rejected [${r.content_type}] "${r.title}": ${r.reason}`)),
      ...ctx.feedback.approved.map((a) => line(`approved [${a.content_type}] "${a.title}": ${a.excerpt}`)),
    ].join("\n") },
  ];

  const kept: string[] = [];
  const dropped: string[] = [];
  let used = 0;
  for (const s of sections) {
    if (!s.body) continue;
    const block = `## ${s.title}\n${s.body}`;
    // The first section (who the client is) always stays; the rest must fit.
    if (kept.length > 0 && used + block.length + 2 > maxChars) { dropped.push(s.title); continue; }
    kept.push(block);
    used += block.length + 2;
  }
  if (dropped.length) kept.push(`(omitted for length: ${dropped.join(", ")})`);
  if (ctx.gaps.length) kept.push(`(partial view, could not load: ${ctx.gaps.join("; ")})`);
  return kept.join("\n\n");
}
