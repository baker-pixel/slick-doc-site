// Small helpers for claims and unique-violation handling (eng-review fix IDEM-1).
//
// pg_cron fires and forgets, so two runs of the same job can overlap. Two guards:
//  - claimSlot(): an atomic per-row lease (public.claim_content_slot) so two overlapping
//    drafting runs don't both draft, and pay for, the same slot.
//  - isUniqueViolation(): lets an insert that loses a race against a UNIQUE index be
//    treated as "someone else already did this" instead of an error.

export type SlotClaim = "claimed" | "taken" | "unavailable";

/**
 * Takes a short lease on a content slot. "taken" means another run holds it (skip).
 * "unavailable" means the claim function is not in the database yet (migration not
 * applied): proceed without a lease rather than stop all drafting. Any other database
 * error throws.
 */
// deno-lint-ignore no-explicit-any
export async function claimSlot(supabase: any, slotId: string, ttlMinutes = 10): Promise<SlotClaim> {
  const { data, error } = await supabase.rpc("claim_content_slot", {
    p_id: slotId,
    p_ttl: `${ttlMinutes} minutes`,
  });
  if (error) {
    // 42883 = undefined_function, PGRST202 = PostgREST cannot find the function
    if (error.code === "42883" || error.code === "PGRST202") return "unavailable";
    throw new Error(`slot claim failed: ${error.message}`);
  }
  return data === true ? "claimed" : "taken";
}

/** True for a Postgres unique_violation (23505), from an insert that lost a race. */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
