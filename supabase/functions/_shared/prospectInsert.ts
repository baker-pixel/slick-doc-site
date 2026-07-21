// Insert newly-discovered prospects, tolerating the race between two
// concurrent discovery runs for the same client (daily cron + client-portal
// "Find leads now", or two admin tabs). Both callers dedupe with a
// SELECT-then-INSERT check that has a gap; the DB's unique index on
// (client_id, website_url) closes that gap but means a genuine race now
// surfaces as a 23505 on insert instead of a silent duplicate row. Retry
// once with whatever's still actually new rather than failing the batch.
export async function insertNewProspects(
  supabase: any,
  clientId: string,
  rows: Record<string, unknown>[],
): Promise<{ id: string; name: string; website_url: string; city: string | null }[]> {
  const { data, error } = await supabase.from("prospects").insert(rows).select("id, name, website_url, city");
  if (!error) return data ?? [];
  if (error.code !== "23505") throw error;

  const websites = rows.map((r) => r.website_url as string).filter(Boolean);
  const { data: nowExisting } = await supabase
    .from("prospects")
    .select("website_url")
    .eq("client_id", clientId)
    .in("website_url", websites);
  const nowExistingSet = new Set((nowExisting ?? []).map((p: { website_url: string }) => p.website_url));
  const survivors = rows.filter((r) => !nowExistingSet.has(r.website_url as string));
  if (survivors.length === 0) return [];

  const retry = await supabase.from("prospects").insert(survivors).select("id, name, website_url, city");
  if (retry.error) throw retry.error;
  return retry.data ?? [];
}
