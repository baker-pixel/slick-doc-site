import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ContentFeedbackItem {
  content_type: string;
  title: string;
  reason: string;
}

const REJECTED_STATUSES = ["rejected", "changes_requested"];

/**
 * Most recent rejection/changes-requested reasons for a client, so the next
 * generation call can avoid repeating known issues instead of starting from
 * zero every time. Best-effort: callers should treat failures as "no
 * feedback available" rather than blocking generation.
 */
export async function getRecentContentFeedback(
  supabase: SupabaseClient,
  clientId: string,
  limit = 5,
): Promise<ContentFeedbackItem[]> {
  const { data, error } = await supabase
    .from("generated_content")
    .select("content_type, title, rejection_reason")
    .eq("client_id", clientId)
    .in("status", REJECTED_STATUSES)
    .not("rejection_reason", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data
    .filter((row): row is { content_type: string; title: string; rejection_reason: string } => !!row.rejection_reason)
    .map((row) => ({
      content_type: row.content_type,
      title: row.title,
      reason: row.rejection_reason,
    }));
}

export function feedbackToPromptBlock(items: ContentFeedbackItem[]): string {
  if (items.length === 0) return "";
  const lines = [
    "RECENT FEEDBACK ON PAST DRAFTS FOR THIS CLIENT (do not repeat these issues):",
    ...items.map((item) => `- [${item.content_type}] "${item.title}": ${item.reason}`),
  ];
  return lines.join("\n");
}

export interface ApprovedContentItem {
  content_type: string;
  title: string;
  content: string;
}

const APPROVED_STATUSES = ["approved", "client_approved", "published"];

/**
 * Recent content this client actually approved, so generation has a real
 * example of what "good" looks like for them, not just a list of what to
 * avoid. The rejection-feedback loop only captures misses; this is the
 * other half -- what worked and should be repeated.
 */
export async function getRecentApprovedContent(
  supabase: SupabaseClient,
  clientId: string,
  limit = 3,
): Promise<ApprovedContentItem[]> {
  const { data, error } = await supabase
    .from("generated_content")
    .select("content_type, title, content")
    .eq("client_id", clientId)
    .in("status", APPROVED_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    content_type: row.content_type,
    title: row.title || "Untitled",
    content: row.content,
  }));
}

export function approvedContentToPromptBlock(items: ApprovedContentItem[]): string {
  if (items.length === 0) return "";
  const lines = [
    "CONTENT THIS CLIENT HAS ALREADY APPROVED (match this voice, tone, and quality bar):",
    ...items.map((item) => `- [${item.content_type}] "${item.title}":\n${item.content.slice(0, 400)}`),
  ];
  return lines.join("\n\n");
}
