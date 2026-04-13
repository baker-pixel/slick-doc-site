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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    // Get all scheduled content that's due
    const now = new Date().toISOString();
    const { data: scheduledContent, error: fetchError } = await supabase
      .from("content_calendar")
      .select("*")
      .eq("status", "scheduled")
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
          case "email":
            if (!resend) {
              errorMessage = "Resend API key not configured";
              console.error(errorMessage);
            } else {
              // For email, we need recipient info from metadata
              const metadata = item.metadata as { recipients?: string[]; subject?: string } | null;
              const recipients = metadata?.recipients || [];
              
              if (recipients.length === 0) {
                errorMessage = "No recipients specified for email";
                console.error(errorMessage);
              } else {
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
                  console.log(`Email sent successfully for item ${item.id}`);
                }
              }
            }
            break;

          case "twitter":
          case "facebook":
          case "linkedin":
          case "instagram": {
            // Route social posts through trigger-n8n → n8n → n8n-callback
            console.log(`Routing ${item.platform} post to n8n: ${item.title}`);
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
              // Mark as awaiting_callback — n8n-callback will set it to published
              const { error: awaitError } = await supabase
                .from("content_calendar")
                .update({
                  status: "awaiting_callback",
                  metadata: { ...((item.metadata as object) || {}), n8n_triggered_at: new Date().toISOString() },
                })
                .eq("id", item.id);

              if (awaitError) {
                console.error(`Failed to set awaiting_callback for ${item.id}:`, awaitError);
                results.push({ id: item.id, platform: item.platform || "unknown", success: false, error: awaitError.message });
              } else {
                console.log(`Social post ${item.id} sent to n8n, awaiting callback`);
                results.push({ id: item.id, platform: item.platform || "unknown", success: true });
              }
              continue; // Skip the published/failed blocks below
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

    await supabase.from('automation_alerts').insert({
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
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
