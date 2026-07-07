import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import type { AutomationType, AutomationRequest } from "./types.ts";

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

const ALLOWED_JOB_TYPES: AutomationType[] = [
  "send_intake_form",
  "add_to_crm",
  "schedule_kickoff",
  "run_page_speed_test",
  "create_google_review_link",
  "create_review_qr_code",
  "setup_review_automation",
  "send_review_scripts",
  // Both are accepted; DB constraint currently allows create_analytics_dashboard
  "create_kpi_dashboard",
  "create_analytics_dashboard",
  "run_seo_audit",
  "run_keyword_gap_analysis",
  "setup_lead_automations",
  "setup_retargeting_audiences",
  "setup_retention_automations",
  "generate_monthly_report",
  "generate_report",
  "email_sequence",
  "content_generation",
  "report",
  "custom",
  "add_segmentation_logic_to_funnel_steps",
  "build_renewal_reminder_sequence",
  "build_review_to_case_study_workflow",
  "build_landing_pages",
  "build_website_rebuild",
  "run_advanced_seo",
  "create_lead_magnet",
  "build_sales_funnel",
  "setup_sales_enablement",
  "schedule_strategy_call",
  "optimize_crm_pipeline",
  "create_full_analytics_suite",
];

function normalizeJobType(raw: unknown): AutomationType {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (!normalized) throw new Error("Missing jobType");

  // Backward/legacy aliases sent by older UI/task templates
  // NOTE: DB check constraint currently allows `create_analytics_dashboard` (not `create_kpi_dashboard`).
  const aliasMap: Record<string, AutomationType> = {
    // KPI Dashboard aliases
    build_comprehensive_kpi_dashboards: "create_analytics_dashboard",
    comprehensive_kpi_dashboards: "create_analytics_dashboard",
    kpi_dashboard: "create_analytics_dashboard",
    create_kpi_dashboard: "create_analytics_dashboard",

    // Intake form aliases
    send_client_intake_form: "send_intake_form",
    intake_form: "send_intake_form",

    // Content generation aliases
    write_2_monthly_blog_posts: "content_generation",
    write_monthly_blog_posts: "content_generation",
    generate_blog_post: "content_generation",
    generate_blog_posts: "content_generation",
    google_post: "content_generation",
    social_media_post: "content_generation",
    social_post: "content_generation",
    blog_post: "content_generation",

    // Report aliases
    monthly_report: "generate_monthly_report",
    performance_report: "generate_monthly_report",
    client_report: "generate_monthly_report",

    // SEO aliases
    seo_audit: "run_seo_audit",
    keyword_gap: "run_keyword_gap_analysis",
    keyword_analysis: "run_keyword_gap_analysis",

    // Review system aliases
    review_automation: "setup_review_automation",
    review_link: "create_google_review_link",
    review_qr: "create_review_qr_code",
    review_scripts: "send_review_scripts",

    // Lead automation aliases
    lead_automation: "setup_lead_automations",
    retargeting: "setup_retargeting_audiences",
    retention: "setup_retention_automations",

    // Other aliases
    page_speed: "run_page_speed_test",
    speed_test: "run_page_speed_test",
    crm: "add_to_crm",
    kickoff: "schedule_kickoff",

    // CRM/project tracker aliases
    add_client_to_crm_project_tracker: "add_to_crm",
    add_client_to_crm: "add_to_crm",
    connect_automations_to_crm: "add_to_crm",

    // Landing pages aliases
    landing_page_pack: "build_landing_pages",
    landing_pages: "build_landing_pages",
    build_3_5_landing_pages: "build_landing_pages",
    build_landing_page_pack: "build_landing_pages",

    // Website rebuild aliases
    full_website_rebuild: "build_website_rebuild",
    website_rebuild: "build_website_rebuild",
    rebuild_website: "build_website_rebuild",

    // Advanced SEO aliases
    advanced_seo: "run_advanced_seo",
    advanced_seo_program: "run_advanced_seo",
    run_advanced_seo_program: "run_advanced_seo",

    // Lead magnet aliases
    lead_magnet: "create_lead_magnet",
    lead_magnet_development: "create_lead_magnet",
    create_lead_magnets: "create_lead_magnet",

    // Sales funnel aliases
    full_funnel_buildout: "build_sales_funnel",
    sales_funnel: "build_sales_funnel",
    funnel_buildout: "build_sales_funnel",
    build_complete_sales_funnel: "build_sales_funnel",

    // Sales enablement aliases
    sales_enablement: "setup_sales_enablement",
    sales_enablement_system: "setup_sales_enablement",

    // Strategy call aliases
    monthly_strategy_call: "schedule_strategy_call",
    strategy_call: "schedule_strategy_call",
    schedule_monthly_call: "schedule_strategy_call",

    // CRM pipeline optimization aliases
    crm_pipeline_optimization: "optimize_crm_pipeline",
    crm_pipeline: "optimize_crm_pipeline",
    optimize_crm: "optimize_crm_pipeline",

    // Full analytics suite aliases
    full_analytics_suite: "create_full_analytics_suite",
    analytics_suite: "create_full_analytics_suite",
    full_analytics: "create_full_analytics_suite",

    // Email/SMS sequence aliases
    build_immediate_response_email_for_new_leads: "email_sequence",
    build_immediate_response_email: "email_sequence",
    build_3_5_follow_up_emails_for_leads: "email_sequence",
    build_3_5_follow_up_emails: "email_sequence",
    build_nurture_email_sequence: "email_sequence",
    build_confirmation_sms_for_new_leads: "setup_lead_automations",
    build_confirmation_sms: "setup_lead_automations",
    build_no_response_sms_workflow: "setup_lead_automations",
    build_no_response_sms: "setup_lead_automations",

    // Retargeting/segmentation aliases
    build_retargeting_audiences: "setup_retargeting_audiences",
    add_automated_crm_reminders: "setup_lead_automations",
    add_lead_tagging_and_segmentation: "setup_lead_automations",
    add_team_notifications_for_pipeline_events: "setup_lead_automations",
    add_team_notifications: "setup_lead_automations",

    // Review request system aliases
    build_automated_review_request_system: "setup_review_automation",
    provide_review_request_scripts_templates: "send_review_scripts",

    // KPI/analytics/reporting aliases
    build_kpi_dashboard_outline: "create_analytics_dashboard",
    review_monthly_analytics_and_kpis: "generate_monthly_report",
    prepare_and_send_monthly_performance_summary: "generate_monthly_report",

    // SEO task aliases
    optimize_meta_titles_and_descriptions: "run_seo_audit",
    add_schema_markup: "run_seo_audit",
    optimize_meta_titles: "run_seo_audit",
    meta_title_optimization: "run_seo_audit",
    schema_markup: "run_seo_audit",
    fix_broken_links: "run_seo_audit",
    technical_seo: "run_seo_audit",
    on_page_seo: "run_seo_audit",
    optimize_page_speed: "run_page_speed_test",
    page_speed_optimization: "run_page_speed_test",
    submit_sitemap: "run_seo_audit",
    internal_linking: "run_seo_audit",
    local_seo: "run_seo_audit",
    citation_building: "run_seo_audit",

    // Workflow step task_type aliases (from seed-tier-workflow FOUNDATION_STEPS / GROWTH_EXTRA / TRANSFORMATION_EXTRA)
    website_analysis: "run_page_speed_test",
    gap_report: "run_keyword_gap_analysis",
    content: "content_generation",
    email_template: "email_sequence",
    ad_copy: "content_generation",
    social_content: "content_generation",
    analytics: "create_analytics_dashboard",
  };

  const resolved: AutomationType = aliasMap[normalized] ?? (normalized as AutomationType);

  if (ALLOWED_JOB_TYPES.includes(resolved)) {
    return resolved;
  }

  throw new Error(`Unsupported jobType: ${normalized}`);
}

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
    } catch (cleanupErr) {
      console.error("Failed to update error status:", cleanupErr);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
