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
    const { approval_id, action, feedback, password } = await req.json();

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

    // Authorization: server (service key), admin panel (ADMIN_PASSWORD), or a
    // portal user who owns this approval's client account. Without this check
    // anyone with the anon key could approve and publish arbitrary content.
    const bearer = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
    const isServer = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const isAdminCall = !!adminPassword && password === adminPassword;

    if (!isServer && !isAdminCall) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${bearer}` } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: portalUser } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("client_account_id", clientId)
        .maybeSingle();

      if (!portalUser) {
        const { data: isAdmin } = await supabase.rpc("has_role", { _role: "admin", _user_id: user.id });
        if (isAdmin !== true) {
          return new Response(
            JSON.stringify({ error: "Forbidden" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
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

      // 2. Bridge: promote content into content_calendar with client_approved = true.
      // content_calendar.content_id is a FK to generated_content(id), not content_approvals.
      const generatedContentId: string | null = approval.content_id || null;
      const scheduledFor = approval.scheduled_for || new Date().toISOString();

      // When the draft came from fill-scheduled-content there is an original placeholder
      // slot in content_calendar. Prefer updating that slot over inserting a new row so
      // we don't end up with two calendar entries for the same piece of content.
      let slotUpdated = false;

      if (generatedContentId) {
        // Fetch the generated_content row to retrieve the original slot id from metadata.
        // Single PK lookup — maybeSingle() is safe here (no duplicate risk on id).
        const { data: genRecord } = await supabase
          .from("generated_content")
          .select("metadata")
          .eq("id", generatedContentId)
          .maybeSingle();

        const genMeta = (genRecord?.metadata) as Record<string, unknown> | null;
        const slotId = genMeta?.content_calendar_slot_id as string | undefined;

        if (slotId) {
          // Fetch existing slot metadata first so we can merge rather than overwrite.
          // Filter by status=draft at fetch time — same guard as the update below.
          const { data: existingSlot } = await supabase
            .from("content_calendar")
            .select("metadata")
            .eq("id", slotId)
            .eq("status", "draft")
            .maybeSingle(); // safe: PK + status filter = at most one row

          const existingMeta = (existingSlot?.metadata as Record<string, unknown>) || {};

          // Return the updated row so we can confirm at least one row matched.
          // Supabase returns no error when 0 rows match a filtered update,
          // so we check the returned array length instead.
          const { data: updatedRows, error: slotUpdateErr } = await supabase
            .from("content_calendar")
            .update({
              content: approval.full_content || approval.content_preview || "",
              title: approval.title || "",
              status: "scheduled",
              client_approved: true,
              content_id: generatedContentId,
              metadata: {
                ...existingMeta,
                source: "content_approvals",
                content_approval_id: approval_id,
                generated_content_id: generatedContentId,
              },
            })
            .eq("id", slotId)
            .eq("status", "draft") // only update if still a draft — prevents double-fire
            .select("id");

          if (slotUpdateErr) {
            console.error("Failed to update original calendar slot:", slotUpdateErr);
          } else if (updatedRows && updatedRows.length > 0) {
            slotUpdated = true;
            console.log(`Updated original slot ${slotId} to scheduled`);
          } else {
            console.log(`Slot ${slotId} not found or already past draft — falling back to insert path`);
          }
        }
      }

      // No original slot to update — guard against duplicates then insert a new row.
      if (!slotUpdated) {
        // Use limit(1) + array check instead of maybeSingle() to be safe against existing duplicates
        const { data: existingRows } = await supabase
          .from("content_calendar")
          .select("id")
          .or(
            generatedContentId
              ? `content_id.eq.${generatedContentId},metadata->>content_approval_id.eq.${approval_id}`
              : `metadata->>content_approval_id.eq.${approval_id}`
          )
          .neq("status", "draft")
          .limit(1);

        if (!existingRows || existingRows.length === 0) {
          const { error: calInsertError } = await supabase
            .from("content_calendar")
            .insert({
              client_account_id: clientId,
              content_id: generatedContentId,
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
        }
      }

      // Sync status back to generated_content so admin sees client approved
      if (generatedContentId) {
        await supabase
          .from("generated_content")
          .update({ status: "client_approved", updated_at: new Date().toISOString() })
          .eq("id", generatedContentId);
      }

      // Advance client_approval workflow step if still pending (handles admin-triggered approvals)
      try {
        const { data: wf } = await supabase
          .from("client_workflows")
          .select("id")
          .eq("client_id", clientId)
          .eq("status", "active")
          .maybeSingle();

        if (wf) {
          const { data: approvalStep } = await supabase
            .from("workflow_steps")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("workflow_id", wf.id)
            .eq("task_type", "client_approval")
            .eq("status", "pending")
            .select("id, step_number")
            .maybeSingle();

          if (approvalStep) {
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            fetch(`${supabaseUrl}/functions/v1/advance-workflow`, {
              method: "POST",
              headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                workflow_id: wf.id,
                completed_step_number: approvalStep.step_number,
                client_id: clientId,
              }),
            }).catch((e) => console.error("advance-workflow after approval:", e));
          }
        }
      } catch (e) {
        console.error("Failed to advance workflow after approval:", e);
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

    // Sync status back to generated_content so admin sees changes were requested,
    // and carry the reason with it -- content_approvals rows are ephemeral
    // (cascade on generated_content delete), this is the durable copy the
    // next generation call reads back via _shared/contentFeedback.ts.
    const generatedContentIdForChanges: string | null = approval.content_id || null;
    if (generatedContentIdForChanges) {
      await supabase
        .from("generated_content")
        .update({ status: "changes_requested", rejection_reason: feedback, updated_at: new Date().toISOString() })
        .eq("id", generatedContentIdForChanges);
    }

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
