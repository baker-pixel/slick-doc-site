import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    // Validate callback authentication
    const authHeader = req.headers.get("Authorization") || "";
    const expectedKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const campaignKey = Deno.env.get("CAMPAIGN_API_KEY") || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token || (token !== expectedKey && token !== campaignKey)) {
      console.error("n8n-callback: unauthorized request");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { task_id, status, error_message, output_data, client_id, step_id, workflow_id, step_number, content_id } = body;

    // Validate required fields
    if (!task_id && !client_id && !step_id && !content_id) {
      throw new Error("task_id, client_id, step_id, or content_id is required");
    }

    // Validate status
    const validStatuses = ["pending", "in_progress", "completed", "failed", "published", "processing"];
    if (status && !validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`);
    }

    console.log(`N8N callback: task=${task_id}, step=${step_id}, content=${content_id}, status=${status}, client=${client_id}`);

    // Single task update
    if (task_id) {
      const updateData: Record<string, unknown> = {};

      if (status) updateData.status = status;
      if (status === "completed") updateData.completed_at = new Date().toISOString();
      if (status === "failed" && error_message) updateData.notes = `N8N error: ${error_message}`;
      if (output_data) updateData.output_data = output_data;

      const { error } = await supabase
        .from("client_tasks")
        .update(updateData)
        .eq("id", task_id);

      if (error) {
        throw new Error(`Failed to update task ${task_id}: ${error.message}`);
      }

      // Log activity if completed
      if (status === "completed" && client_id) {
        await supabase.from("activity_feed").insert({
          client_account_id: client_id,
          activity_type: "task_completed",
          title: "Task completed via automation",
          description: `Task ${task_id} completed by N8N workflow`,
          icon: "check-circle",
          metadata: { task_id, source: "n8n" },
        });
      }
    }

    // Workflow step update
    if (step_id) {
      const stepUpdate: Record<string, unknown> = {
        status: status || "completed",
        result: output_data || null,
      };
      if (status === "completed" || !status) {
        stepUpdate.completed_at = new Date().toISOString();
      }
      if (status === "failed" && error_message) {
        stepUpdate.result = { error: error_message };
      }

      await supabase
        .from("workflow_steps")
        .update(stepUpdate)
        .eq("id", step_id);

      // Mark any linked content_approvals as published
      if (status === "completed" || !status) {
        const { data: approvals } = await supabase
          .from("content_approvals")
          .select("id")
          .eq("client_account_id", client_id)
          .eq("status", "approved")
          .in("publish_status", ["queued", "pending"]);

        if (approvals && approvals.length > 0) {
          await supabase
            .from("content_approvals")
            .update({
              published_at: new Date().toISOString(),
              publish_status: "published",
            })
            .in("id", approvals.map((a: { id: string }) => a.id));
        }
      }

      // Auto-advance workflow if step completed
      if ((status === "completed" || !status) && workflow_id && step_number) {
        // If step 5 (Approve First Content Draft) just completed, trigger auto-schedule
        if (step_number === 5 && client_id) {
          try {
            // Get client tier
            const { data: clientData } = await supabase
              .from("client_accounts")
              .select("tier")
              .eq("id", client_id)
              .single();

            if (clientData?.tier) {
              const baseUrl = Deno.env.get("SUPABASE_URL")!;
              const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
              fetch(`${baseUrl}/functions/v1/auto-schedule-content`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({ client_id, tier: clientData.tier }),
              }).catch((err) => console.error("Auto-schedule trigger error:", err));
            }
          } catch (schedErr) {
            console.error("Failed to trigger auto-schedule:", schedErr);
          }
        }

        const nextStepNumber = step_number + 1;
        const baseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        fetch(`${baseUrl}/functions/v1/run-workflow-step`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            client_id,
            workflow_id,
            step_number: nextStepNumber,
          }),
        }).catch((err) => console.error("Auto-advance from n8n-callback error:", err));
      }
    }

    // Batch update: mark multiple tasks by client
    if (!task_id && !step_id && client_id && status) {
      const { error } = await supabase
        .from("client_tasks")
        .update({
          status,
          ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
          ...(status === "failed" && error_message ? { notes: `N8N error: ${error_message}` } : {}),
        })
        .eq("client_account_id", client_id)
        .eq("status", "in_progress");

      if (error) {
        throw new Error(`Failed to batch update tasks: ${error.message}`);
      }
    }

    // Content calendar update via content_id
    if (content_id) {
      const calUpdate: Record<string, unknown> = {};
      if (status) calUpdate.status = status;
      if (status === "published") calUpdate.published_at = new Date().toISOString();
      if (status === "failed" && error_message) {
        calUpdate.metadata = { error_message };
      }

      const { error: calError } = await supabase
        .from("content_calendar")
        .update(calUpdate)
        .eq("id", content_id);

      if (calError) {
        throw new Error(`Failed to update content_calendar ${content_id}: ${calError.message}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("n8n-callback error:", error);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in n8n-callback`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'n8n-callback',
      source_id: null,
      metadata: {
        function_name: 'n8n-callback',
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
