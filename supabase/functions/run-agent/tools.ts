// Tool registry for the agent loop: wraps the 28 existing run-automation
// handler files (31 distinct capabilities -- ai-automation.ts alone covers
// 4 job types) as callable tools rather than rewriting any of their logic.
// Each tool's `run` records an automation_jobs row the same way
// run-automation/index.ts already does, so existing admin dashboards that
// read automation_jobs keep working unchanged regardless of which entry
// point (run-automation or run-agent) triggered the work.
//
// requiresApproval reflects the one finding from auditing every handler for
// this: 26 of 31 only ever write internal DB rows or a `deliverables` row
// with status "pending_review" -- already gated, safe to run autonomously.
// The other 5 email the client directly (Resend), bypassing that gate, and
// are exactly the "client-facing content/communication" class the approval
// gate is for.

import type { ToolDefinition } from "../_shared/ai.ts";
import type { ClientData } from "../run-automation/types.ts";

import { sendIntakeForm } from "../run-automation/handlers/send-intake-form.ts";
import { addClientToCrm } from "../run-automation/handlers/add-to-crm.ts";
import { sendKickoffScheduler } from "../run-automation/handlers/schedule-kickoff.ts";
import { runPageSpeedTest } from "../run-automation/handlers/run-page-speed-test.ts";
import { createGoogleReviewLink } from "../run-automation/handlers/create-google-review-link.ts";
import { createReviewQrCode } from "../run-automation/handlers/create-review-qr-code.ts";
import { setupReviewAutomation } from "../run-automation/handlers/setup-review-automation.ts";
import { sendReviewScripts } from "../run-automation/handlers/send-review-scripts.ts";
import { createKpiDashboard } from "../run-automation/handlers/create-kpi-dashboard.ts";
import { runSeoAudit } from "../run-automation/handlers/run-seo-audit.ts";
import { runKeywordGapAnalysis } from "../run-automation/handlers/run-keyword-gap-analysis.ts";
import { setupLeadAutomations } from "../run-automation/handlers/setup-lead-automations.ts";
import { setupRetargetingAudiences } from "../run-automation/handlers/setup-retargeting-audiences.ts";
import { setupRetentionAutomations } from "../run-automation/handlers/setup-retention-automations.ts";
import { runAiAutomation } from "../run-automation/handlers/ai-automation.ts";
import { runCustomAutomation } from "../run-automation/handlers/custom.ts";
import { addSegmentationLogicToFunnelSteps } from "../run-automation/handlers/add-segmentation-logic.ts";
import { buildRenewalReminderSequence } from "../run-automation/handlers/build-renewal-reminder-sequence.ts";
import { buildReviewToCaseStudyWorkflow } from "../run-automation/handlers/build-review-to-case-study-workflow.ts";
import { buildLandingPages } from "../run-automation/handlers/build-landing-pages.ts";
import { buildWebsiteRebuild } from "../run-automation/handlers/build-website-rebuild.ts";
import { runAdvancedSeo } from "../run-automation/handlers/run-advanced-seo.ts";
import { createLeadMagnet } from "../run-automation/handlers/create-lead-magnet.ts";
import { buildSalesFunnel } from "../run-automation/handlers/build-sales-funnel.ts";
import { setupSalesEnablement } from "../run-automation/handlers/setup-sales-enablement.ts";
import { scheduleStrategyCall } from "../run-automation/handlers/schedule-strategy-call.ts";
import { optimizeCrmPipeline } from "../run-automation/handlers/optimize-crm-pipeline.ts";
import { createFullAnalyticsSuite } from "../run-automation/handlers/create-full-analytics-suite.ts";

export interface AutomationTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresApproval: boolean;
  run: (supabase: any, client: ClientData, inputData?: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

const noInputSchema = { type: "object", properties: {}, additionalProperties: false };

const freeformContextSchema = {
  type: "object",
  properties: {
    notes: { type: "string", description: "Any additional context, constraints, or instructions relevant to this task." },
  },
  additionalProperties: true,
};

export const AUTOMATION_TOOLS: AutomationTool[] = [
  // ── Requires approval: sends directly to the client, bypassing the
  // deliverables pending_review gate ──────────────────────────────────────
  {
    name: "send_intake_form",
    description: "Emails the client a link to their intake form to start onboarding. Sends directly to the client's inbox.",
    parameters: noInputSchema,
    requiresApproval: true,
    run: (supabase, client) => sendIntakeForm(supabase, client),
  },
  {
    name: "schedule_kickoff",
    description: "Emails the client a link to book their kickoff call. Sends directly to the client's inbox.",
    parameters: noInputSchema,
    requiresApproval: true,
    run: (supabase, client) => sendKickoffScheduler(supabase, client),
  },
  {
    name: "send_review_scripts",
    description: "Emails the client their Google review request toolkit (link, QR code, sample scripts). Sends directly to the client's inbox.",
    parameters: noInputSchema,
    requiresApproval: true,
    run: (supabase, client) => sendReviewScripts(supabase, client),
  },
  {
    name: "schedule_strategy_call",
    description: "Emails the client a link to book their monthly strategy call, referencing their latest report. Sends directly to the client's inbox.",
    parameters: freeformContextSchema,
    requiresApproval: true,
    run: (supabase, client, inputData) => scheduleStrategyCall(supabase, client, inputData),
  },
  {
    name: "build_website_rebuild",
    description: "Drafts a website rebuild brief and emails the client that their rebuild project has started. Sends directly to the client's inbox.",
    parameters: freeformContextSchema,
    requiresApproval: true,
    run: (supabase, client, inputData) => buildWebsiteRebuild(supabase, client, inputData),
  },

  // ── Autonomous: internal work only, or output lands as a
  // deliverables/generated_content row with status "pending_review" ──────
  {
    name: "add_to_crm",
    description: "Adds the client to the internal CRM/project tracker and marks onboarding progress. No client-facing output.",
    parameters: noInputSchema,
    requiresApproval: false,
    run: (supabase, client) => addClientToCrm(supabase, client),
  },
  {
    name: "run_page_speed_test",
    description: "Runs a PageSpeed audit on the client's website and stores the results as a deliverable for review.",
    parameters: noInputSchema,
    requiresApproval: false,
    run: (supabase, client) => runPageSpeedTest(supabase, client),
  },
  {
    name: "create_google_review_link",
    description: "Generates and stores the client's direct Google review link.",
    parameters: noInputSchema,
    requiresApproval: false,
    run: (supabase, client) => createGoogleReviewLink(supabase, client),
  },
  {
    name: "create_review_qr_code",
    description: "Generates a QR code image for the client's Google review link.",
    parameters: noInputSchema,
    requiresApproval: false,
    run: (supabase, client) => createReviewQrCode(supabase, client),
  },
  {
    name: "setup_review_automation",
    description: "Configures the client's automated review-request system (internal integration config, no email sent).",
    parameters: noInputSchema,
    requiresApproval: false,
    run: (supabase, client) => setupReviewAutomation(supabase, client),
  },
  {
    name: "create_kpi_dashboard",
    description: "Builds the client's KPI dashboard configuration and stores it as a deliverable for review.",
    parameters: noInputSchema,
    requiresApproval: false,
    run: (supabase, client) => createKpiDashboard(supabase, client),
  },
  {
    name: "run_seo_audit",
    description: "Runs a full SEO audit of the client's website and stores the results as a deliverable for review.",
    parameters: noInputSchema,
    requiresApproval: false,
    run: (supabase, client) => runSeoAudit(supabase, client),
  },
  {
    name: "run_keyword_gap_analysis",
    description: "Analyzes keyword gaps versus the client's competitors and stores the results as a deliverable for review.",
    parameters: noInputSchema,
    requiresApproval: false,
    run: (supabase, client) => runKeywordGapAnalysis(supabase, client),
  },
  {
    name: "setup_lead_automations",
    description: "Configures internal lead-handling automations (CRM reminders, tagging, notifications). No client-facing output.",
    parameters: noInputSchema,
    requiresApproval: false,
    run: (supabase, client) => setupLeadAutomations(supabase, client),
  },
  {
    name: "setup_retargeting_audiences",
    description: "Configures ad-platform retargeting audiences for the client. No client-facing output.",
    parameters: noInputSchema,
    requiresApproval: false,
    run: (supabase, client) => setupRetargetingAudiences(supabase, client),
  },
  {
    name: "setup_retention_automations",
    description: "Configures internal customer-retention automations. No client-facing output.",
    parameters: noInputSchema,
    requiresApproval: false,
    run: (supabase, client) => setupRetentionAutomations(supabase, client),
  },
  {
    name: "report",
    description: "Generates a performance report and stores it as a deliverable for review -- does not send it, sending is a separate explicit admin action. Defaults to last calendar month; pass periodStart/periodEnd (YYYY-MM-DD) in notes for a different period.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => runAiAutomation(supabase, client, "report", inputData),
  },
  {
    name: "email_sequence",
    description: "Drafts a personalized email sequence for the client and stores it as a deliverable for review -- does not activate or send it.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => runAiAutomation(supabase, client, "email_sequence", inputData),
  },
  // content_generation intentionally not exposed as a tool here -- content
  // drafts are owned by the fill-scheduled-content cron, which is the one
  // path tied to the calendar cadence, QA critique, image eligibility, and
  // auto-forward-to-approval. run-ai-batch already disables this same
  // capability on its own cron for the identical reason ("Enabling it here
  // would create a duplicate, unreviewed content path" -- see its
  // batchActions comment); an agent calling it directly would reopen the
  // same gap through a different door.
  {
    name: "custom",
    description: "Logs a completed one-off task that doesn't match any other tool. Provide taskName and description in notes.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => runCustomAutomation(supabase, client, inputData),
  },
  {
    name: "add_segmentation_logic_to_funnel_steps",
    description: "Adds audience segmentation logic to the client's funnel email steps. Drafted for review, not activated.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => addSegmentationLogicToFunnelSteps(supabase, client, inputData),
  },
  {
    name: "build_renewal_reminder_sequence",
    description: "Drafts a subscription/contract renewal reminder email sequence for review -- does not send it.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => buildRenewalReminderSequence(supabase, client, inputData),
  },
  {
    name: "build_review_to_case_study_workflow",
    description: "Drafts a workflow that turns strong client reviews into case studies, stored for review.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => buildReviewToCaseStudyWorkflow(supabase, client, inputData),
  },
  {
    name: "build_landing_pages",
    description: "Drafts a set of landing pages for the client, stored as content for review -- does not publish them.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => buildLandingPages(supabase, client, inputData),
  },
  {
    name: "run_advanced_seo",
    description: "Runs an advanced SEO program (deeper competitor + keyword work) and stores the results for review.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => runAdvancedSeo(supabase, client, inputData),
  },
  {
    name: "create_lead_magnet",
    description: "Drafts a lead magnet (guide/checklist/offer) and supporting email sequence, stored for review.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => createLeadMagnet(supabase, client, inputData),
  },
  {
    name: "build_sales_funnel",
    description: "Drafts a full sales funnel (pages + email sequence) for the client, stored for review.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => buildSalesFunnel(supabase, client, inputData),
  },
  {
    name: "setup_sales_enablement",
    description: "Drafts sales enablement content/materials for the client's team, stored for review.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => setupSalesEnablement(supabase, client, inputData),
  },
  {
    name: "optimize_crm_pipeline",
    description: "Reviews and drafts optimizations for the client's CRM pipeline configuration. No client-facing output.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => optimizeCrmPipeline(supabase, client, inputData),
  },
  {
    name: "create_full_analytics_suite",
    description: "Builds a comprehensive analytics/KPI dashboard suite for the client, stored as a deliverable for review.",
    parameters: freeformContextSchema,
    requiresApproval: false,
    run: (supabase, client, inputData) => createFullAnalyticsSuite(supabase, client, inputData),
  },
];

export function toToolDefinitions(tools: AutomationTool[]): ToolDefinition[] {
  return tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
}

export function findTool(name: string): AutomationTool | undefined {
  return AUTOMATION_TOOLS.find((t) => t.name === name);
}
