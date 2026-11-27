// Atomic per-row lease (public.claim_content_slot) so two overlapping fill-scheduled-content
// runs don't both draft, and pay for, the same slot. pg_cron fires and forgets, so runs overlap.

/** Takes a short lease on a content slot. False means another run holds it (skip). */
// deno-lint-ignore no-explicit-any
export async function claimSlot(supabase: any, slotId: string, ttlMinutes = 10): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_content_slot", {
    p_id: slotId,
    p_ttl: `${ttlMinutes} minutes`,
  });
  if (error) throw new Error(`slot claim failed: ${error.message}`);
  return data === true;
}
