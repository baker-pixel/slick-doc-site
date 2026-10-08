// Lead outreach only ever sends from the client's own connected SMTP mailbox
// (never the shared sender), so lead discovery and drip enrollment are gated
// on the client having one saved.
export const NO_MAILBOX_MESSAGE =
  "Connect your email inbox before lead outreach can start. Lead discovery and outreach are paused until then.";

// deno-lint-ignore no-explicit-any
export async function clientIdsWithMailbox(supabase: any, clientIds: string[]): Promise<Set<string>> {
  if (clientIds.length === 0) return new Set();
  const { data } = await supabase
    .from("client_oauth_tokens")
    .select("client_id")
    .eq("platform", "smtp")
    .in("client_id", clientIds);
  return new Set(((data ?? []) as { client_id: string }[]).map((r) => r.client_id));
}
