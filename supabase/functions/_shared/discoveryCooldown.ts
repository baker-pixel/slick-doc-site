// Shared "did discovery run recently for this client" check. Used by the
// auto-discover-prospects cron (long cooldown, so it doesn't re-scan a
// client every day) and by discover-prospects/discover-prospects-web
// directly (short cooldown, so a client-portal caller can't rack up Maps/
// OpenAI spend by repeatedly hitting "Find leads now").

export async function recentDiscoveryRun(
  supabase: any,
  clientId: string,
  withinMs: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinMs).toISOString();
  const { data } = await supabase
    .from("client_usage")
    .select("id")
    .eq("client_id", clientId)
    .in("event_type", ["maps_api_call", "prospect_research"])
    .gte("created_at", cutoff)
    .limit(1)
    .maybeSingle();
  return !!data;
}
