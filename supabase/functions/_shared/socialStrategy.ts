// Phase D — the Social Engine's strategy layer. Turns a client's context +
// tier into a durable content strategy (pillars + cadence), stored as a
// kind='social' Project ("Social Media Plan") the client sees, and read back
// by fill-scheduled-content so every post ladders up to a pillar instead of
// being an ad-hoc one-off.

import { callAIJson, MODELS } from "./ai.ts";
import type { TierPolicy } from "./tierPolicy.ts";
import { hasBusinessContext } from "./businessContext.ts";
import { billingPeriodStart } from "./billingPeriod.ts";

interface StrategyClient {
  id: string;
  business_name: string;
  industry?: string | null;
  context_profile?: Record<string, unknown> | null;
  /** Signup anchor for the rolling "posts this period" window. Falls back to
   * created_at, then to now (a same-day client just starting their period). */
  onboarded_at?: string | null;
  created_at?: string | null;
}

export interface Pillar { name: string; description: string; }

export async function upsertSocialStrategy(
  supabase: any,
  client: StrategyClient,
  policy: TierPolicy,
): Promise<{ projectId: string | null; pillars: Pillar[] }> {
  // Don't derive pillars from "unknown"/"n/a" -- that's guessing, not
  // strategy. Every caller already treats a null projectId as "not ready".
  if (!hasBusinessContext(client)) return { projectId: null, pillars: [] };

  const ctx = client.context_profile ?? {};
  const services = Array.isArray(ctx.services) ? (ctx.services as string[]).join(", ") : "";
  const audience = typeof ctx.target_audience === "string" ? ctx.target_audience : "";
  const differentiators = Array.isArray(ctx.differentiators) ? (ctx.differentiators as string[]).join("; ") : "";
  const summary = typeof ctx.business_summary === "string" ? ctx.business_summary : "";

  // Look up the existing plan (and its pillar names) up front -- on a regen,
  // business context is usually unchanged, so without telling the model
  // what's already there it tends to just re-derive the same 3-5 pillars.
  const { data: existing } = await supabase
    .from("client_projects").select("id").eq("client_account_id", client.id).eq("kind", "social").maybeSingle();
  let existingM: { id: string; metadata: any }[] = [];
  if (existing) {
    const { data } = await supabase
      .from("project_milestones").select("id, metadata").eq("project_id", existing.id);
    existingM = data ?? [];
  }
  const existingPillarNames = existingM.map((m) => m.metadata?.pillar).filter((n): n is string => !!n);
  const evolveInstruction = existingPillarNames.length
    ? `\n\nCurrent pillars: ${existingPillarNames.join(", ")}. This is a monthly refresh, not a first draft -- keep what's still genuinely on-strategy, but evolve or replace at least one with a fresher angle. Don't just re-list the same pillars unchanged.`
    : "";

  let pillars: Pillar[] = [];
  try {
    const res = await callAIJson<{ pillars?: Pillar[] }>({
      source: "generate-social-strategy",
      clientId: client.id,
      model: MODELS.default,
      jsonMode: true,
      maxTokens: 600,
      promptId: "social-strategy.v1",
      system: `You are a social media strategist. Define 3-5 content pillars -- recurring themes this business posts about -- grounded in what they actually do. Each pillar: a short name and one sentence on what it covers and why it matters to their audience. Return ONLY {"pillars":[{"name","description"}]}.`,
      prompt: `Business: ${client.business_name}\nIndustry: ${client.industry ?? "unknown"}\nServices: ${services || "unknown"}\nAudience: ${audience || "unknown"}\nDifferentiators: ${differentiators || "n/a"}\nSummary: ${summary || "n/a"}\nPlatforms in plan: ${policy.social.contentTypes.join(", ")}.${evolveInstruction}`,
    });
    pillars = (res.pillars ?? []).filter((p) => p?.name).slice(0, 5);
  } catch (e) {
    console.error("social strategy generation failed:", e instanceof Error ? e.message : e);
    return { projectId: null, pillars: [] };
  }
  if (pillars.length === 0) return { projectId: null, pillars: [] };

  const description = `${policy.social.postsPerMonth} posts/month across ${policy.social.contentTypes.length} channel(s). ${pillars.length} content pillars guide what gets posted and why.`;

  const now = new Date().toISOString();
  let projectId: string;
  if (existing) {
    projectId = existing.id;
    await supabase.from("client_projects").update({ description, pillars_generated_at: now, updated_at: now }).eq("id", projectId);
  } else {
    const { data: created, error } = await supabase.from("client_projects").insert({
      client_account_id: client.id, kind: "social", name: "Social Media Plan",
      description, status: "in_progress", start_date: new Date().toISOString().slice(0, 10), progress_percentage: 0,
      pillars_generated_at: now,
    }).select("id").single();
    if (error || !created) { console.error("upsertSocialStrategy: create failed", error?.message); return { projectId: null, pillars }; }
    projectId = created.id;
  }

  // Pillars are milestones (ongoing themes, not completable tasks).
  const byPillar = new Map<string, string>(existingM.filter((m) => m.metadata?.pillar).map((m) => [m.metadata.pillar, m.id]));
  const currentNames = new Set(pillars.map((p) => p.name));

  let sort = 0;
  for (const p of pillars) {
    sort++;
    const existingId = byPillar.get(p.name);
    const row = {
      name: p.name, description: p.description, sort_order: sort, status: "in_progress",
      // See seoProject.ts for the source_engine/relevant_to pull-model contract.
      metadata: { pillar: p.name, source_engine: "social", relevant_to: [] as string[] },
    };
    if (existingId) await supabase.from("project_milestones").update(row).eq("id", existingId);
    else await supabase.from("project_milestones").insert({ project_id: projectId, ...row });
  }
  // Drop pillars no longer in the strategy.
  for (const m of existingM) {
    const name = m.metadata?.pillar;
    if (name && !currentNames.has(name)) await supabase.from("project_milestones").delete().eq("id", m.id);
  }

  // Progress = posts published this billing period (rolling 30d from the
  // client's own signup date, not the calendar 1st) vs the tier target.
  const periodStart = billingPeriodStart(client.onboarded_at ?? client.created_at ?? now);
  const { count: published } = await supabase
    .from("content_calendar").select("id", { count: "exact", head: true })
    .eq("client_account_id", client.id).eq("status", "published").gte("scheduled_for", periodStart.toISOString());
  const progress = policy.social.postsPerMonth > 0 ? Math.min(100, Math.round((100 * (published ?? 0)) / policy.social.postsPerMonth)) : 0;
  // Unlike seoProject.ts/prospectProject.ts, this used to never touch status --
  // a bootstrap-created 'awaiting_setup' shell would stay stuck at that status
  // forever even after real pillars/progress exist. Always in_progress here:
  // a social plan has no terminal "completed" state (pillars are ongoing themes).
  await supabase.from("client_projects").update({ progress_percentage: progress, status: "in_progress", updated_at: new Date().toISOString() }).eq("id", projectId);

  return { projectId, pillars };
}

/**
 * Recompute the Social Media Plan's progress (posts published this billing
 * period, rolling 30d from `signupAnchor`, vs the tier target) without
 * touching pillars or calling any LLM. Cheap enough to run after every
 * publish. No-op if the client has no plan.
 */
export async function refreshSocialPlanProgress(
  supabase: any,
  clientId: string,
  postsPerMonthTarget: number,
  signupAnchor: string | Date,
): Promise<void> {
  const { data: project } = await supabase
    .from("client_projects").select("id").eq("client_account_id", clientId).eq("kind", "social").maybeSingle();
  if (!project) return;

  const periodStart = billingPeriodStart(signupAnchor);
  const { count: published } = await supabase
    .from("content_calendar").select("id", { count: "exact", head: true })
    .eq("client_account_id", clientId).eq("status", "published").gte("scheduled_for", periodStart.toISOString());
  const progress = postsPerMonthTarget > 0 ? Math.min(100, Math.round((100 * (published ?? 0)) / postsPerMonthTarget)) : 0;
  await supabase.from("client_projects")
    .update({ progress_percentage: progress, status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", project.id);
}

/** Read the client's active content pillars (for on-strategy content generation). */
export async function getSocialPillars(supabase: any, clientId: string): Promise<string[]> {
  const { data: project } = await supabase
    .from("client_projects").select("id").eq("client_account_id", clientId).eq("kind", "social").maybeSingle();
  if (!project) return [];
  const { data: ms } = await supabase
    .from("project_milestones").select("name, sort_order").eq("project_id", project.id).order("sort_order", { ascending: true });
  return (ms ?? []).map((m: any) => m.name);
}
