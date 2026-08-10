import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { logActivity } from "../_shared/activityLog.ts";
import { refreshSocialPlanProgress } from "../_shared/socialStrategy.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";
import { logAlert } from "../_shared/alerts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resend error `name` values that mean "try again later" rather than "this
// will never work" (bad address, missing field, invalid key, etc).
const RETRYABLE_RESEND_ERRORS = new Set(["rate_limit_exceeded", "internal_server_error", "application_error", "concurrent_idempotent_requests"]);
function isRetryableResendError(name: string | undefined): boolean {
  return !!name && RETRYABLE_RESEND_ERRORS.has(name);
}

// Best-effort bookkeeping after a successful direct publish: activity trail
// for reporting + keep the Social Media Plan progress current.
async function recordPublish(
  supabase: any,
  item: { id: string; client_account_id: string; platform: string; title?: string | null; content?: string | null },
): Promise<void> {
  try {
    await logActivity(supabase, item.client_account_id, {
      type: "content_published",
      title: `Published to ${item.platform}: ${item.title ?? "post"}`,
      description: (item.content ?? "").slice(0, 140),
      icon: "send",
      metadata: { calendar_id: item.id, platform: item.platform },
    });
    const { data: tierRow } = await supabase
      .from("client_accounts").select("tier").eq("id", item.client_account_id).maybeSingle();
    await refreshSocialPlanProgress(supabase, item.client_account_id, tierPolicy(tierRow?.tier).social.postsPerMonth);
  } catch (e) {
    console.error("recordPublish bookkeeping failed:", e instanceof Error ? e.message : e);
  }
}

// Every publish failure used to only write into metadata.error (invisible to
// anything querying the real error_message column) and most paths never
// alerted an admin at all -- 51/55 failed posts over 2.5 months went
// unnoticed. Centralized so every platform branch fails the same visible way.
//
// `retryable` mirrors postforme-publish-post's pattern: a transient failure
// (rate limit, 5xx, timeout) requeues to "scheduled" so the next cron run
// retries, up to MAX_PUBLISH_ATTEMPTS; only then (or for a non-retryable
// error) does it actually fail + alert. Email/blog used to fail permanently
// on the first error with no retry at all, unlike social.
const MAX_PUBLISH_ATTEMPTS = 3;
async function markFailed(
  supabase: any,
  item: { id: string; platform: string; metadata?: unknown },
  msg: string,
  retryable = false,
): Promise<void> {
  const meta = (item.metadata as Record<string, unknown>) || {};
  const attempts = (Number(meta.publish_attempts) || 0) + 1;

  if (retryable && attempts < MAX_PUBLISH_ATTEMPTS) {
    console.warn(`Publish attempt ${attempts}/${MAX_PUBLISH_ATTEMPTS} failed for ${item.id}, will retry: ${msg}`);
    await supabase.from("content_calendar")
      .update({ status: "scheduled", metadata: { ...meta, publish_attempts: attempts, last_error: msg } })
      .eq("id", item.id);
    return;
  }

  await supabase.from("content_calendar")
    .update({
      status: "failed",
      error_message: msg,
      metadata: { ...meta, publish_attempts: attempts, error: msg },
    })
    .eq("id", item.id);

  await logAlert(supabase, {
    source: "publish-scheduled-content",
    alertType: "content_publish_failure",
    severity: "warning",
    title: `Publish failed: ${item.platform}`,
    message: msg,
    sourceId: item.id,
    metadata: { platform: item.platform },
  });
}

// Atomic claim, same pattern postforme-publish-post uses for social: flips
// scheduled -> processing only if still "scheduled", so two overlapping cron
// runs can't both send the same email or double-log the same blog publish.
async function claimItem(supabase: any, id: string): Promise<boolean> {
  const { data: claimedRows, error } = await supabase
    .from("content_calendar")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "scheduled")
    .select("id");
  if (error) {
    console.error(`Claim error for ${id}:`, error.message);
    return false;
  }
  return !!claimedRows && claimedRows.length > 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    // ── Cleanup: reset rows stuck in processing for > 2 hours ──
    // "awaiting_callback" used to also appear here (n8n publish in flight) --
    // n8n is gone and nothing sets that status anymore, so it's dropped.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: stuckPosts } = await supabase
      .from("content_calendar")
      .update({ status: "scheduled", updated_at: new Date().toISOString() })
      .eq("status", "processing")
      .lt("updated_at", twoHoursAgo)
      .select("id, platform, title");

    if (stuckPosts?.length) {
      console.log(`Reset ${stuckPosts.length} stuck posts back to scheduled for retry`);
      for (const post of stuckPosts) {
        await supabase.from("automation_alerts").insert({
          alert_type: "content_publish_timeout",
          severity: "warning",
          title: "Stuck Post Reset for Retry",
          message: `Post "${post.title}" (${post.platform}) was stuck processing for 2h — reset to scheduled.`,
          source: "publish-scheduled-content",
          source_id: post.id,
        });
      }
    }

    // ── Read due items — do NOT bulk-claim here. ──
    // postforme-publish-post owns the atomic claim (scheduled → processing).
    // If we pre-claim here, the publish function sees "processing" and skips,
    // which caused every cron post to be fake-published without reaching PfM.
    const now = new Date().toISOString();
    const { data: scheduledContent, error: fetchError } = await supabase
      .from("content_calendar")
      .select("id, platform, title, content, scheduled_for, client_account_id, metadata")
      .eq("status", "scheduled")
      .eq("client_approved", true)
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true });

    if (fetchError) throw fetchError;

    console.log(`Found ${scheduledContent?.length || 0} items due for publishing`);

    const results: { id: string; platform: string; success: boolean; skipped?: boolean; error?: string }[] = [];

    for (const item of scheduledContent || []) {
      try {
        switch (item.platform) {

          // ── Social platforms — delegate to postforme-publish-post ──
          case "twitter":
          case "facebook":
          case "linkedin":
          case "instagram": {
            console.log(`Publishing ${item.platform} post via PfM: ${item.title}`);
            const pfmRes = await supabase.functions.invoke("postforme-publish-post", {
              body: { contentCalendarId: item.id },
            });

            if (pfmRes.error) {
              const msg = pfmRes.error.message || "Invoke error";
              console.error(`PfM invoke error for ${item.id}:`, msg);
              await markFailed(supabase, item, msg);
              results.push({ id: item.id, platform: item.platform, success: false, error: msg });
            } else if (pfmRes.data?.skipped) {
              // Already published by a concurrent run — treat as success
              console.log(`Post ${item.id} already handled (skipped)`);
              results.push({ id: item.id, platform: item.platform, success: true, skipped: true });
            } else if (!pfmRes.data?.success) {
              // postforme-publish-post already wrote content_calendar + alerted
              // for this failure (or requeued it as "scheduled" for retry) --
              // don't double-write/double-alert here.
              const msg = pfmRes.data?.error || "Publish failed";
              console.error(`PfM publish failed for ${item.id}:`, msg);
              results.push({ id: item.id, platform: item.platform, success: false, error: msg });
            } else {
              results.push({ id: item.id, platform: item.platform, success: true });
            }

            // Stay under PfM's 5 req/sec rate limit
            await sleep(300);
            break;
          }

          // ── Email — Resend directly, known recipients only ──
          // Newsletter (no explicit recipients) used to fall back to n8n;
          // n8n is gone and nothing replaces it, so it now just fails clearly
          // via the default case's "not supported" message below.
          case "email": {
            const claimed = await claimItem(supabase, item.id);
            if (!claimed) {
              console.log(`Email item ${item.id} already handled (skipped)`);
              results.push({ id: item.id, platform: "email", success: true, skipped: true });
              break;
            }

            const metadata = item.metadata as { recipients?: string[]; subject?: string } | null;
            const recipients = metadata?.recipients || [];

            if (recipients.length > 0 && resend) {
              const emailRes = await resend.emails.send({
                from: "Orange Door Consultants <hello@orangedoormarketing.com>",
                to: recipients,
                subject: metadata?.subject || item.title,
                html: item.content,
              });
              if (emailRes.error) {
                const msg = emailRes.error.message;
                console.error("Resend error:", msg);
                await markFailed(supabase, item, msg, isRetryableResendError(emailRes.error.name));
                results.push({ id: item.id, platform: "email", success: false, error: msg });
              } else {
                await supabase.from("content_calendar")
                  .update({ status: "published", published_at: new Date().toISOString() })
                  .eq("id", item.id);
                await recordPublish(supabase, item);
                results.push({ id: item.id, platform: "email", success: true });
              }
            } else {
              // Config/data problem, not transient -- retrying won't help.
              const msg = !resend ? "RESEND_API_KEY not configured" : "No recipients on this email item";
              await markFailed(supabase, item, msg);
              results.push({ id: item.id, platform: "email", success: false, error: msg });
            }
            break;
          }

          // ── Blog — mark published (CMS handles actual publishing) ──
          case "blog": {
            const claimed = await claimItem(supabase, item.id);
            if (!claimed) {
              console.log(`Blog item ${item.id} already handled (skipped)`);
              results.push({ id: item.id, platform: "blog", success: true, skipped: true });
              break;
            }
            await supabase.from("content_calendar")
              .update({ status: "published", published_at: new Date().toISOString() })
              .eq("id", item.id);
            await recordPublish(supabase, item);
            results.push({ id: item.id, platform: "blog", success: true });
            break;
          }

          default: {
            const msg = `Platform "${item.platform}" is not supported for automated publishing.`;
            console.warn(msg);
            await markFailed(supabase, item, msg);
            results.push({ id: item.id, platform: item.platform || "unknown", success: false, error: msg });
          }
        }
      } catch (itemErr: unknown) {
        const msg = itemErr instanceof Error ? itemErr.message : "Unknown error";
        console.error(`Error processing item ${item.id}:`, msg);
        await supabase.from("content_calendar")
          .update({ status: "failed", error_message: msg, metadata: { ...((item.metadata as object) || {}), error: msg } })
          .eq("id", item.id).neq("status", "published");
        await logAlert(supabase, {
          source: "publish-scheduled-content",
          alertType: "content_publish_failure",
          severity: "warning",
          title: `Publish failed: ${item.platform || "unknown"}`,
          message: msg,
          sourceId: item.id,
          metadata: { platform: item.platform },
        });
        results.push({ id: item.id, platform: item.platform || "unknown", success: false, error: msg });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(`publish-scheduled-content: ${successful} published, ${failed} failed`);

    return new Response(
      JSON.stringify({ processed: results.length, successful, failed, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("publish-scheduled-content fatal error:", msg);
    try {
      await createClient(supabaseUrl, supabaseServiceKey).from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "publish-scheduled-content crashed",
        message: msg,
        source: "publish-scheduled-content",
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
