// Phase F — record and read business-outcome signals. Best-effort writes
// (never break the caller). This is the input the feedback loops learn from.

export interface OutcomeEntry {
  source: string;   // 'seo' | 'social' | 'prospect'
  metric: string;   // 'seo_score' | 'prospect_converted' | ...
  value: number;
  periodStart?: string;
  periodEnd?: string;
  metadata?: Record<string, unknown>;
}

export async function recordOutcome(supabase: any, clientId: string, e: OutcomeEntry): Promise<void> {
  if (!clientId) return;
  try {
    await supabase.from("outcome_metrics").insert({
      client_account_id: clientId,
      source: e.source,
      metric: e.metric,
      value: e.value,
      period_start: e.periodStart ?? null,
      period_end: e.periodEnd ?? null,
      metadata: e.metadata ?? {},
    });
  } catch (err) {
    console.error("recordOutcome failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Recent conversion "wins" for a client — the prospects that actually became
 * customers. Feeds the fit-scoring loop so the ICP scorer learns what a real
 * win looks like, not just what the ICP said on day one.
 */
export async function getConversionWins(
  supabase: any,
  clientId: string,
  limit = 8,
): Promise<{ name: string; business_type: string | null; summary: string | null }[]> {
  const { data } = await supabase
    .from("prospects")
    .select("name, business_type, context_profile, converted_at, status")
    .eq("client_id", clientId)
    .eq("status", "converted")
    .order("converted_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((p: any) => ({
    name: p.name,
    business_type: p.business_type ?? null,
    summary: typeof p.context_profile?.business_summary === "string" ? p.context_profile.business_summary : null,
  }));
}
