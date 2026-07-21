// deno-lint-ignore-file no-explicit-any
// The one explicit side effect of onboarding completion (besides flipping
// the client active): seed the shared context_profile from the original
// lead's gap-analysis submission, via client_accounts.lead_id. One-time and
// merge-not-overwrite -- anything the client's own intake form or an admin
// already entered wins over what the lead form said. This never triggers an
// engine; engines pull context on their own schedule.
export async function seedContextFromLead(supabase: any, clientId: string): Promise<{ seeded: boolean }> {
  const { data: client } = await supabase
    .from("client_accounts")
    .select("id, lead_id, context_profile")
    .eq("id", clientId)
    .maybeSingle();

  if (!client?.lead_id) return { seeded: false };

  const existingCtx = (client.context_profile || {}) as Record<string, unknown>;
  if (existingCtx.seeded_from_lead_at) return { seeded: false };

  const { data: submission } = await supabase
    .from("gap_analysis_submissions")
    .select("context_profile")
    .eq("id", client.lead_id)
    .maybeSingle();

  const leadCtx = (submission?.context_profile || null) as Record<string, unknown> | null;
  if (!leadCtx) return { seeded: false };

  const merged = {
    ...leadCtx,
    ...existingCtx,
    seeded_from_lead_at: new Date().toISOString(),
  };

  await supabase.from("client_accounts").update({ context_profile: merged }).eq("id", clientId);
  return { seeded: true };
}

// Same field-mapping heuristic generate-analysis uses to build context_profile
// -- no AI call, just reshaping raw gap-analysis answers. Kept in sync with
// that function's inline version; if one changes, update the other.
export function deriveContextFromGapAnalysis(g: Record<string, unknown>): Record<string, unknown> {
  const rawGoals = g.top_business_goals;
  const primaryGoals: string[] = Array.isArray(rawGoals) ? rawGoals as string[] : (typeof rawGoals === "string" && rawGoals ? [rawGoals] : []);
  const rawDiff = g.unique_differentiator;
  const differentiators: string[] = typeof rawDiff === "string" && rawDiff.trim() ? [rawDiff.trim()] : [];
  const rawFrustration = g.biggest_marketing_frustration;
  const painPoints: string[] = typeof rawFrustration === "string" && rawFrustration.trim() ? [rawFrustration.trim()] : [];

  return {
    services: [],
    primary_goals: primaryGoals,
    differentiators,
    pain_points: painPoints,
    target_audience: typeof g.primary_customer_sources === "string" ? g.primary_customer_sources : "",
    success_criteria: typeof g.what_makes_it_worth_it === "string" ? g.what_makes_it_worth_it : "",
    urgency: typeof g.fastest_impact === "string" ? g.fastest_impact : "",
    fears: typeof g.biggest_agency_fear === "string" ? g.biggest_agency_fear : "",
    business_summary: `${g.business_name || "A local business"} focused on ${primaryGoals.join(", ") || "growing their customer base"}.`,
    source: "gap_form",
  };
}

// Runs right after a client-portal user (re-)submits the SYSTEM Gap Analysis.
// Direct browser writes to client_accounts are RLS-blocked without a portal
// session (see 20260713000000_close_legacy_blanket_rls_policies.sql), and the
// marketing-site submit flow has none -- so this has to run server-side with
// the service role. Mirrors generate-analysis's client-sync step, just
// without the admin-gated AI report.
export async function syncClientAccountFromSubmission(
  supabase: any,
  submission: Record<string, unknown>,
): Promise<{ synced: boolean }> {
  const email = submission.email as string | undefined;
  if (!email) return { synced: false };

  const { data: clientAccount } = await supabase
    .from("client_accounts")
    .select("id, context_profile")
    .ilike("email", email)
    .maybeSingle();

  if (!clientAccount) return { synced: false };

  const existingCtx = (clientAccount.context_profile || {}) as Record<string, unknown>;
  const mergedCtx = { ...existingCtx, ...deriveContextFromGapAnalysis(submission) };

  await supabase
    .from("client_accounts")
    .update({ context_profile: mergedCtx, intake_completed_at: new Date().toISOString() })
    .eq("id", clientAccount.id);

  return { synced: true };
}
