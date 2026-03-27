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
    const N8N_WEBHOOK_URL = Deno.env.get("N8N_WEBHOOK_URL");
    if (!N8N_WEBHOOK_URL) {
      throw new Error("N8N_WEBHOOK_URL is not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { clientId, tasks, trigger, metadata } = body;

    if (!clientId) {
      throw new Error("clientId is required");
    }

    console.log(`Triggering N8N for client ${clientId}, trigger: ${trigger}, tasks: ${tasks?.length || 0}`);

    // Mark all tasks as "running" in DB
    const taskIds = (tasks || []).map((t: { id: string }) => t.id).filter(Boolean);
    if (taskIds.length > 0) {
      const { error: updateError } = await supabase
        .from("client_tasks")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .in("id", taskIds);

      if (updateError) {
        console.error("Failed to update task statuses:", updateError);
      }
    }

    // Build the callback URL for N8N to call back
    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/n8n-callback`;

    // Send POST to N8N webhook — include workflow metadata for callback auto-advance
    const n8nPayload = {
      client_id: clientId,
      tasks: tasks || [],
      trigger: trigger || "run_auto",
      metadata: metadata || {},
      callback_url: callbackUrl,
      callback_api_key: Deno.env.get("SUPABASE_ANON_KEY"),
    };

    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(n8nPayload),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error(`N8N webhook failed [${n8nResponse.status}]:`, errorText);

      // Mark tasks as failed if N8N webhook itself fails
      if (taskIds.length > 0) {
        await supabase
          .from("client_tasks")
          .update({
            status: "failed",
            notes: `N8N webhook error: ${n8nResponse.status}`,
          })
          .in("id", taskIds);
      }

      throw new Error(`N8N webhook returned ${n8nResponse.status}: ${errorText}`);
    }

    let n8nData = null;
    try {
      n8nData = await n8nResponse.json();
    } catch {
      // N8N may return non-JSON
    }

    console.log("N8N webhook triggered successfully");

    return new Response(
      JSON.stringify({
        success: true,
        message: `Triggered N8N for ${taskIds.length} tasks`,
        taskIds,
        n8nResponse: n8nData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("trigger-n8n error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
