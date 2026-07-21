// Phase D — the Social Engine's strategy layer. Turns a client's context +
// tier into a durable content strategy (pillars + cadence), stored as a
// kind='social' Project ("Social Media Plan") the client sees, and read back
// by fill-scheduled-content so every post ladders up to a pillar instead of
// being an ad-hoc one-off.

import { callAIJson, MODELS } from "./ai.ts";
import type { TierPolicy } from "./tierPolicy.ts";

interface StrategyClient {
  id: string;
  business_name: string;
  industry?: string | null;
  context_profile?: Record<string, unknown> | null;
}

export interface Pillar { name: string; description: string; }

export async function upsertSocialStrategy(
  supabase: any,
  client: StrategyClient,
  policy: TierPolicy,
): Promise<{ projectId: string | null; pillars: Pillar[] }> {
  const ctx = client.context_profile ?? {};
  const services = Array.isArray(ctx.services) ? (ctx.services as string[]).join(", ") : "";
  const audience = typeof ctx.target_audience === "string" ? ctx.target_audience : "";
  const differentiators = Array.isArray(ctx.differentiators) ? (ctx.differentiators as string[]).join("; ") : "";
  const summary = typeof ctx.business_summary === "string" ? ctx.business_summary : "";

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
      prompt: `Business: ${client.business_name}\nIndustry: ${client.industry ?? "unknown"}\nServices: ${services || "unknown"}\nAudience: ${audience || "unknown"}\nDifferentiators: ${differentiators || "n/a"}\nSummary: ${summary || "n/a"}\nPlatforms in plan: ${policy.social.contentTypes.join(", ")}.`,
    });
    pillars = (res.pillars ?? []).filter((p) => p?.name).slice(0, 5);
  } catch (e) {
    console.error("social strategy generation failed:", e instanceof Error ? e.message : e);
    return { projectId: null, pillars: [] };
  }
  if (pillars.length === 0) return { projectId: null, pillars: [] };

  const description = `${policy.social.postsPerMonth} posts/month across ${policy.social.contentTypes.length} channel(s). ${pillars.length} content pillars guide what gets posted and why.`;

  // Upsert the single social project for this client.
  const { data: existing } = await supabase
    .from("client_projects").select("id").eq("client_account_id", client.id).eq("kind", "social").maybeSingle();

  let projectId: string;
  if (existing) {
    projectId = existing.id;
    await supabase.from("client_projects").update({ description, updated_at: new Date().toISOString() }).eq("id", projectId);
  } else {
    const { data: created, error } = await supabase.from("client_projects").insert({
      client_account_id: client.id, kind: "social", name: "Social Media Plan",
      description, status: "in_progress", start_date: new Date().toISOString().slice(0, 10), progress_percentage: 0,
    }).select("id").single();
    if (error || !created) { console.error("upsertSocialStrategy: create failed", error?.message); return { projectId: null, pillars }; }
    projectId = created.id;
  }

  // Pillars are milestones (ongoing themes, not completable tasks).
  const { data: existingM } = await supabase.from("project_milestones").select("id, metadata").eq("project_id", projectId);
  const byPillar = new Map<string, string>((existingM ?? []).filter((m: any) => m.metadata?.pillar).map((m: any) => [m.metadata.pillar, m.id]));
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
  for (const m of existingM ?? []) {
    const name = (m as any).metadata?.pillar;
    if (name && !currentNames.has(name)) await supabase.from("project_milestones").delete().eq("id", m.id);
  }

  // Progress = posts published this calendar month vs the tier target.
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const { count: published } = await supabase
    .from("content_calendar").select("id", { count: "exact", head: true })
    .eq("client_account_id", client.id).eq("status", "published").gte("scheduled_for", monthStart.toISOString());
  const progress = policy.social.postsPerMonth > 0 ? Math.min(100, Math.round((100 * (published ?? 0)) / policy.social.postsPerMonth)) : 0;
  // Unlike seoProject.ts/prospectProject.ts, this used to never touch status --
  // a bootstrap-created 'awaiting_setup' shell would stay stuck at that status
  // forever even after real pillars/progress exist. Always in_progress here:
  // a social plan has no terminal "completed" state (pillars are ongoing themes).
  await supabase.from("client_projects").update({ progress_percentage: progress, status: "in_progress", updated_at: new Date().toISOString() }).eq("id", projectId);

  return { projectId, pillars };
}

/**
 * Recompute the Social Media Plan's progress (posts published this calendar
 * month vs the tier target) without touching pillars or calling any LLM.
 * Cheap enough to run after every publish. No-op if the client has no plan.
 */
export async function refreshSocialPlanProgress(
  supabase: any,
  clientId: string,
  postsPerMonthTarget: number,
): Promise<void> {
  const { data: project } = await supabase
    .from("client_projects").select("id").eq("client_account_id", clientId).eq("kind", "social").maybeSingle();
  if (!project) return;

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const { count: published } = await supabase
    .from("content_calendar").select("id", { count: "exact", head: true })
    .eq("client_account_id", clientId).eq("status", "published").gte("scheduled_for", monthStart.toISOString());
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
