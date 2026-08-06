import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import { unlockReadySteps } from "../_shared/workflowUnlock.ts";
import type { AutomationRequest } from "./types.ts";
import { normalizeJobType } from "./jobTypeAliases.ts";

import { sendIntakeForm } from "./handlers/send-intake-form.ts";
import { addClientToCrm } from "./handlers/add-to-crm.ts";
import { sendKickoffScheduler } from "./handlers/schedule-kickoff.ts";
import { runPageSpeedTest } from "./handlers/run-page-speed-test.ts";
import { createGoogleReviewLink } from "./handlers/create-google-review-link.ts";
import { createReviewQrCode } from "./handlers/create-review-qr-code.ts";
import { setupReviewAutomation } from "./handlers/setup-review-automation.ts";
import { sendReviewScripts } from "./handlers/send-review-scripts.ts";
import { createKpiDashboard } from "./handlers/create-kpi-dashboard.ts";
import { runSeoAudit } from "./handlers/run-seo-audit.ts";
import { runKeywordGapAnalysis } from "./handlers/run-keyword-gap-analysis.ts";
import { setupLeadAutomations } from "./handlers/setup-lead-automations.ts";
import { setupRetargetingAudiences } from "./handlers/setup-retargeting-audiences.ts";
import { setupRetentionAutomations } from "./handlers/setup-retention-automations.ts";
import { generateMonthlyReport, runAiAutomation } from "./handlers/ai-automation.ts";
import { runCustomAutomation } from "./handlers/custom.ts";
import { addSegmentationLogicToFunnelSteps } from "./handlers/add-segmentation-logic.ts";
import { buildRenewalReminderSequence } from "./handlers/build-renewal-reminder-sequence.ts";
import { buildReviewToCaseStudyWorkflow } from "./handlers/build-review-to-case-study-workflow.ts";
import { buildLandingPages } from "./handlers/build-landing-pages.ts";
import { buildWebsiteRebuild } from "./handlers/build-website-rebuild.ts";
import { runAdvancedSeo } from "./handlers/run-advanced-seo.ts";
import { createLeadMagnet } from "./handlers/create-lead-magnet.ts";
import { buildSalesFunnel } from "./handlers/build-sales-funnel.ts";
import { setupSalesEnablement } from "./handlers/setup-sales-enablement.ts";
import { scheduleStrategyCall } from "./handlers/schedule-strategy-call.ts";
import { optimizeCrmPipeline } from "./handlers/optimize-crm-pipeline.ts";
import { createFullAnalyticsSuite } from "./handlers/create-full-analytics-suite.ts";
import { upsertSocialStrategy } from "../_shared/socialStrategy.ts";
import { tierPolicy } from "../_shared/tierPolicy.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let clientId: string | undefined;
  let taskId: string | undefined;
  let workflowId: string | undefined;
  let stepId: string | undefined;
  try {
    const body: AutomationRequest = await req.json();

    // Callers: process-agent-jobs / auto-run-client-tasks (service key
    // bearer) and the admin panel (session JWT + admin role, or legacy
    // ADMIN_PASSWORD in body/x-admin-password header during migration).
    const bearer = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
    const isServer = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!isServer) {
      const password =
        req.headers.get("x-admin-password") ?? (body as unknown as Record<string, unknown>).password as string | undefined;
      const auth = await checkAdminAuth(req, supabase, password);
      if (!auth.authorized) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    clientId = body.clientId;
    taskId = body.taskId;
    workflowId = body.workflowId;
    stepId = body.stepId;
    const stepNumber = body.stepNumber;
    const inputData = body.inputData;

    const jobTypeRaw = body.jobType;
    const jobType = normalizeJobType(jobTypeRaw);

    console.log(`Running automation: rawJobType=${jobTypeRaw} normalizedJobType=${jobType} client=${clientId}`);

    // Get client info
    const { data: client, error: clientError } = await supabase
      .from("client_accounts")
      .select("*")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      throw new Error(`Client not found: ${clientError?.message}`);
    }

    // Create automation job
    const { data: job, error: jobError } = await supabase
      .from("automation_jobs")
      .insert({
        client_id: clientId,
        job_type: jobType,
        status: "running",
        input_data: inputData || {},
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      throw new Error(`Failed to create job: ${jobError.message}`);
    }

    let result: Record<string, unknown> = {};

    // Route to appropriate handler
    switch (jobType) {
      case "send_intake_form":
        result = await sendIntakeForm(supabase, client);
        break;
      case "add_to_crm":
        result = await addClientToCrm(supabase, client);
        break;
      case "schedule_kickoff":
        result = await sendKickoffScheduler(supabase, client);
        break;
      case "run_page_speed_test":
        result = await runPageSpeedTest(supabase, client);
        break;
      case "create_google_review_link":
        result = await createGoogleReviewLink(supabase, client);
        break;
      case "create_review_qr_code":
        result = await createReviewQrCode(supabase, client);
        break;
      case "setup_review_automation":
        result = await setupReviewAutomation(supabase, client);
        break;
      case "send_review_scripts":
        result = await sendReviewScripts(supabase, client);
        break;
      case "create_kpi_dashboard":
      case "create_analytics_dashboard":
        result = await createKpiDashboard(supabase, client);
        break;
      case "run_seo_audit":
        result = await runSeoAudit(supabase, client);
        break;
      case "run_keyword_gap_analysis":
        result = await runKeywordGapAnalysis(supabase, client);
        break;
      case "setup_lead_automations":
        result = await setupLeadAutomations(supabase, client);
        break;
      case "setup_retargeting_audiences":
        result = await setupRetargetingAudiences(supabase, client);
        break;
      case "setup_retention_automations":
        result = await setupRetentionAutomations(supabase, client);
        break;
      case "generate_monthly_report":
      case "generate_report":
        result = await generateMonthlyReport(supabase, client);
        break;
      case "email_sequence":
      case "content_generation":
      case "report":
        result = await runAiAutomation(supabase, client, jobType, inputData);
        break;
      case "custom":
        result = await runCustomAutomation(supabase, client, inputData);
        break;
      case "add_segmentation_logic_to_funnel_steps":
        result = await addSegmentationLogicToFunnelSteps(supabase, client, inputData);
        break;
      case "build_renewal_reminder_sequence":
        result = await buildRenewalReminderSequence(supabase, client, inputData);
        break;
      case "build_review_to_case_study_workflow":
        result = await buildReviewToCaseStudyWorkflow(supabase, client, inputData);
        break;
      case "build_landing_pages":
        result = await buildLandingPages(supabase, client, inputData);
        break;
      case "build_website_rebuild":
        result = await buildWebsiteRebuild(supabase, client, inputData);
        break;
      case "run_advanced_seo":
        result = await runAdvancedSeo(supabase, client, inputData);
        break;
      case "create_lead_magnet":
        result = await createLeadMagnet(supabase, client, inputData);
        break;
      case "build_sales_funnel":
        result = await buildSalesFunnel(supabase, client, inputData);
        break;
      case "setup_sales_enablement":
        result = await setupSalesEnablement(supabase, client, inputData);
        break;
      case "schedule_strategy_call":
        result = await scheduleStrategyCall(supabase, client, inputData);
        break;
      case "optimize_crm_pipeline":
        result = await optimizeCrmPipeline(supabase, client, inputData);
        break;
      case "create_full_analytics_suite":
        result = await createFullAnalyticsSuite(supabase, client, inputData);
        break;
      case "generate_social_strategy":
        result = await upsertSocialStrategy(supabase, client, tierPolicy(client.tier));
        break;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    // Update task if provided
    if (taskId) {
      await supabase
        .from("client_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          automation_job_id: job.id,
          output_data: result,
        })
        .eq("id", taskId);
    }

    // Update job as completed
    await supabase
      .from("automation_jobs")
      .update({
        status: "completed",
        output_data: result,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    // If this run was driven by the onboarding checklist (advance-workflow
    // enqueued it against a workflow_steps row), close the loop: mark that
    // step completed and cascade the unlock so the rest of the checklist
    // actually advances. Previously nothing wrote back to workflow_steps
    // here, so every automation-type step stayed "in_progress" forever
    // once unlocked, wedging the whole chain behind it.
    if (workflowId && stepId) {
      await supabase
        .from("workflow_steps")
        .update({ status: "completed", completed_at: new Date().toISOString(), result })
        .eq("id", stepId)
        .eq("status", "in_progress");

      await unlockReadySteps(supabase, workflowId, stepNumber ?? null, clientId ?? null);
    }

    console.log(`Job ${job.id} completed successfully`);

    return new Response(
      JSON.stringify({ success: true, jobId: job.id, output: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Automation error:", errorMessage);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in run-automation`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'run-automation',
      source_id: clientId ?? undefined,
      metadata: {
        function_name: 'run-automation',
        client_id: clientId ?? null,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    });

    // Update job status to failed if job was created
    try {
      if (clientId) {
        const { data: runningJobs } = await supabase
          .from("automation_jobs")
          .select("id")
          .eq("client_id", clientId)
          .eq("status", "running")
          .order("created_at", { ascending: false })
          .limit(1);

        if (runningJobs?.[0]) {
          await supabase
            .from("automation_jobs")
            .update({
              status: "failed",
              error_message: errorMessage,
              completed_at: new Date().toISOString(),
            })
            .eq("id", runningJobs[0].id);
        }
      }

      if (taskId) {
        await supabase
          .from("client_tasks")
          .update({
            status: "failed",
            notes: `Error: ${errorMessage}`,
          })
          .eq("id", taskId);
      }

      if (stepId) {
        await supabase
          .from("workflow_steps")
          .update({ status: "failed", result: { error: errorMessage } })
          .eq("id", stepId)
          .eq("status", "in_progress");
      }
    } catch (cleanupErr) {
      console.error("Failed to update error status:", cleanupErr);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
