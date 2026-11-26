// Atomic claim for postforme-publish-post (eng-review fix IDEM-1).
//
// The claim used `.neq("status", "published")`, so a row already "processing" (an
// in-flight publish by another cron run or an admin click) could be claimed AGAIN and
// posted twice. It must refuse both published and processing rows. Stuck "processing"
// rows are still recovered: publish-scheduled-content resets claims older than 15 min
// back to "scheduled" before it dispatches, and that is the only path that re-opens them.

export const UNCLAIMABLE_STATUSES = ["published", "processing"] as const;

export interface ClaimResult {
  claimed: boolean;
  error?: string;
}

// deno-lint-ignore no-explicit-any
export async function claimForPublish(supabase: any, id: string): Promise<ClaimResult> {
  const { data, error } = await supabase
    .from("content_calendar")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", id)
    .not("status", "in", `(${UNCLAIMABLE_STATUSES.join(",")})`)
    .select("id");
  if (error) return { claimed: false, error: error.message };
  return { claimed: Array.isArray(data) && data.length > 0 };
}
