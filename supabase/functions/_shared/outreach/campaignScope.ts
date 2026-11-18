// Validates a caller-supplied campaign_id before discovery tags leads with it:
// it must exist, belong to the same client, and be an active discovery
// campaign. Without this, a client could attach leads to another client's
// campaign (the id is just a uuid in a request body).

// deno-lint-ignore no-explicit-any
export async function resolveDiscoveryCampaign(supabase: any, clientId: string, campaignId: unknown):
  Promise<{ ok: true; campaignId: string | null } | { ok: false; error: string }> {
  if (campaignId === undefined || campaignId === null || campaignId === "") return { ok: true, campaignId: null };
  if (typeof campaignId !== "string") return { ok: false, error: "campaign_id must be a string" };

  const { data, error } = await supabase
    .from("prospect_campaigns")
    .select("id, client_id, kind, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not look up campaign: ${error.message}` };
  if (!data || data.client_id !== clientId) return { ok: false, error: "Campaign not found" };
  if (data.kind !== "discovery") return { ok: false, error: "Only discovery campaigns can receive discovered leads" };
  if (data.status !== "active") return { ok: false, error: `Campaign is ${data.status}` };
  return { ok: true, campaignId: data.id };
}
