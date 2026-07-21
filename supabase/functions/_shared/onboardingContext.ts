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
