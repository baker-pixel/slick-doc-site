import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { approval_id, action, feedback } = await req.json();

    if (!approval_id || !action) {
      return new Response(
        JSON.stringify({ error: "approval_id and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["approved", "changes_requested"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "action must be 'approved' or 'changes_requested'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the approval row
    const { data: approval, error: fetchErr } = await supabase
      .from("content_approvals")
      .select("*")
      .eq("id", approval_id)
      .single();

    if (fetchErr || !approval) {
      return new Response(
        JSON.stringify({ error: "Approval not found", details: fetchErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = approval.client_account_id;

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: "Approval has no associated client account" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "approved") {
      // 1. Update approval status
      await supabase
        .from("content_approvals")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          publish_status: "queued",
          reviewed_at: new Date().toISOString(),
          feedback: feedback || null,
        })
        .eq("id", approval_id);

      // 2. Bridge: Insert into content_calendar with client_approved = true
      // The pg_cron job on publish-scheduled-content will pick this up
      const scheduledFor = approval.scheduled_for || new Date().toISOString();
      const { error: calInsertError } = await supabase
        .from("content_calendar")
        .insert({
          client_account_id: clientId,
          content_id: approval.id,
          content_type: approval.content_type,
          platform: approval.platform || null,
          content: approval.full_content || approval.content_preview || "",
          title: approval.title || "",
          status: "scheduled",
          client_approved: true,
          scheduled_for: scheduledFor,
          metadata: {
            source: "content_approvals",
            content_approval_id: approval_id,
          },
        });

      if (calInsertError) {
        console.error("Failed to insert content_calendar row:", calInsertError);
      }

      // Log activity
      await supabase.from("activity_feed").insert({
        client_account_id: clientId,
        activity_type: "content_approved",
        title: `Content approved: ${approval.title}`,
        description: `${approval.content_type} approved and queued for publishing`,
        icon: "check-circle",
        metadata: { approval_id, content_type: approval.content_type },
      });

      return new Response(
        JSON.stringify({ success: true, action: "approved", publish_status: "queued" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // action === "changes_requested"
    if (!feedback?.trim()) {
      return new Response(
        JSON.stringify({ error: "Feedback is required when requesting changes" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Update approval
    await supabase
      .from("content_approvals")
      .update({
        status: "changes_requested",
        publish_status: "changes_requested",
        feedback,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", approval_id);

    // 2. Insert automation alert
    await supabase.from("automation_alerts").insert({
      alert_type: "changes_requested",
      title: `Changes requested: ${approval.title}`,
      message: `Client requested changes on ${approval.content_type}: ${feedback}`,
      severity: "medium",
      source: "handle-approval",
      source_id: approval_id,
    });

    // Log activity
    await supabase.from("activity_feed").insert({
      client_account_id: clientId,
      activity_type: "content_changes_requested",
      title: `Changes requested: ${approval.title}`,
      description: feedback,
      icon: "edit-3",
      metadata: { approval_id, content_type: approval.content_type },
    });

    return new Response(
      JSON.stringify({ success: true, action: "changes_requested" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("handle-approval error:", error);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in handle-approval`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'handle-approval',
      metadata: {
        function_name: 'handle-approval',
        client_id: null,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
