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
    // Find all steps past their callback deadline
    const { data: stalled, error } = await supabase
      .from("workflow_steps")
      .select("id, workflow_id, client_id, step_number, step_name, callback_deadline")
      .eq("status", "awaiting_callback")
      .not("callback_deadline", "is", null)
      .lt("callback_deadline", new Date().toISOString());

    if (error) throw error;

    if (!stalled || stalled.length === 0) {
      return new Response(
        JSON.stringify({ checked: true, stalled_count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const step of stalled) {
      // Mark as failed
      await supabase
        .from("workflow_steps")
        .update({
          status: "failed",
          result: { error: "n8n callback timeout — no response within 2 hours" },
        })
        .eq("id", step.id);

      // Alert admin
      await supabase.from("automation_alerts").insert({
        alert_type: "n8n_callback_timeout",
        title: `Step ${step.step_number} timed out`,
        message: `Step ${step.step_number} (${step.step_name}) timed out waiting for n8n callback`,
        severity: "high",
        source: "check-stalled-workflows",
        source_id: step.workflow_id,
      });

      results.push({ step_id: step.id, step_number: step.step_number, step_name: step.step_name });
    }

    return new Response(
      JSON.stringify({ checked: true, stalled_count: results.length, failed_steps: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-stalled-workflows error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
