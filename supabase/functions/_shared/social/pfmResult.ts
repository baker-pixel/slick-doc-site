import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { flagNeedsReauth, isReconnectError } from "./pfmReauth.ts";

export interface PfmPostResult {
  id: string;
  social_account_id?: string;
  post_id: string;
  success: boolean;
  error: Record<string, unknown> | null;
  platform_data?: { id?: string; url?: string } | null;
}

// Applies a Post for Me per-account result to its content_calendar row. Shared
// by the webhook (push) and reconcile-postforme-posts (pull) so both record the
// same fields. publish-post marks a row "published" as soon as PfM *accepts*
// it; this is what confirms or reverses that once the platform has answered.
export async function applyPfmResult(
  supabase: SupabaseClient,
  item: { id: string; metadata: unknown; client_account_id: string | null; platform: string; title: string | null },
  result: PfmPostResult,
  source: string,
): Promise<void> {
  const meta = (item.metadata as Record<string, unknown>) || {};

  if (result.success) {
    await supabase
      .from("content_calendar")
      .update({
        status: "published",
        // published_at stays as recorded at submission time: this is a late
        // confirmation (the reconciler can run weeks later), not the publish moment.
        error_message: null,
        metadata: {
          ...meta,
          pfm_result_id: result.id,
          platform_post_id: result.platform_data?.id ?? null,
          platform_post_url: result.platform_data?.url ?? null,
          publish_confirmed_at: new Date().toISOString(),
        },
      })
      .eq("id", item.id);
    console.log(`Confirmed publish (${source}): calendar=${item.id} url=${result.platform_data?.url ?? "n/a"}`);
    return;
  }

  // PfM error payloads nest the platform's message: {error:{error:{message}}}.
  const raw = result.error as { message?: string; error?: { message?: string } } | null;
  const errorMsg = (raw?.error?.message ?? raw?.message ?? (raw ? JSON.stringify(raw) : "Platform rejected the post"))
    .replace(/\s+/g, " ")
    .slice(0, 500);

  await supabase
    .from("content_calendar")
    .update({
      status: "failed",
      published_at: null, // it never went live; don't leave a publish time on a failed post
      error_message: errorMsg,
      metadata: { ...meta, pfm_result_id: result.id, error: errorMsg, publish_failed_at: new Date().toISOString() },
    })
    .eq("id", item.id);

  // The platform says the connection itself is the problem (expired token, revoked or missing
  // permissions). Flag the account so the portal asks the client to reconnect, instead of it
  // reading "connected" while every post fails. Best-effort: it must never stop the result
  // from being recorded, and it runs on every delivery because flagging is idempotent.
  if (item.client_account_id && isReconnectError(errorMsg)) {
    try {
      await flagNeedsReauth(supabase, {
        clientId: item.client_account_id,
        platform: item.platform,
        pfmAccountId: result.social_account_id,
      });
    } catch (e) {
      console.error(`Could not flag ${item.platform} account for reconnect (${source}):`, e instanceof Error ? e.message : e);
    }
  }

  // PfM can deliver the same failed result several times (retries, duplicate
  // deliveries), and each delivery used to write its own alert -- one failing
  // post produced six identical admin emails. One alert per PfM post is enough;
  // a retried post gets a new PfM post id and so alerts again.
  const { data: existingAlert } = await supabase
    .from("automation_alerts")
    .select("id")
    .eq("alert_type", "content_publish_failure")
    .eq("source_id", item.id)
    .eq("metadata->>pfm_post_id", result.post_id)
    .limit(1);
  if (existingAlert && existingAlert.length > 0) {
    console.log(`Publish failure already alerted (${source}): calendar=${item.id} pfm=${result.post_id}`);
    return;
  }

  await supabase.from("automation_alerts").insert({
    alert_type: "content_publish_failure",
    severity: "error",
    title: `${item.platform} post failed on the platform`,
    message: `PfM accepted the post but the platform rejected it: ${errorMsg}`,
    source,
    source_id: item.id,
    metadata: { client_account_id: item.client_account_id, title: item.title, pfm_post_id: result.post_id },
  });
  console.error(`Publish failed on platform (${source}): calendar=${item.id} error=${errorMsg}`);
}
