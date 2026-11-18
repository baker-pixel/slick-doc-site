// Mid-funnel engagement signal: stamps a prospect's first open/click time
// from an email_tracking_events hit. Deliberately writes dedicated columns,
// never `status` -- run-prospect-drip only sends to status='nurture'
// prospects, so an engagement-driven status change would silently stop
// their drip. Best-effort: never breaks the tracking pixel/redirect caller.

export async function markProspectEngagement(
  supabase: any,
  emailLogId: string,
  kind: "open" | "click",
): Promise<void> {
  try {
    const { data: log } = await supabase
      .from("email_logs")
      .select("metadata")
      .eq("id", emailLogId)
      .single();
    const prospectId = log?.metadata?.prospect_id;
    if (!prospectId) return;

    const { data: prospect } = await supabase
      .from("prospects")
      .select("opened_at, clicked_at")
      .eq("id", prospectId)
      .single();
    if (!prospect) return;

    const now = new Date().toISOString();
    const update: Record<string, string> = {};
    if (!prospect.opened_at) update.opened_at = now; // a click implies an open too
    if (kind === "click" && !prospect.clicked_at) update.clicked_at = now;

    if (Object.keys(update).length > 0) {
      await supabase.from("prospects").update(update).eq("id", prospectId);
    }
  } catch (e) {
    console.error(`markProspectEngagement(${kind}) failed:`, e instanceof Error ? e.message : e);
  }
}
