// Prospect engine's client-facing "Project" — same spine as seoProject.ts /
// socialStrategy.ts. One kind='prospect' "Lead Generation Plan" per client,
// milestones = the four funnel stages, each marked completed once the stage
// has real activity. Progress = stages achieved ÷ 4. No LLM, cheap enough to
// run after every discovery/drip run.

const STAGES = [
  { key: "discovered", name: (n: number) => `Prospects discovered (${n})`, desc: "Businesses matching your ideal customer profile, found and researched." },
  { key: "contacted", name: (n: number) => `Prospects contacted (${n})`, desc: "Prospects who received at least one outreach email." },
  { key: "replied", name: (n: number) => `Replies received (${n})`, desc: "Prospects who responded to outreach." },
  { key: "converted", name: (n: number) => `Customers converted (${n})`, desc: "Prospects who became paying customers." },
] as const;

export async function refreshProspectProject(supabase: any, clientId: string): Promise<void> {
  const { data: prospects } = await supabase
    .from("prospects").select("status, drip_step").eq("client_id", clientId);
  const rows: { status: string; drip_step: number | null }[] = prospects ?? [];

  const counts: Record<string, number> = {
    discovered: rows.length,
    contacted: rows.filter((p) => (p.drip_step ?? 0) >= 1).length,
    replied: rows.filter((p) => p.status === "replied").length,
    converted: rows.filter((p) => p.status === "converted").length,
  };

  const { data: existing } = await supabase
    .from("client_projects").select("id").eq("client_account_id", clientId).eq("kind", "prospect").maybeSingle();

  const description = `Outbound lead generation funnel: ${counts.discovered} discovered, ${counts.contacted} contacted, ${counts.replied} replied, ${counts.converted} converted.`;

  let projectId: string;
  if (existing) {
    projectId = existing.id;
    await supabase.from("client_projects").update({ description, updated_at: new Date().toISOString() }).eq("id", projectId);
  } else {
    const { data: created, error } = await supabase.from("client_projects").insert({
      client_account_id: clientId, kind: "prospect", name: "Lead Generation Plan",
      description, status: "in_progress",
      start_date: new Date().toISOString().slice(0, 10), progress_percentage: 0,
    }).select("id").single();
    if (error || !created) { console.error("refreshProspectProject: create failed", error?.message); return; }
    projectId = created.id;
  }

  // Reconcile the four stage milestones by metadata.stage.
  const { data: ms } = await supabase
    .from("project_milestones").select("id, status, metadata").eq("project_id", projectId);
  const byStage = new Map<string, { id: string; status: string }>(
    (ms ?? []).filter((m: any) => m.metadata?.stage).map((m: any) => [m.metadata.stage, { id: m.id, status: m.status }]),
  );

  let done = 0;
  for (let i = 0; i < STAGES.length; i++) {
    const s = STAGES[i];
    const n = counts[s.key];
    const achieved = n > 0;
    if (achieved) done++;
    const row = {
      name: s.name(n), description: s.desc, sort_order: i + 1,
      status: achieved ? "completed" : "pending",
      completed_at: achieved ? new Date().toISOString() : null,
      metadata: { stage: s.key, count: n },
    };
    const ex = byStage.get(s.key);
    if (ex) {
      // Don't churn completed_at on every refresh once a stage is already done.
      if (ex.status === "completed" && achieved) delete (row as any).completed_at;
      await supabase.from("project_milestones").update(row).eq("id", ex.id);
    } else {
      await supabase.from("project_milestones").insert({ project_id: projectId, ...row });
    }
  }

  const progress = Math.round((100 * done) / STAGES.length);
  await supabase.from("client_projects").update({
    progress_percentage: progress,
    status: progress === 100 ? "completed" : "in_progress",
    updated_at: new Date().toISOString(),
  }).eq("id", projectId);

  console.log(`refreshProspectProject client=${clientId} project=${projectId} progress=${progress}%`);
}
