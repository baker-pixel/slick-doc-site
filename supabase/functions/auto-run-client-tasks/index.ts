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
    const { clientId }: { clientId: string } = await req.json();
    console.log(`Auto-running tasks for new client ${clientId}`);

    // Get all pending FULL automation tasks for this client
    const { data: tasks, error: tasksError } = await supabase
      .from("client_tasks")
      .select("*")
      .eq("client_account_id", clientId)
      .eq("status", "pending")
      .eq("automation_type", "FULL");

    if (tasksError) {
      throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
    }

    if (!tasks || tasks.length === 0) {
      console.log("No pending FULL tasks to run");
      return new Response(
        JSON.stringify({ success: true, message: "No tasks to run", tasksRun: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${tasks.length} FULL automation tasks to run`);

    let completed = 0;
    let failed = 0;
    const results: { taskId: string; name: string; status: string; error?: string }[] = [];

    // Run each task by calling the run-automation function
    for (const task of tasks) {
      try {
        console.log(`Running task: ${task.name} (${task.id})`);
        
        const response = await supabase.functions.invoke("run-automation", {
          body: {
            clientId: clientId,
            taskId: task.id,
            jobType: mapTaskToJobType(task.name),
          },
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        completed++;
        results.push({ taskId: task.id, name: task.name, status: "completed" });
        console.log(`Task ${task.name} completed successfully`);
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.push({ taskId: task.id, name: task.name, status: "failed", error: errorMessage });
        console.error(`Task ${task.name} failed:`, errorMessage);
      }
    }

    // Create alert for batch completion
    await supabase.from("automation_alerts").insert({
      alert_type: "batch_complete",
      severity: failed > 0 ? "warning" : "info",
      title: `Auto-onboarding Complete`,
      message: `Ran ${completed + failed} tasks: ${completed} succeeded, ${failed} failed`,
      source: "auto-run-client-tasks",
      source_id: clientId,
      metadata: { clientId, completed, failed, results },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Ran ${completed + failed} tasks`,
        completed,
        failed,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto-run error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Map task names to job types
function mapTaskToJobType(taskName: string): string {
  const mappings: Record<string, string> = {
    "Send Intake Form": "send_intake_form",
    "Add to CRM": "add_to_crm",
    "Schedule Kickoff Call": "schedule_kickoff",
    "Run PageSpeed Test": "run_page_speed_test",
    "Create Google Review Link": "create_google_review_link",
    "Create Review QR Code": "create_review_qr_code",
    "Setup Review Automation": "setup_review_automation",
    "Send Review Scripts": "send_review_scripts",
    "Create KPI Dashboard": "create_kpi_dashboard",
    "Run SEO Audit": "run_seo_audit",
    "Run Keyword Gap Analysis": "run_keyword_gap_analysis",
    "Setup Lead Automations": "setup_lead_automations",
    "Setup Retargeting Audiences": "setup_retargeting_audiences",
    "Setup Retention Automations": "setup_retention_automations",
    "Generate Monthly Report": "generate_monthly_report",
  };

  // Find matching job type
  for (const [name, jobType] of Object.entries(mappings)) {
    if (taskName.toLowerCase().includes(name.toLowerCase()) || 
        name.toLowerCase().includes(taskName.toLowerCase())) {
      return jobType;
    }
  }

  // Default fallback
  return taskName.toLowerCase().replace(/\s+/g, "_");
}
