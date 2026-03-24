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

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { task_id, status, error_message, output_data, client_id } = body;

    // Validate required fields
    if (!task_id && !client_id) {
      throw new Error("task_id or client_id is required");
    }

    // Validate status
    const validStatuses = ["pending", "in_progress", "completed", "failed"];
    if (status && !validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`);
    }

    console.log(`N8N callback: task=${task_id}, status=${status}, client=${client_id}`);

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

    // Batch update: mark multiple tasks by client
    if (!task_id && client_id && status) {
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

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("n8n-callback error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
