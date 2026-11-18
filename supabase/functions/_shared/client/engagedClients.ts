// A client_account can be "active" without anyone able to see the work: the
// portal invite may still be sitting unaccepted. Generating AI content/audits
// for those clients burns spend on drafts nobody can review (they auto-delete
// via cleanup-expired-draft-content after a 1-day grace, unseen). Engines that
// sweep "active" clients should filter through this first.
export async function filterEngagedClients<T extends { id: string }>(
  supabase: any,
  clients: T[],
): Promise<T[]> {
  if (clients.length === 0) return clients;

  const { data: portalUsers, error } = await supabase
    .from("client_portal_users")
    .select("client_account_id")
    .in("client_account_id", clients.map((c) => c.id));
  if (error) throw new Error(`Failed to check portal access: ${error.message}`);

  const engagedIds = new Set((portalUsers ?? []).map((p: any) => p.client_account_id));
  return clients.filter((c) => engagedIds.has(c.id));
}
