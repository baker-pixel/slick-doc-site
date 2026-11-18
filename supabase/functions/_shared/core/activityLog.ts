// Phase C — one shared "work done" log. Every engine writes what it did here
// (best-effort, never throws), so the reporting agent can narrate the period
// truthfully from a single queryable record instead of guessing.

export interface ActivityEntry {
  type: string;          // e.g. "seo_audit", "content_published", "prospect_contacted"
  title: string;         // short, client-readable
  description?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(supabase: any, clientId: string, entry: ActivityEntry): Promise<void> {
  if (!clientId) return;
  try {
    await supabase.from("activity_feed").insert({
      client_account_id: clientId,
      activity_type: entry.type,
      title: entry.title,
      description: entry.description ?? null,
      icon: entry.icon ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    // Logging must never affect the caller's work.
    console.error("logActivity failed:", e instanceof Error ? e.message : e);
  }
}
