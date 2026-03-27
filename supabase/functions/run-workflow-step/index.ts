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
    const { client_id, workflow_id, step_number } = await req.json();

    if (!workflow_id || !step_number) {
      return new Response(
        JSON.stringify({ error: "workflow_id and step_number required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the workflow step
    const { data: step, error: stepErr } = await supabase
      .from("workflow_steps")
      .select("*")
      .eq("workflow_id", workflow_id)
      .eq("step_number", step_number)
      .single();

    if (stepErr || !step) {
      return new Response(
        JSON.stringify({ error: "Step not found", details: stepErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (step.status === "completed") {
      return new Response(
        JSON.stringify({ skipped: true, reason: "already completed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check dependency
    if (step.depends_on) {
      const { data: dep } = await supabase
        .from("workflow_steps")
        .select("status")
        .eq("workflow_id", workflow_id)
        .eq("step_number", step.depends_on)
        .single();

      if (dep?.status !== "completed") {
        return new Response(
          JSON.stringify({ skipped: true, reason: `dependency step ${step.depends_on} not complete (status: ${dep?.status})` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Mark step running
    await supabase
      .from("workflow_steps")
      .update({ status: "running" })
      .eq("id", step.id);

    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callFn = async (name: string, body: object) => {
      const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(body),
      });
      return res.json();
    };

    let result: unknown = null;
    const effectiveClientId = client_id || step.client_id;

    try {
      const p = step.payload ?? {};

      switch (step.task_type) {
        case "website_analysis":
          result = await callFn("analyze-website", { client_id: effectiveClientId });
          break;
        case "seo_audit":
          result = await callFn("analyze-seo", { client_id: effectiveClientId });
          break;
        case "gap_report":
          result = await callFn("generate-analysis", { client_id: effectiveClientId });
          break;
        case "content":
          result = await callFn("run-content-agent", { client_id: effectiveClientId, ...p });
          break;
        case "social_content":
          result = await callFn("generate-social-content", { client_id: effectiveClientId, ...p });
          break;
        case "email_template":
          result = await callFn("generate-email-template", { client_id: effectiveClientId, ...p });
          break;
        case "ad_copy":
          result = await callFn("generate-ads", { client_id: effectiveClientId, ...p });
          break;
        case "email_campaign":
          result = await callFn("send-campaign", { client_id: effectiveClientId, ...p });
          break;
        case "n8n_post_blog":
          result = await callFn("trigger-n8n", {
            clientId: effectiveClientId,
            trigger: "post_blog",
            metadata: { step_id: step.id, workflow_id, step_number: step.step_number },
          });
          break;
        case "n8n_post_social":
          result = await callFn("trigger-n8n", {
            clientId: effectiveClientId,
            trigger: "post_social",
            metadata: { step_id: step.id, workflow_id, step_number: step.step_number },
          });
          break;
        case "analytics":
          result = await callFn("trigger-n8n", {
            clientId: effectiveClientId,
            trigger: "scrape_analytics",
            metadata: { step_id: step.id, workflow_id, step_number: step.step_number },
          });
          break;
        case "report":
          result = await callFn("run-ai-batch", { client_id: effectiveClientId, type: "monthly_report" });
          break;
        case "notify_client":
          result = await callFn("send-client-notification", {
            client_id: effectiveClientId,
            message: "Your marketing plan is ready for review.",
          });
          break;
        default:
          result = { error: `unknown task_type: ${step.task_type}` };
      }

      // For n8n steps — mark as 'awaiting_callback' not completed
      const n8nTypes = ["n8n_post_blog", "n8n_post_social", "analytics"];
      const newStatus = n8nTypes.includes(step.task_type) ? "awaiting_callback" : "completed";

      await supabase
        .from("workflow_steps")
        .update({
          status: newStatus,
          result,
          completed_at: newStatus === "completed" ? new Date().toISOString() : null,
        })
        .eq("id", step.id);

      // Advance workflow current_step counter
      await supabase
        .from("client_workflows")
        .update({
          current_step: step_number + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workflow_id);

      // Auto-trigger next step if this one completed (not awaiting n8n)
      if (newStatus === "completed" && step_number < 17) {
        try {
          await callFn("run-workflow-step", {
            client_id: effectiveClientId,
            workflow_id,
            step_number: step_number + 1,
          });
        } catch (advanceErr) {
          const advanceMsg = advanceErr instanceof Error ? advanceErr.message : String(advanceErr);
          console.error("Auto-advance failed:", advanceMsg);

          // Mark the next step as failed so admin can see it
          await supabase
            .from("workflow_steps")
            .update({ status: "failed", result: { error: `Auto-advance failed: ${advanceMsg}` } })
            .eq("workflow_id", workflow_id)
            .eq("step_number", step_number + 1);

          // Insert an automation alert so it shows in the admin panel
          await supabase.from("automation_alerts").insert({
            alert_type: "workflow_advance_failed",
            title: `Workflow stuck at step ${step_number + 1}`,
            message: `Workflow ${workflow_id} stuck at step ${step_number + 1}: ${advanceMsg}`,
            severity: "high",
            source: "run-workflow-step",
            source_id: workflow_id,
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, step: step_number, status: newStatus, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await supabase
        .from("workflow_steps")
        .update({ status: "failed", result: { error: errorMsg } })
        .eq("id", step.id);

      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("run-workflow-step error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
