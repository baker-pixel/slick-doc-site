// Phase A — turn a completed SEO audit into the client's SEO "Project" plan,
// reconciled across audits so progress reflects real improvement over time.
//
// Findings (which are per-page) are collapsed to one plan item per check type
// -- "Add meta descriptions (7 pages)" -- ordered by impact ÷ effort. Each
// becomes a project_milestone. On a later audit: a check that's gone flips its
// milestone to completed; a check still present stays open; a new check is
// added. Progress = completed ÷ total milestones.

// Informational findings aren't actionable, so they never become plan items.
const NON_ACTIONABLE = new Set(["perf_not_measured", "render_required"]);

interface AuditFinding {
  check_id: string; title: string; category: string; severity: string;
  impact: number; effort: number; plain_english: string; technical_detail: string;
  pages: string[]; wp_applyable: boolean;
}
interface AuditRow {
  id: string;
  score: number | null;
  results: { status?: string; findings?: AuditFinding[] } | null;
}

export async function upsertSeoProject(supabase: any, clientId: string, audit: AuditRow): Promise<string | null> {
  const results = audit.results;
  if (!results || results.status !== "complete") return null;
  const findings = results.findings ?? [];

  // Collapse per-page findings → one plan item per check type.
  const byCheck = new Map<string, {
    check_id: string; title: string; category: string; severity: string;
    impact: number; effort: number; plain_english: string; technical_detail: string;
    pages: Set<string>; wp_applyable: boolean;
  }>();
  for (const f of findings) {
    if (NON_ACTIONABLE.has(f.check_id)) continue;
    const cur = byCheck.get(f.check_id);
    if (!cur) {
      byCheck.set(f.check_id, { ...f, pages: new Set(f.pages) });
    } else {
      f.pages.forEach((p) => cur.pages.add(p));
    }
  }
  const planItems = [...byCheck.values()].sort((a, b) => (b.impact / b.effort) - (a.impact / a.effort));

  // Find or create the client's single SEO project.
  const { data: existingProject } = await supabase
    .from("client_projects").select("id").eq("client_account_id", clientId).eq("kind", "seo").maybeSingle();

  const description = audit.score == null
    ? `SEO improvement plan generated from the latest site audit. ${planItems.length} improvements identified.`
    : `Current SEO score ${audit.score}/100. ${planItems.length} improvement${planItems.length === 1 ? "" : "s"} identified from the latest site audit, prioritized by impact.`;

  let projectId: string;
  if (existingProject) {
    projectId = existingProject.id;
    await supabase.from("client_projects").update({
      description, source_audit_id: audit.id, updated_at: new Date().toISOString(),
    }).eq("id", projectId);
  } else {
    const { data: created, error } = await supabase.from("client_projects").insert({
      client_account_id: clientId, kind: "seo", name: "SEO Action Plan",
      description, status: "in_progress", source_audit_id: audit.id,
      start_date: new Date().toISOString().slice(0, 10), progress_percentage: 0,
    }).select("id").single();
    if (error || !created) { console.error("upsertSeoProject: create failed", error?.message); return null; }
    projectId = created.id;
  }

  // Reconcile milestones by check_id.
  const { data: existing } = await supabase
    .from("project_milestones").select("id, status, metadata").eq("project_id", projectId);
  const existingByCheck = new Map<string, { id: string; status: string }>(
    (existing ?? []).filter((m: any) => m.metadata?.check_id).map((m: any) => [m.metadata.check_id, { id: m.id, status: m.status }]),
  );
  const currentChecks = new Set(planItems.map((i) => i.check_id));

  let sort = 0;
  for (const it of planItems) {
    sort++;
    const pageCount = it.pages.size;
    const name = pageCount > 1 ? `${it.title} (${pageCount} pages)` : it.title;
    const metadata = {
      check_id: it.check_id, category: it.category, severity: it.severity,
      impact: it.impact, effort: it.effort, wp_applyable: it.wp_applyable, pages: [...it.pages],
      // Pull-model contract shared across engine milestone writers (seoProject/
      // socialStrategy/prospectProject): source_engine identifies the writer,
      // relevant_to lists which other engines should treat this as their own
      // work queue (e.g. thin_content tagged relevant_to:['social']). Left
      // empty until a real cross-engine mapping is designed -- not fabricated here.
      source_engine: "seo", relevant_to: [] as string[],
    };
    const ex = existingByCheck.get(it.check_id);
    if (ex) {
      // Still present -> reopen if it had been marked done, refresh copy.
      await supabase.from("project_milestones").update({
        name, description: it.plain_english, sort_order: sort, metadata,
        status: ex.status === "completed" ? "in_progress" : ex.status, completed_at: null,
      }).eq("id", ex.id);
    } else {
      await supabase.from("project_milestones").insert({
        project_id: projectId, name, description: it.plain_english, sort_order: sort, status: "pending", metadata,
      });
    }
  }

  // A milestone whose check no longer appears in the latest audit is resolved.
  for (const m of existing ?? []) {
    const cid = (m as any).metadata?.check_id;
    if (cid && !currentChecks.has(cid) && m.status !== "completed") {
      await supabase.from("project_milestones").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", m.id);
    }
  }

  // Progress = completed ÷ total milestones (rises as issues get fixed).
  const { data: allM } = await supabase.from("project_milestones").select("status").eq("project_id", projectId);
  const total = (allM ?? []).length;
  const done = (allM ?? []).filter((m: any) => m.status === "completed").length;
  const progress = total > 0 ? Math.round((100 * done) / total) : 0;
  await supabase.from("client_projects").update({
    progress_percentage: progress,
    status: total > 0 && done === total ? "completed" : "in_progress",
    updated_at: new Date().toISOString(),
  }).eq("id", projectId);

  console.log(`upsertSeoProject client=${clientId} project=${projectId} items=${planItems.length} progress=${progress}%`);
  return projectId;
}
