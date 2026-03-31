import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    console.log(`Auto-running tasks for client ${clientId}`);

    // Get all pending FULL automation tasks for this client, ordered
    const { data: tasks, error: tasksError } = await supabase
      .from("client_tasks")
      .select("*")
      .eq("client_account_id", clientId)
      .in("status", ["pending", "failed"])
      .eq("automation_type", "FULL")
      .order("order_index", { ascending: true });

    if (tasksError) {
      throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
    }

    if (!tasks || tasks.length === 0) {
      console.log("No pending FULL tasks to run");
      return new Response(
        JSON.stringify({ success: true, message: "No tasks to run", completed: 0, failed: 0, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${tasks.length} FULL automation tasks to run sequentially`);

    let completed = 0;
    let failed = 0;
    const results: { taskId: string; name: string; status: string; error?: string }[] = [];

    // Run each task SEQUENTIALLY
    for (const task of tasks) {
      const jobType = mapTaskToJobType(task.name);
      console.log(`[${completed + failed + 1}/${tasks.length}] Running: ${task.name} (jobType: ${jobType})`);

      // Mark as in_progress
      await supabase
        .from("client_tasks")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      try {
        const response = await supabase.functions.invoke("run-automation", {
          body: {
            clientId: clientId,
            taskId: task.id,
            jobType: jobType,
          },
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        // run-automation already marks the task completed via taskId,
        // just read status to confirm
        completed++;
        results.push({ taskId: task.id, name: task.name, status: "completed" });
        console.log(`✓ ${task.name} completed`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // run-automation's catch block already marks task as failed via taskId,
        // but if the invoke itself failed (network etc), ensure we mark it
        await supabase
          .from("client_tasks")
          .update({
            status: "failed",
            notes: `Error: ${errorMessage}`,
          })
          .eq("id", task.id)
          .neq("status", "failed"); // avoid overwriting if already set

        failed++;
        results.push({ taskId: task.id, name: task.name, status: "failed", error: errorMessage });
        console.error(`✗ ${task.name} failed:`, errorMessage);
      }
    }

    // Create alert for batch completion
    await supabase.from("automation_alerts").insert({
      alert_type: "batch_complete",
      severity: failed > 0 ? "warning" : "info",
      title: `Auto-run Complete`,
      message: `Ran ${completed + failed} tasks: ${completed} succeeded, ${failed} failed`,
      source: "auto-run-client-tasks",
      source_id: clientId,
      metadata: { clientId, completed, failed, results },
    });

    return new Response(
      JSON.stringify({ success: true, completed, failed, results }),
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

function mapTaskToJobType(taskName: string): string {
  const mappings: Record<string, string> = {
    "Send Intake Form": "send_intake_form",
    "Add to CRM": "add_to_crm",
    "Add client to CRM": "add_to_crm",
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
    // New mappings for task names from task templates
    "Build immediate response email": "email_sequence",
    "Build confirmation SMS": "setup_lead_automations",
    "Build 3-5 follow-up emails": "email_sequence",
    "Build no response SMS": "setup_lead_automations",
    "Build nurture email sequence": "email_sequence",
    "Connect automations to CRM": "add_to_crm",
    "Build retargeting audiences": "setup_retargeting_audiences",
    "Add automated CRM reminders": "setup_lead_automations",
    "Add lead tagging and segmentation": "setup_lead_automations",
    "Add team notifications": "setup_lead_automations",
    "Build renewal reminder": "build_renewal_reminder_sequence",
    "Build review to case study": "build_review_to_case_study_workflow",
    "Add segmentation logic": "add_segmentation_logic_to_funnel_steps",
    "Build comprehensive KPI": "create_kpi_dashboard",
    "Write 2 monthly blog": "content_generation",
    "Write monthly blog": "content_generation",
  };

  // First try exact/partial match against known mappings
  const taskLower = taskName.toLowerCase();
  for (const [name, jobType] of Object.entries(mappings)) {
    if (taskLower.includes(name.toLowerCase()) ||
        name.toLowerCase().includes(taskLower)) {
      return jobType;
    }
  }

  // Fallback: snake_case the task name and let run-automation's aliasMap handle it
  return taskName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
