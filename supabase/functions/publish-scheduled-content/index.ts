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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    // Cleanup: mark posts stuck in processing/awaiting_callback for > 2 hours as failed
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: stuckPosts } = await supabase
      .from("content_calendar")
      .update({
        status: "failed",
        metadata: { error: "Publishing timed out — no callback received after 2 hours" },
      })
      .in("status", ["processing", "awaiting_callback"])
      .lt("updated_at", twoHoursAgo)
      .select("id");

    if (stuckPosts?.length) {
      console.log(`Cleaned up ${stuckPosts.length} stuck posts`);
      for (const post of stuckPosts) {
        await supabase.from("automation_alerts").insert({
          alert_type: "content_publish_timeout",
          severity: "warning",
          title: "Publishing Timed Out",
          message: `Post ${post.id} was stuck for over 2 hours and marked as failed.`,
          source: "publish-scheduled-content",
          source_id: post.id,
        });
      }
    }

    // Get all scheduled content that's due AND client-approved
    const now = new Date().toISOString();
    const { data: scheduledContent, error: fetchError } = await supabase
      .from("content_calendar")
      .select("*")
      .eq("status", "scheduled")
      .eq("client_approved", true)
      .lte("scheduled_for", now);

    if (fetchError) {
      console.error("Error fetching scheduled content:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${scheduledContent?.length || 0} items to publish`);

    const results: { id: string; platform: string; success: boolean; error?: string }[] = [];

    for (const item of scheduledContent || []) {
      try {
        let published = false;
        let errorMessage = "";

        switch (item.platform) {
          case "email": {
            const metadata = item.metadata as { recipients?: string[]; subject?: string } | null;
            const recipients = metadata?.recipients || [];

            if (recipients.length > 0 && resend) {
              // Targeted email with known recipients — send via Resend directly
              const emailResponse = await resend.emails.send({
                from: "Orange Door Consultants <hello@orangedoormarketing.com>",
                to: recipients,
                subject: metadata?.subject || item.title,
                html: item.content,
              });
              if (emailResponse.error) {
                errorMessage = emailResponse.error.message;
                console.error("Email send error:", errorMessage);
              } else {
                published = true;
                console.log(`Email sent via Resend for item ${item.id}`);
              }
            } else {
              // Newsletter content from fill-scheduled-content — route via n8n
              console.log(`Routing newsletter email to n8n: ${item.title}`);
              const n8nResponse = await supabase.functions.invoke("trigger-n8n", {
                body: {
                  clientId: item.client_account_id,
                  trigger: "publish_email_newsletter",
                  tasks: [],
                  metadata: {
                    content_calendar_id: item.id,
                    platform: "email",
                    title: item.title,
                    content: item.content,
                    scheduled_for: item.scheduled_for,
                  },
                },
              });
              if (n8nResponse.error) {
                errorMessage = `n8n email trigger failed: ${n8nResponse.error.message}`;
                console.error(errorMessage);
              } else {
                const { error: awaitError } = await supabase
                  .from("content_calendar")
                  .update({
                    status: "awaiting_callback",
                    metadata: { ...((item.metadata as object) || {}), n8n_triggered_at: new Date().toISOString() },
                  })
                  .eq("id", item.id);
                if (awaitError) {
                  results.push({ id: item.id, platform: item.platform || "unknown", success: false, error: awaitError.message });
                } else {
                  results.push({ id: item.id, platform: item.platform || "unknown", success: true });
                }
                continue;
              }
            }
            break;
          }

          case "twitter":
          case "facebook":
          case "linkedin":
          case "instagram": {
            // Publish via Post for Me API
            console.log(`Publishing ${item.platform} post via Post for Me: ${item.title}`);
            const pfmRes = await supabase.functions.invoke("postforme-publish-post", {
              body: { contentCalendarId: item.id },
            });
            if (pfmRes.error || !pfmRes.data?.success) {
              errorMessage = pfmRes.data?.error || pfmRes.error?.message || "Post for Me publish failed";
              console.error(`PfM publish failed for ${item.id}:`, errorMessage);
            } else {
              published = true;
              console.log(`Post ${item.id} published via Post for Me, pfm_id=${pfmRes.data?.postforme_post_id}`);
            }
            break;
          }

          case "google_business": {
            // Google Business not supported by Post for Me — route through n8n
            console.log(`Routing google_business post to n8n: ${item.title}`);
            const n8nResponse = await supabase.functions.invoke("trigger-n8n", {
              body: {
                clientId: item.client_account_id,
                trigger: "publish_social",
                tasks: [],
                metadata: {
                  content_calendar_id: item.id,
                  platform: item.platform,
                  title: item.title,
                  content: item.content,
                  scheduled_for: item.scheduled_for,
                },
              },
            });

            if (n8nResponse.error) {
              errorMessage = `n8n trigger failed: ${n8nResponse.error.message}`;
              console.error(errorMessage);
            } else {
              const { error: awaitError } = await supabase
                .from("content_calendar")
                .update({
                  status: "awaiting_callback",
                  metadata: { ...((item.metadata as object) || {}), n8n_triggered_at: new Date().toISOString() },
                })
                .eq("id", item.id);

              if (awaitError) {
                results.push({ id: item.id, platform: item.platform || "unknown", success: false, error: awaitError.message });
              } else {
                results.push({ id: item.id, platform: item.platform || "unknown", success: true });
              }
              continue;
            }
            break;
          }

          case "blog":
            // Blog posts typically just need to be marked as published
            published = true;
            console.log(`Blog post published: ${item.title}`);
            break;

          default:
            published = true;
            console.log(`Generic content published: ${item.title}`);
        }

        if (published) {
          const { error: updateError } = await supabase
            .from("content_calendar")
            .update({
              status: "published",
              published_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          if (updateError) {
            console.error(`Failed to update status for ${item.id}:`, updateError);
            results.push({ id: item.id, platform: item.platform || "unknown", success: false, error: updateError.message });
          } else {
            results.push({ id: item.id, platform: item.platform || "unknown", success: true });
          }
        } else {
          // Mark as failed
          const { error: updateError } = await supabase
            .from("content_calendar")
            .update({
              status: "failed",
              metadata: { ...((item.metadata as object) || {}), error: errorMessage },
            })
            .eq("id", item.id);

          // Create automation alert for failure
          await supabase.from("automation_alerts").insert({
            alert_type: "content_publish_failure",
            severity: "error",
            title: "Content Publish Failed",
            message: `Failed to publish "${item.title}" to ${item.platform}: ${errorMessage}`,
            source: "publish-scheduled-content",
            source_id: item.id,
            metadata: { platform: item.platform, title: item.title, error: errorMessage },
          });

          results.push({ id: item.id, platform: item.platform || "unknown", success: false, error: errorMessage });
        }
      } catch (itemError: any) {
        console.error(`Error processing item ${item.id}:`, itemError);
        results.push({ id: item.id, platform: item.platform || "unknown", success: false, error: itemError.message });
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in publish-scheduled-content:", error);

    try {
      const sbErr = createClient(supabaseUrl, supabaseServiceKey);
      await sbErr.from('automation_alerts').insert({
        alert_type: 'function_error',
        severity: 'error',
        title: `Error in publish-scheduled-content`,
        message: error instanceof Error ? error.message : 'Unknown error',
        source: 'publish-scheduled-content',
        metadata: {
          function_name: 'publish-scheduled-content',
          client_id: null,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_alertErr) {
      console.error("Failed to log alert:", _alertErr);
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
