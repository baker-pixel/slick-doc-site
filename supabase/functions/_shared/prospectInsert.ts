// Insert newly-discovered prospects, tolerating the race between two
// concurrent discovery runs for the same client (daily cron + client-portal
// "Find leads now", or two admin tabs). Both callers dedupe with a
// SELECT-then-INSERT check that has a gap; the DB's unique index on
// (client_id, website_url) closes that gap but means a genuine race now
// surfaces as a 23505 on insert instead of a silent duplicate row. Retry
// once with whatever's still actually new rather than failing the batch.
//
// A rejected prospect is also a source of 23505s here, since the unique
// index doesn't care about status -- without handling it, a company an
// admin rejected once could never be re-discovered even after its
// circumstances (or the client's ICP) changed. Resurrect rejects older than
// the cooldown instead of dropping them: flip back to "discovered" with the
// freshly scraped data and clear the old fit score/context so it goes
// through enrichment and scoring again like a genuinely new prospect. Keep
// the old email if the fresh scrape didn't find one -- discovery rows always
// start with email: "", so blindly overwriting would erase a prior Hunter
// enrichment.
const REJECTED_RESURRECT_COOLDOWN_DAYS = 90;

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
    .select("id, website_url, status, updated_at")
    .eq("client_id", clientId)
    .in("website_url", websites);
  const existingByUrl = new Map(
    (nowExisting ?? []).map((p: { website_url: string }) => [p.website_url, p]),
  );

  const cooldownCutoff = Date.now() - REJECTED_RESURRECT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const survivors: Record<string, unknown>[] = [];
  const resurrects: { id: string; row: Record<string, unknown> }[] = [];

  for (const row of rows) {
    const existing = existingByUrl.get(row.website_url as string) as
      | { id: string; status: string; updated_at: string }
      | undefined;
    if (!existing) {
      survivors.push(row);
    } else if (
      existing.status === "rejected" &&
      new Date(existing.updated_at).getTime() < cooldownCutoff
    ) {
      resurrects.push({ id: existing.id, row });
    }
    // else: genuine duplicate (active, or rejected too recently) -- drop it.
  }

  const results: { id: string; name: string; website_url: string; city: string | null }[] = [];

  if (survivors.length > 0) {
    const retry = await supabase.from("prospects").insert(survivors).select("id, name, website_url, city");
    if (retry.error) throw retry.error;
    results.push(...(retry.data ?? []));
  }

  for (const { id, row } of resurrects) {
    const patch: Record<string, unknown> = {
      ...row,
      status: "discovered",
      context_profile: null,
      icp_fit_score: null,
      icp_fit_reason: null,
    };
    if (!patch.email) delete patch.email;

    const { data: updated, error: updateErr } = await supabase
      .from("prospects")
      .update(patch)
      .eq("id", id)
      .select("id, name, website_url, city")
      .single();
    if (updateErr) {
      console.error(`Resurrect failed for prospect ${id}:`, updateErr.message);
      continue;
    }
    if (updated) results.push(updated);
  }

  return results;
}
