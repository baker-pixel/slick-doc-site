import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    // ── Cleanup: reset rows stuck in processing/awaiting_callback for > 2 hours ──
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: stuckPosts } = await supabase
      .from("content_calendar")
      .update({ status: "scheduled", updated_at: new Date().toISOString() })
      .in("status", ["processing", "awaiting_callback"])
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
              results.push({ id: item.id, platform: item.platform, success: false, error: msg });
            } else if (pfmRes.data?.skipped) {
              // Already published by a concurrent run — treat as success
              console.log(`Post ${item.id} already handled (skipped)`);
              results.push({ id: item.id, platform: item.platform, success: true, skipped: true });
            } else if (!pfmRes.data?.success) {
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

          // ── Email — Resend directly (known recipients) or n8n (newsletter) ──
          case "email": {
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
                await supabase.from("content_calendar")
                  .update({ status: "failed", metadata: { ...((item.metadata as object) || {}), error: msg } })
                  .eq("id", item.id);
                results.push({ id: item.id, platform: "email", success: false, error: msg });
              } else {
                await supabase.from("content_calendar")
                  .update({ status: "published", published_at: new Date().toISOString() })
                  .eq("id", item.id);
                results.push({ id: item.id, platform: "email", success: true });
              }
            } else {
              // Newsletter — route via n8n
              const n8nRes = await supabase.functions.invoke("trigger-n8n", {
                body: {
                  clientId: item.client_account_id,
                  trigger: "publish_email_newsletter",
                  tasks: [],
                  metadata: { content_calendar_id: item.id, platform: "email", title: item.title, content: item.content, scheduled_for: item.scheduled_for },
                },
              });
              if (n8nRes.error) {
                const msg = `n8n trigger failed: ${n8nRes.error.message}`;
                await supabase.from("content_calendar")
                  .update({ status: "failed", metadata: { ...((item.metadata as object) || {}), error: msg } })
                  .eq("id", item.id);
                results.push({ id: item.id, platform: "email", success: false, error: msg });
              } else {
                await supabase.from("content_calendar")
                  .update({ status: "awaiting_callback", metadata: { ...((item.metadata as object) || {}), n8n_triggered_at: new Date().toISOString() } })
                  .eq("id", item.id);
                results.push({ id: item.id, platform: "email", success: true });
              }
            }
            break;
          }

          // ── Google Business — route via n8n ──
          case "google_business": {
            const n8nRes = await supabase.functions.invoke("trigger-n8n", {
              body: {
                clientId: item.client_account_id,
                trigger: "publish_social",
                tasks: [],
                metadata: { content_calendar_id: item.id, platform: item.platform, title: item.title, content: item.content, scheduled_for: item.scheduled_for },
              },
            });
            if (n8nRes.error) {
              const msg = `n8n trigger failed: ${n8nRes.error.message}`;
              await supabase.from("content_calendar")
                .update({ status: "failed", metadata: { ...((item.metadata as object) || {}), error: msg } })
                .eq("id", item.id);
              results.push({ id: item.id, platform: item.platform, success: false, error: msg });
            } else {
              await supabase.from("content_calendar")
                .update({ status: "awaiting_callback", metadata: { ...((item.metadata as object) || {}), n8n_triggered_at: new Date().toISOString() } })
                .eq("id", item.id);
              results.push({ id: item.id, platform: item.platform, success: true });
            }
            break;
          }

          // ── Blog — mark published (CMS handles actual publishing) ──
          case "blog":
            await supabase.from("content_calendar")
              .update({ status: "published", published_at: new Date().toISOString() })
              .eq("id", item.id);
            results.push({ id: item.id, platform: "blog", success: true });
            break;

          default: {
            const msg = `Platform "${item.platform}" is not supported for automated publishing.`;
            console.warn(msg);
            await supabase.from("content_calendar")
              .update({ status: "failed", metadata: { ...((item.metadata as object) || {}), error: msg } })
              .eq("id", item.id);
            await supabase.from("automation_alerts").insert({
              alert_type: "content_publish_failure",
              severity: "warning",
              title: "Unsupported Platform",
              message: msg,
              source: "publish-scheduled-content",
              source_id: item.id,
            });
            results.push({ id: item.id, platform: item.platform || "unknown", success: false, error: msg });
          }
        }
      } catch (itemErr: unknown) {
        const msg = itemErr instanceof Error ? itemErr.message : "Unknown error";
        console.error(`Error processing item ${item.id}:`, msg);
        await supabase.from("content_calendar")
          .update({ status: "failed", metadata: { ...((item.metadata as object) || {}), error: msg } })
          .eq("id", item.id).neq("status", "published");
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
