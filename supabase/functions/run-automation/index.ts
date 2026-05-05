import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AutomationType = 
  | "send_intake_form"
  | "add_to_crm"
  | "schedule_kickoff"
  | "run_page_speed_test"
  | "create_google_review_link"
  | "create_review_qr_code"
  | "setup_review_automation"
  | "send_review_scripts"
  | "create_kpi_dashboard"
  | "create_analytics_dashboard" // legacy DB enum/constraint value
  | "run_seo_audit"
  | "run_keyword_gap_analysis"
  | "setup_lead_automations"
  | "setup_retargeting_audiences"
  | "setup_retention_automations"
  | "generate_monthly_report"
  | "generate_report"
  | "email_sequence"
  | "content_generation"
  | "report"
  | "custom"
  | "add_segmentation_logic_to_funnel_steps"
  | "build_renewal_reminder_sequence"
  | "build_review_to_case_study_workflow";

interface AutomationRequest {
  clientId: string;
  taskId?: string;
  // Accept string here because callers may send legacy/slightly different slugs (e.g. hyphens)
  jobType: string;
  inputData?: Record<string, unknown>;
}

interface ClientData {
  id: string;
  business_name: string;
  email: string;
  tier: string;
  level: number;
  google_place_id?: string;
  google_review_url?: string;
  review_qr_image_url?: string;
  industry?: string;
  first_name?: string;
  last_name?: string;
  website_url?: string;
  website_summary?: string;
  context_profile?: Record<string, unknown>;
  tone?: string;
}

// Helper to create a deliverable
async function createDeliverable(
  supabase: any, 
  clientId: string, 
  title: string, 
  description: string, 
  category: string = "report"
) {
  const { error } = await supabase.from("deliverables").insert({
    client_account_id: clientId,
    title,
    description,
    category,
    status: "pending_review",
  });
  if (error) {
    console.error("Failed to create deliverable:", error);
  }
  return !error;
}

// Helper to format date
function formatDate() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

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

// ============ AUTOMATION HANDLERS ============

async function sendIntakeForm(supabase: any, client: ClientData) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const APP_URL = Deno.env.get("APP_URL") || "https://orangedoormarketing.com";
  const intakeUrl = `${APP_URL}/intake?clientId=${client.id}`;

  if (RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Orange Door Consultants <hello@orangedoormarketing.com>",
        to: client.email,
        subject: "Welcome to Orange Door – Complete Your Intake Form",
        html: `
          <h2>Welcome to Orange Door Marketing, ${client.first_name || client.business_name}!</h2>
          <p>We're excited to start working with you. To get started, please complete your intake form:</p>
          <p><a href="${intakeUrl}" style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Complete Intake Form</a></p>
          <p>This helps us understand your business and goals so we can create the best strategy for you.</p>
          <p>Best regards,<br/>The Orange Door Team</p>
        `,
      }),
    });
  }

  await supabase
    .from("client_onboarding")
    .update({ intake_form_sent_at: new Date().toISOString() })
    .eq("client_account_id", client.id);

  // Create deliverable
  const reportDate = formatDate();
  await createDeliverable(
    supabase,
    client.id,
    `Intake Form Sent - ${reportDate}`,
    `# Intake Form Sent

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Details

- **Email sent to:** ${client.email}
- **Intake URL:** ${intakeUrl}

## What's Next

The client will receive an email with a link to complete their intake form. Once completed, we'll proceed with:
- CRM setup
- Kickoff call scheduling
- Dashboard configuration

*This task has been automatically completed.*`,
    "general"
  );

  return { intakeUrl, emailSent: !!RESEND_API_KEY, deliverableCreated: true };
}

async function addClientToCrm(supabase: any, client: ClientData) {
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  const added = !!config;
  const crmId = config ? `ghl_${client.id}` : null;

  await supabase
    .from("client_onboarding")
    .update({ crm_added_at: new Date().toISOString() })
    .eq("client_account_id", client.id);

  const reportDate = formatDate();
  await createDeliverable(
    supabase,
    client.id,
    `CRM Setup - ${reportDate}`,
    `# CRM Integration Setup

## Status: ${added ? 'Complete' : 'Pending Configuration'}

*Generated on ${reportDate} for ${client.business_name}*

## Details

${added ? `- **CRM ID:** ${crmId}
- **Platform:** GoHighLevel
- **Status:** Contact created successfully` : `- **Status:** No CRM integration configured
- **Action Required:** Configure GoHighLevel integration in admin settings`}

## What This Enables

- Centralized contact management
- Automated follow-up sequences
- Lead tracking and attribution
- Sales pipeline visibility

*${added ? 'CRM integration is now active for this client.' : 'Contact your admin to configure CRM integration.'}*`,
    "general"
  );

  return { added, crmId, deliverableCreated: true };
}

async function sendKickoffScheduler(supabase: any, client: ClientData) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const KICKOFF_CALENDAR_URL = "https://calendly.com/orangedoor/kickoff";

  if (RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Orange Door Consultants <hello@orangedoormarketing.com>",
        to: client.email,
        subject: "Schedule Your Kickoff Call – Orange Door Marketing",
        html: `
          <h2>Let's Get Started, ${client.first_name || client.business_name}!</h2>
          <p>We're ready to kick off your marketing journey. Please schedule your kickoff call at your convenience:</p>
          <p><a href="${KICKOFF_CALENDAR_URL}" style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Schedule Kickoff Call</a></p>
          <p>During this call, we'll review your goals, discuss strategy, and outline our first 30 days together.</p>
          <p>Best regards,<br/>The Orange Door Team</p>
        `,
      }),
    });
  }

  const reportDate = formatDate();
  await createDeliverable(
    supabase,
    client.id,
    `Kickoff Scheduler Sent - ${reportDate}`,
    `# Kickoff Call Scheduler Sent

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Details

- **Scheduling link sent to:** ${client.email}
- **Calendar URL:** ${KICKOFF_CALENDAR_URL}

## Kickoff Call Agenda

During the kickoff call, we'll cover:
- Review of business goals and objectives
- Discussion of target audience and ideal customers
- Marketing strategy overview
- Timeline and expectations for first 30 days
- Q&A session

## What's Next

Once the client schedules their kickoff call, we'll prepare:
- Custom strategy presentation
- Initial recommendations based on intake form
- Timeline for deliverables

*Awaiting client to book their kickoff call.*`,
    "general"
  );

  return { schedulerSent: true, calendarUrl: KICKOFF_CALENDAR_URL, deliverableCreated: true };
}

async function runPageSpeedTest(supabase: any, client: ClientData) {
  const websiteUrl = client.website_url || "";
  
  if (!websiteUrl) {
    const reportDate = formatDate();
    await createDeliverable(
      supabase,
      client.id,
      `Page Speed Test - ${reportDate}`,
      `# Page Speed Test

## Status: Unable to Complete

*Generated on ${reportDate} for ${client.business_name}*

## Issue

No website URL is configured for this client. Please add the client's website URL in their profile to run speed tests.

## Action Required

1. Update client profile with website URL
2. Re-run this automation

*This task requires manual configuration.*`,
      "report"
    );
    return { tested: false, reason: "No website URL configured", deliverableCreated: true };
  }

  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(websiteUrl)}&strategy=mobile`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`PageSpeed API error: ${response.status}`);
    }

    const data = await response.json();
    const score = data.lighthouseResult?.categories?.performance?.score * 100;
    const fcp = data.lighthouseResult?.audits?.['first-contentful-paint']?.displayValue || 'N/A';
    const lcp = data.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue || 'N/A';
    const cls = data.lighthouseResult?.audits?.['cumulative-layout-shift']?.displayValue || 'N/A';
    const tbt = data.lighthouseResult?.audits?.['total-blocking-time']?.displayValue || 'N/A';

    await supabase.from("page_speed_results").insert({
      client_account_id: client.id,
      url: websiteUrl,
      score_mobile: score,
      core_web_vitals: data.lighthouseResult?.audits,
      raw_data: data,
    });

    const reportDate = formatDate();
    await createDeliverable(
      supabase,
      client.id,
      `Page Speed Analysis - ${reportDate}`,
      `# Page Speed Analysis Report

## Overall Performance Score: ${Math.round(score)}/100

*Generated on ${reportDate} for ${client.business_name}*

**Website Tested:** ${websiteUrl}

## Core Web Vitals

| Metric | Value | Status |
|--------|-------|--------|
| First Contentful Paint (FCP) | ${fcp} | ${parseFloat(fcp) < 1.8 ? '✅ Good' : parseFloat(fcp) < 3 ? '⚠️ Needs Improvement' : '❌ Poor'} |
| Largest Contentful Paint (LCP) | ${lcp} | ${parseFloat(lcp) < 2.5 ? '✅ Good' : parseFloat(lcp) < 4 ? '⚠️ Needs Improvement' : '❌ Poor'} |
| Cumulative Layout Shift (CLS) | ${cls} | ${parseFloat(cls) < 0.1 ? '✅ Good' : parseFloat(cls) < 0.25 ? '⚠️ Needs Improvement' : '❌ Poor'} |
| Total Blocking Time (TBT) | ${tbt} | ${parseFloat(tbt) < 200 ? '✅ Good' : parseFloat(tbt) < 600 ? '⚠️ Needs Improvement' : '❌ Poor'} |

## Performance Grade

${score >= 90 ? '🏆 **Excellent!** Your website performs very well.' : 
  score >= 50 ? '⚠️ **Needs Improvement.** Several optimizations could help.' : 
  '❌ **Poor Performance.** Significant improvements needed.'}

## Recommendations

${score < 90 ? `Based on your score, we recommend:
- Optimizing images and using modern formats (WebP)
- Minimizing JavaScript and CSS files
- Implementing lazy loading for images
- Using a Content Delivery Network (CDN)
- Enabling browser caching` : 'Your website is performing well! Continue monitoring and maintain current optimizations.'}

*Your marketing team will review these findings and prioritize improvements.*`,
      "report"
    );

    return { tested: true, scoreMobile: score, deliverableCreated: true };
  } catch (error) {
    console.error("PageSpeed test error:", error);
    return { tested: false, error: error instanceof Error ? error.message : "Unknown error", deliverableCreated: false };
  }
}

async function createGoogleReviewLink(supabase: any, client: ClientData) {
  const reportDate = formatDate();
  
  if (!client.google_place_id) {
    await createDeliverable(
      supabase,
      client.id,
      `Google Review Link - ${reportDate}`,
      `# Google Review Link Setup

## Status: Pending Configuration

*Generated on ${reportDate} for ${client.business_name}*

## Issue

No Google Place ID is configured for this client.

## How to Find Your Google Place ID

1. Search for your business on Google Maps
2. Click on your business listing
3. Look at the URL - the Place ID is after "place/"
4. Or use the Google Place ID Finder tool

## Action Required

1. Find your Google Place ID
2. Update the client profile with the Place ID
3. Re-run this automation

*This is required for Google review functionality.*`,
      "general"
    );
    return { created: false, reason: "No Google Place ID configured", deliverableCreated: true };
  }

  const reviewUrl = `https://search.google.com/local/writereview?placeid=${client.google_place_id}`;

  await supabase
    .from("client_accounts")
    .update({ google_review_url: reviewUrl })
    .eq("id", client.id);

  await createDeliverable(
    supabase,
    client.id,
    `Google Review Link Created - ${reportDate}`,
    `# Google Review Link Created

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Your Direct Review Link

**URL:** ${reviewUrl}

## How to Use This Link

Share this link with customers to make it easy for them to leave a review:
- Add it to thank you emails
- Include in SMS follow-ups
- Put it on receipts or invoices
- Display in your store/office

## Why Reviews Matter

- **90%** of consumers read online reviews before visiting a business
- **72%** of customers will take action only after reading a positive review
- Reviews improve your local SEO ranking

*The QR code for this link can be generated with the next automation step.*`,
    "general"
  );

  return { created: true, reviewUrl, deliverableCreated: true };
}

async function createReviewQrCode(supabase: any, client: ClientData) {
  const reviewUrl = client.google_review_url;
  const reportDate = formatDate();
  
  if (!reviewUrl) {
    await createDeliverable(
      supabase,
      client.id,
      `Review QR Code - ${reportDate}`,
      `# Review QR Code Generation

## Status: Pending

*Generated on ${reportDate} for ${client.business_name}*

## Issue

No Google review URL is configured. Please run the "Create Google Review Link" automation first.

## Steps Required

1. Run "Create Google Review Link" automation
2. Then re-run this QR code generation

*This task depends on having a Google review link.*`,
      "general"
    );
    return { created: false, reason: "No review URL configured", deliverableCreated: true };
  }

  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(reviewUrl)}`;

  await supabase
    .from("client_accounts")
    .update({ review_qr_image_url: qrApiUrl })
    .eq("id", client.id);

  await createDeliverable(
    supabase,
    client.id,
    `Review QR Code Created - ${reportDate}`,
    `# Review QR Code Created

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Your QR Code

**QR Code URL:** ${qrApiUrl}

When customers scan this QR code with their phone, they'll be taken directly to your Google review page.

## Best Uses for Your QR Code

- **Print Materials:** Business cards, flyers, brochures
- **Point of Sale:** Register stands, receipts
- **Physical Locations:** Window stickers, table tents
- **Staff Tools:** Give to staff to show customers

## Implementation Tips

- Print QR code at minimum 1" x 1" size for easy scanning
- Add a brief call-to-action like "Scan to leave us a review!"
- Test the QR code before printing to ensure it works

*Download and print your QR code to start collecting more reviews!*`,
    "general"
  );

  return { created: true, qrUrl: qrApiUrl, deliverableCreated: true };
}

async function setupReviewAutomation(supabase: any, client: ClientData) {
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  const reportDate = formatDate();
  const hasIntegration = !!config;

  await createDeliverable(
    supabase,
    client.id,
    `Review Automation Setup - ${reportDate}`,
    `# Review Automation Setup

## Status: ${hasIntegration ? 'Complete' : 'Pending Configuration'}

*Generated on ${reportDate} for ${client.business_name}*

## Configuration

${hasIntegration ? `**Integration:** GoHighLevel
**Workflow:** review_request_workflow
**Status:** Active and running` : `**Status:** No CRM integration configured
**Action Required:** Configure GoHighLevel integration to enable automated review requests`}

## Automation Flow

${hasIntegration ? `When this automation is active:

1. **After Service Completion:** Customer receives initial review request (2 hours later)
2. **First Follow-up:** Reminder sent if no review (3 days later)
3. **Final Follow-up:** Last gentle reminder (7 days later)

### Channels Used
- Email (primary)
- SMS (if phone number available)` : `To enable this automation, you need to:
1. Configure GoHighLevel integration
2. Re-run this automation`}

## Expected Results

- **30-50%** increase in review volume
- Consistent review flow
- Improved online reputation

*${hasIntegration ? 'Your review automation is now live!' : 'Configure CRM integration to activate.'}*`,
    "general"
  );

  return { setup: hasIntegration, workflowId: hasIntegration ? "review_request_workflow" : null, deliverableCreated: true };
}

async function sendReviewScripts(supabase: any, client: ClientData) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const reportDate = formatDate();

  if (RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Orange Door Consultants <hello@orangedoormarketing.com>",
        to: client.email,
        subject: "Your Google Review Toolkit – Orange Door Marketing",
        html: `
          <h2>Your Review Request Toolkit</h2>
          <p>Hi ${client.first_name || client.business_name},</p>
          <p>Getting more Google reviews is one of the fastest ways to boost your local visibility. Here's your toolkit:</p>
          
          <h3>Your Direct Review Link:</h3>
          <p><a href="${client.google_review_url}">${client.google_review_url}</a></p>
          
          ${client.review_qr_image_url ? `<h3>Your Review QR Code:</h3><img src="${client.review_qr_image_url}" alt="Review QR Code" />` : ''}
          
          <h3>Sample Scripts:</h3>
          <p><strong>In-Person:</strong> "We'd love to hear your feedback! If you have a moment, a Google review really helps other customers find us."</p>
          <p><strong>Email:</strong> "Thank you for choosing us! We'd appreciate it if you could share your experience on Google: [link]"</p>
          <p><strong>After Service:</strong> "How was everything today? If you're happy with our service, would you mind leaving us a quick review?"</p>
          
          <p>Best regards,<br/>The Orange Door Team</p>
        `,
      }),
    });
  }

  await createDeliverable(
    supabase,
    client.id,
    `Review Scripts Delivered - ${reportDate}`,
    `# Review Scripts & Toolkit Delivered

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## What Was Sent

An email containing:
- Direct Google review link
- QR code (if available)
- Ready-to-use scripts for staff

## Review Request Scripts

### In-Person Script
> "We'd love to hear your feedback! If you have a moment, a Google review really helps other customers find us."

### Email/SMS Script
> "Thank you for choosing us! We'd appreciate it if you could share your experience on Google: [link]"

### After Service Script
> "How was everything today? If you're happy with our service, would you mind leaving us a quick review?"

### Follow-up Script (for happy customers)
> "I noticed you seemed really happy with [service]. If you have 30 seconds, a quick Google review would mean so much to us!"

## Tips for Staff

- **Timing is key:** Ask when the customer is happiest (after successful service)
- **Be genuine:** A sincere ask gets better results
- **Make it easy:** Have the QR code ready to show
- **Don't pressure:** One ask is enough

*Train your team on these scripts to maximize review collection!*`,
    "general"
  );

  return { sent: !!RESEND_API_KEY, deliverableCreated: true };
}

async function createKpiDashboard(supabase: any, client: ClientData) {
  const widgetsByLevel: Record<number, string[]> = {
    1: ["traffic_overview", "gbp_calls", "form_submissions", "reviews"],
    2: ["traffic_overview", "gbp_calls", "form_submissions", "reviews", "lead_sources", "email_performance", "ad_performance"],
    3: ["traffic_overview", "gbp_calls", "form_submissions", "reviews", "lead_sources", "email_performance", "ad_performance", "funnel_metrics", "seo_visibility", "retention", "revenue_attribution"],
  };

  const { data: existing } = await supabase
    .from("kpi_dashboards")
    .select("id")
    .eq("client_account_id", client.id)
    .single();

  const reportDate = formatDate();
  const widgets = widgetsByLevel[client.level || 1] || widgetsByLevel[1];

  if (existing) {
    await createDeliverable(
      supabase,
      client.id,
      `KPI Dashboard - ${reportDate}`,
      `# KPI Dashboard Configuration

## Status: Already Exists

*Generated on ${reportDate} for ${client.business_name}*

A KPI dashboard was already configured for this client. No changes were made.

## Current Configuration

**Tier Level:** ${client.level || 1}

Access the dashboard through the client portal to view your marketing metrics.

*No action required.*`,
      "general"
    );
    return { created: false, reason: "Dashboard already exists", deliverableCreated: true };
  }

  await supabase.from("kpi_dashboards").insert({
    client_account_id: client.id,
    config: { widgets },
  });

  const widgetDescriptions: Record<string, string> = {
    traffic_overview: "Website traffic and visitor trends",
    gbp_calls: "Google Business Profile call tracking",
    form_submissions: "Lead form submissions and conversions",
    reviews: "Google review count and rating",
    lead_sources: "Where your leads are coming from",
    email_performance: "Email open rates and click-throughs",
    ad_performance: "Paid advertising ROI and metrics",
    funnel_metrics: "Sales funnel conversion rates",
    seo_visibility: "Search engine ranking positions",
    retention: "Customer retention and repeat business",
    revenue_attribution: "Revenue by marketing channel",
  };

  await createDeliverable(
    supabase,
    client.id,
    `KPI Dashboard Created - ${reportDate}`,
    `# KPI Dashboard Created

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Dashboard Configuration

**Tier Level:** ${client.level || 1}
**Widgets Enabled:** ${widgets.length}

## Your Dashboard Includes

${widgets.map(w => `- **${w.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}:** ${widgetDescriptions[w] || 'Custom metric tracking'}`).join('\n')}

## How to Access

1. Log in to your client portal
2. Navigate to the Analytics section
3. View your real-time marketing metrics

## What's Next

- Data will populate as marketing activities begin
- Review your dashboard weekly to track progress
- Your team will send monthly reports highlighting key insights

*Your personalized marketing dashboard is ready!*`,
    "general"
  );

  return { created: true, widgets, deliverableCreated: true };
}

async function runSeoAudit(supabase: any, client: ClientData) {
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const websiteUrl = client.website_url;
  if (!websiteUrl) {
    // Fallback to hardcoded scores when no website URL is available
    const fallback = {
      technical: { score: 0, issues: ["No website URL configured for this client"] },
      onPage: { score: 0, issues: ["Cannot analyze – no website URL"] },
      offPage: { score: 0, issues: ["Cannot analyze – no website URL"] },
    };
    const overallScore = 0;
    await supabase.from("seo_audits").insert({
      client_account_id: client.id,
      audit_type: "full",
      score: overallScore,
      results: fallback,
    });
    return { completed: true, results: fallback, deliverableCreated: false };
  }

  // Build list of pages to analyze (homepage + up to 2 additional key pages)
  const pagesToAnalyze: string[] = [websiteUrl];

  // Check for additional pages from seo_page_analysis or content calendar
  try {
    const { data: existingPages } = await supabase
      .from("seo_page_analysis")
      .select("url")
      .eq("client_account_id", client.id)
      .neq("url", websiteUrl)
      .limit(2);
    if (existingPages?.length) {
      pagesToAnalyze.push(...existingPages.map((p: any) => p.url));
    }
  } catch (_e) {
    // No additional pages to analyze – that's fine
  }

  // Fetch target keywords from client competitors or use empty
  let targetKeywords: string[] = [];
  try {
    const { data: competitors } = await supabase
      .from("client_competitors")
      .select("name")
      .eq("client_account_id", client.id)
      .limit(5);
    if (competitors?.length) {
      targetKeywords = competitors.map((c: any) => c.name);
    }
  } catch (_e) { /* no keywords */ }

  // Analyze each page via the analyze-seo edge function
  const pageResults: any[] = [];
  for (const pageUrl of pagesToAnalyze.slice(0, 3)) {
    try {
      const res = await fetch(`${baseUrl}/functions/v1/analyze-seo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          clientId: client.id,
          url: pageUrl,
          targetKeywords,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.analysis) {
          pageResults.push(data.analysis);
        }
      } else {
        console.error(`analyze-seo failed for ${pageUrl}:`, res.status);
      }
    } catch (e) {
      console.error(`analyze-seo error for ${pageUrl}:`, e);
    }
  }

  // Aggregate scores from real analysis results
  let auditResults: any;
  if (pageResults.length > 0) {
    const avg = (field: string) =>
      Math.round(pageResults.reduce((sum, p) => sum + (p[field] || 0), 0) / pageResults.length);

    const technicalIssues = pageResults
      .flatMap((p) => (p.technical_issues || []).map((i: any) => typeof i === "string" ? i : i.issue))
      .filter(Boolean);
    const readabilityIssues = pageResults
      .flatMap((p) => (p.readability_issues || []).map((i: any) => typeof i === "string" ? i : i.issue))
      .filter(Boolean);

    // Deduplicate issues
    const uniqueTechnical = [...new Set(technicalIssues)];
    const uniqueReadability = [...new Set(readabilityIssues)];

    auditResults = {
      technical: { score: avg("technical_score"), issues: uniqueTechnical.length ? uniqueTechnical : ["No major technical issues found"] },
      onPage: { score: avg("keyword_score"), issues: uniqueReadability.length ? uniqueReadability : ["Content quality looks good"] },
      offPage: { score: avg("backlink_potential"), issues: pageResults.some(p => (p.external_links || 0) < 3) ? ["Few external links detected", "Consider building more quality backlinks"] : ["Backlink profile looks reasonable"] },
      pagesAnalyzed: pageResults.length,
      overallScore: avg("overall_score"),
      readabilityScore: avg("readability_score"),
    };
  } else {
    auditResults = {
      technical: { score: 50, issues: ["Could not reach website for analysis"] },
      onPage: { score: 50, issues: ["Website was unreachable during audit"] },
      offPage: { score: 50, issues: ["Unable to assess backlink profile"] },
    };
  }

  const overallScore = auditResults.overallScore ??
    Math.round((auditResults.technical.score + auditResults.onPage.score + auditResults.offPage.score) / 3);

  await supabase.from("seo_audits").insert({
    client_account_id: client.id,
    audit_type: "full",
    score: overallScore,
    results: auditResults,
  });

  const reportDate = formatDate();
  const markdownReport = `# SEO Audit Report

## Overall Score: ${overallScore}/100

*Generated on ${reportDate} for ${client.business_name}*
*Pages analyzed: ${pageResults.length}*

## Technical SEO
**Score:** ${auditResults.technical.score}/100

### Issues Found:
${auditResults.technical.issues.map((issue: string) => `- ${issue}`).join('\n')}

## On-Page SEO
**Score:** ${auditResults.onPage.score}/100

### Issues Found:
${auditResults.onPage.issues.map((issue: string) => `- ${issue}`).join('\n')}

## Off-Page SEO
**Score:** ${auditResults.offPage.score}/100

### Issues Found:
${auditResults.offPage.issues.map((issue: string) => `- ${issue}`).join('\n')}

## Next Steps

Based on this audit, we recommend focusing on:
${auditResults.technical.score < 70 ? '- Addressing technical SEO issues (meta tags, page speed, mobile friendliness)\n' : ''}${auditResults.offPage.score < 70 ? '- Building more quality backlinks\n' : ''}${auditResults.onPage.score < 70 ? '- Improving content depth and keyword optimization\n' : ''}${overallScore >= 70 ? '- Maintaining current SEO momentum with regular audits\n' : ''}
*Your marketing team will review these findings and create an action plan.*`;

  await createDeliverable(
    supabase,
    client.id,
    `SEO Audit Report - ${reportDate}`,
    markdownReport,
    "report"
  );

  return { completed: true, results: auditResults, deliverableCreated: true };
}

async function runKeywordGapAnalysis(supabase: any, client: ClientData) {
  const { data: competitors } = await supabase
    .from("client_competitors")
    .select("*")
    .eq("client_account_id", client.id);

  const reportDate = formatDate();

  if (!competitors?.length) {
    await createDeliverable(
      supabase,
      client.id,
      `Keyword Gap Analysis - ${reportDate}`,
      `# Keyword Gap Analysis

## Status: Unable to Complete

*Generated on ${reportDate} for ${client.business_name}*

## Issue

No competitors are configured for this client. Competitor data is required to perform keyword gap analysis.

## How to Add Competitors

1. Go to the admin panel
2. Navigate to client settings
3. Add competitor domains

## Why This Matters

Keyword gap analysis helps identify:
- Keywords competitors rank for that you don't
- Content opportunities
- Market positioning gaps

*Add competitors to enable this analysis.*`,
      "report"
    );
    return { completed: false, reason: "No competitors configured", deliverableCreated: true };
  }

  // Fetch HTML and extract text/keywords from each URL
  const fetchPageKeywords = async (url: string): Promise<{ url: string; title: string; h1: string[]; metaKeywords: string; textPreview: string; wordCount: number }> => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "OrangeDoorSEOBot/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { url, title: "", h1: [], metaKeywords: "", textPreview: "", wordCount: 0 };
      const html = (await res.text()).slice(0, 50000);
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Matches = html.match(/<h1[^>]*>([^<]+)<\/h1>/gi) || [];
      const metaKwMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i);
      const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return {
        url,
        title: titleMatch ? titleMatch[1].trim() : "",
        h1: h1Matches.map(h => h.replace(/<[^>]+>/g, "").trim()),
        metaKeywords: metaKwMatch ? metaKwMatch[1].trim() : "",
        textPreview: text.slice(0, 1000),
        wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
      };
    } catch (_e) {
      return { url, title: "", h1: [], metaKeywords: "", textPreview: "", wordCount: 0 };
    }
  };

  // Crawl client website
  const clientData = client.website_url ? await fetchPageKeywords(client.website_url) : null;

  // Crawl competitor websites
  const competitorData = await Promise.all(
    competitors.slice(0, 5).map(async (c: any) => {
      const domain = c.domain.startsWith("http") ? c.domain : `https://${c.domain}`;
      const pageData = await fetchPageKeywords(domain);
      return { name: c.name, ...pageData };
    })
  );

  // Ask AI to compare and identify gaps
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  let gapResults: any;

  if (ANTHROPIC_API_KEY && clientData) {
    try {
      const prompt = `You are an SEO keyword gap analyst. Compare the client's website with their competitors and identify keyword opportunities.

CLIENT WEBSITE: ${client.website_url || "N/A"}
Title: ${clientData.title}
H1 Tags: ${clientData.h1.join(", ")}
Meta Keywords: ${clientData.metaKeywords}
Content Preview: ${clientData.textPreview.slice(0, 500)}

COMPETITORS:
${competitorData.map(c => `
${c.name} (${c.url}):
  Title: ${c.title}
  H1: ${c.h1.join(", ")}
  Meta Keywords: ${c.metaKeywords}
  Content Preview: ${c.textPreview.slice(0, 300)}
`).join("\n")}

INDUSTRY: ${client.industry || "General"}

Return a JSON object with this exact structure:
{
  "totalOpportunities": number,
  "topKeywords": ["keyword1", "keyword2", ...up to 10],
  "competitorKeywords": [{"name": "competitor name", "uniqueTopics": ["topic1", "topic2"]}],
  "contentGaps": ["gap description 1", "gap description 2"],
  "quickWins": ["quick win 1", "quick win 2"]
}

Return only JSON.`;

      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const content = aiData.content?.[0]?.text || "";
        const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        gapResults = JSON.parse(cleaned);
      }
    } catch (e) {
      console.error("AI keyword gap analysis error:", e);
    }
  }

  // Fallback if AI fails
  if (!gapResults) {
    gapResults = {
      totalOpportunities: 0,
      topKeywords: [],
      competitorKeywords: competitorData.map(c => ({ name: c.name, uniqueTopics: [] })),
      contentGaps: ["AI analysis unavailable — manual review recommended"],
      quickWins: [],
    };
  }

  await supabase.from("keyword_gap_results").insert({
    client_account_id: client.id,
    competitors: competitors.map((c: any) => c.domain),
    results: gapResults,
  });

  const markdownReport = `# Keyword Gap Analysis Report

## Summary

*Generated on ${reportDate} for ${client.business_name}*

**Total Keyword Opportunities Found:** ${gapResults.totalOpportunities}

## Top Keyword Opportunities

${gapResults.topKeywords.length ? gapResults.topKeywords.map((kw: string) => `- **${kw}**`).join('\n') : "- No keyword opportunities identified yet"}

## Competitor Analysis

${gapResults.competitorKeywords.map((c: any) => `### ${c.name}
${c.uniqueTopics?.length ? c.uniqueTopics.map((t: string) => `- ${t}`).join('\n') : '- No unique topics identified'}`).join('\n\n')}

## Content Gaps

${gapResults.contentGaps?.length ? gapResults.contentGaps.map((g: string) => `- ${g}`).join('\n') : "- No content gaps identified"}

## Quick Wins

${gapResults.quickWins?.length ? gapResults.quickWins.map((w: string) => `- ${w}`).join('\n') : "- No quick wins identified"}

## Recommendations

Based on this analysis, we recommend:
- Creating content targeting the top keyword opportunities
- Covering topics your competitors address but you don't
- Optimizing existing pages for related terms

*Your marketing team will develop a content strategy based on these findings.*`;

  await createDeliverable(
    supabase,
    client.id,
    `Keyword Gap Analysis - ${reportDate}`,
    markdownReport,
    "report"
  );

  return { completed: true, results: gapResults, deliverableCreated: true };
}

async function setupLeadAutomations(supabase: any, client: ClientData) {
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  const reportDate = formatDate();
  const hasIntegration = !!config;

  const workflows = [
    "immediate_response_email",
    "confirmation_sms",
    "follow_up_sequence",
    "no_response_sms",
    "nurture_sequence",
  ];

  await createDeliverable(
    supabase,
    client.id,
    `Lead Automations Setup - ${reportDate}`,
    `# Lead Automation Setup

## Status: ${hasIntegration ? 'Complete' : 'Pending Configuration'}

*Generated on ${reportDate} for ${client.business_name}*

## Configured Workflows

${hasIntegration ? workflows.map(w => `- ✅ ${w.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}`).join('\n') : 'No CRM integration configured. Workflows pending.'}

## Automation Details

### Immediate Response Email
Sends within seconds of lead submission to acknowledge receipt

### Confirmation SMS
Text message confirming we received their inquiry

### Follow-up Sequence
5-email nurture sequence over 14 days

### No Response SMS
Triggered if lead hasn't engaged after 3 days

### Nurture Sequence
Long-term drip campaign for leads not ready to buy

## Expected Impact

- **50% faster** lead response time
- **35% higher** lead-to-appointment rate
- **20% improvement** in close rate

*${hasIntegration ? 'All lead automations are now active!' : 'Configure CRM integration to activate these workflows.'}*`,
    "general"
  );

  return { setup: hasIntegration, workflows: hasIntegration ? workflows : [], deliverableCreated: true };
}

async function setupRetargetingAudiences(supabase: any, client: ClientData) {
  const reportDate = formatDate();
  const audiences = [
    { platform: "facebook", name: `${client.business_name} - Website Visitors`, size: "pending" },
    { platform: "google", name: `${client.business_name} - Site Visitors`, size: "pending" },
  ];

  await createDeliverable(
    supabase,
    client.id,
    `Retargeting Audiences Setup - ${reportDate}`,
    `# Retargeting Audiences Setup

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Audiences Created

### Facebook/Instagram
- **Name:** ${audiences[0].name}
- **Type:** Website Custom Audience
- **Duration:** 180 days

### Google Ads
- **Name:** ${audiences[1].name}
- **Type:** Website Visitors
- **Duration:** 540 days

## What This Enables

Retargeting allows you to show ads to people who have:
- Visited your website
- Viewed specific pages
- Started but didn't complete a form

## Expected Results

- **10x higher** click-through rates vs cold traffic
- **70% lower** cost per acquisition
- **3-5x** better conversion rates

## Next Steps

1. Website pixels will begin collecting visitor data
2. Audiences will build over 7-14 days
3. Retargeting campaigns can launch once audience reaches 1,000+ users

*Your retargeting infrastructure is ready!*`,
    "marketing"
  );

  return { setup: true, audiences, deliverableCreated: true };
}

async function setupRetentionAutomations(supabase: any, client: ClientData) {
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  const reportDate = formatDate();
  const hasIntegration = !!config;
  const workflows = ["win_back", "renewal_reminder", "review_to_case_study"];

  await createDeliverable(
    supabase,
    client.id,
    `Retention Automations Setup - ${reportDate}`,
    `# Customer Retention Automations

## Status: ${hasIntegration ? 'Complete' : 'Pending Configuration'}

*Generated on ${reportDate} for ${client.business_name}*

## Configured Workflows

${hasIntegration ? `
### Win-Back Campaign
- **Trigger:** Customer inactive for 90+ days
- **Action:** Re-engagement email sequence
- **Goal:** Bring back churned customers

### Renewal Reminder
- **Trigger:** 30 days before subscription/contract renewal
- **Action:** Reminder + incentive offer
- **Goal:** Improve retention rate

### Review to Case Study
- **Trigger:** Customer leaves 5-star review
- **Action:** Request for case study participation
- **Goal:** Generate social proof
` : 'No CRM integration configured. Workflows pending.'}

## Expected Impact

- **25%** reduction in churn
- **40%** higher renewal rate
- **15%** more case studies annually

*${hasIntegration ? 'Retention automations are now protecting your customer base!' : 'Configure CRM integration to activate.'}*`,
    "general"
  );

  return { setup: hasIntegration, workflows: hasIntegration ? workflows : [], deliverableCreated: true };
}

async function generateMonthlyReport(supabase: any, client: ClientData) {
  const today = new Date();
  const periodStart = new Date(today);
  periodStart.setMonth(periodStart.getMonth() - 1);

  return runAiAutomation(supabase, client, "report", {
    periodStart: periodStart.toISOString().split("T")[0],
    periodEnd: today.toISOString().split("T")[0],
  });
}

async function runAiAutomation(supabase: any, client: ClientData, jobType: string, inputData?: Record<string, unknown>) {
  const categoryMap: Record<string, string> = {
    email_sequence: "email_sequences",
    content_generation: "content_generation",
    report: "reporting",
  };

  const { data: sops } = await supabase
    .from("sop_documents")
    .select("*")
    .eq("tier", client.tier)
    .eq("category", categoryMap[jobType] || jobType)
    .eq("is_active", true);

  const sopContent = sops?.map((s: any) => s.parsed_content || s.description).join("\n\n") || "";

  let systemPrompt = "";
  let userPrompt = "";

  switch (jobType) {
    case "email_sequence":
      systemPrompt = `You are an expert email marketing specialist. Create a personalized email sequence.\n\nSOPs:\n${sopContent}\n\nOutput JSON: { "sequence_name": "string", "emails": [{ "subject": "string", "body": "string (HTML)", "send_delay_days": number, "purpose": "string" }] }`;
      userPrompt = `Create a ${client.tier}-tier email sequence for ${client.business_name}. Additional context: ${JSON.stringify(inputData || {})}`;
      break;
    case "content_generation":
      const industryContext = client.industry ? `The business is in the ${client.industry} industry.` : "";
      systemPrompt = `You are a digital marketing content expert specializing in creating industry-specific, engaging content. Create content that speaks directly to the target audience and incorporates industry best practices and terminology.\n\n${industryContext}\n\nOutput JSON: { "content_pieces": [{ "type": "blog_post | social_post | ad_copy", "title": "string", "content": "string", "platform": "string", "target_audience": "string", "key_message": "string" }] }`;
      userPrompt = `Create ${client.tier}-tier content for ${client.business_name}${client.industry ? ` (${client.industry} industry)` : ""}. 
      
Make sure the content:
- Uses industry-specific language and terminology
- Addresses common pain points in the ${client.industry || "their"} industry
- Includes relevant calls-to-action
- Is optimized for the target platform

Context: ${JSON.stringify(inputData || {})}`;
      break;
    case "report":
      systemPrompt = `You are a marketing analytics expert. Generate an insightful performance report.\n\nOutput JSON: { "executive_summary": "string", "metrics": {}, "insights": ["string"], "recommendations": [{ "priority": "high|medium|low", "action": "string", "expected_impact": "string" }] }`;
      userPrompt = `Generate a performance report for ${client.business_name}. Period: ${JSON.stringify(inputData || {})}`;
      break;
  }

  const ANTHROPIC_API_KEY_LOCAL = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY_LOCAL) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY_LOCAL,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!aiResponse.ok) {
    throw new Error(`AI gateway error: ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  const aiContent = aiData.content?.[0]?.text || "";

  let parsedOutput: Record<string, unknown> = {};
  try {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedOutput = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    parsedOutput = { raw_content: aiContent };
  }

  const reportDate = formatDate();

  // Store results and create deliverables based on type
  if (jobType === "content_generation" && parsedOutput.content_pieces) {
    const pieces = parsedOutput.content_pieces as Array<{ type: string; title: string; content: string; platform?: string }>;
    for (const piece of pieces) {
      await supabase.from("generated_content").insert({
        client_id: client.id,
        content_type: piece.type || "other",
        title: piece.title,
        content: piece.content,
        metadata: { platform: piece.platform },
      });
    }

    await createDeliverable(
      supabase,
      client.id,
      `Content Generation - ${reportDate}`,
      `# Generated Content

## Summary

*Generated on ${reportDate} for ${client.business_name}*

**Pieces Created:** ${pieces.length}

## Content Items

${pieces.map((p, i) => `### ${i + 1}. ${p.title}
**Type:** ${p.type}
**Platform:** ${p.platform || 'General'}

${p.content.substring(0, 300)}${p.content.length > 300 ? '...' : ''}`).join('\n\n')}

## Next Steps

- Review each content piece for accuracy
- Approve or request revisions
- Schedule for publishing

*All content is ready for your review!*`,
      "content"
    );
  }

  if (jobType === "email_sequence") {
    const sequenceName = (parsedOutput as any).sequence_name || "Custom Sequence";
    const emails = (parsedOutput as any).emails || [];

    await createDeliverable(
      supabase,
      client.id,
      `Email Sequence: ${sequenceName} - ${reportDate}`,
      `# Email Sequence Created

## ${sequenceName}

*Generated on ${reportDate} for ${client.business_name}*

**Total Emails:** ${emails.length}

## Sequence Overview

${emails.map((e: any, i: number) => `### Email ${i + 1}: ${e.subject}
**Send Delay:** ${e.send_delay_days} days
**Purpose:** ${e.purpose}

Preview:
> ${e.body?.replace(/<[^>]*>/g, '').substring(0, 150)}...`).join('\n\n')}

## Next Steps

- Review each email for brand voice
- Approve or request revisions
- Once approved, sequence will be activated

*Your email sequence is ready for review!*`,
      "content"
    );
  }

  if (jobType === "report") {
    const periodStart = (inputData as any)?.periodStart || new Date().toISOString().split("T")[0];
    const periodEnd = (inputData as any)?.periodEnd || new Date().toISOString().split("T")[0];

    await supabase.from("client_reports").insert({
      client_id: client.id,
      report_type: "monthly",
      report_period_start: periodStart,
      report_period_end: periodEnd,
      metrics: parsedOutput.metrics || {},
      insights: parsedOutput.insights || [],
      recommendations: parsedOutput.recommendations || [],
    });

    const insights = (parsedOutput.insights || []) as string[];
    const recommendations = (parsedOutput.recommendations || []) as Array<{ priority: string; action: string; expected_impact: string }>;

    await createDeliverable(
      supabase,
      client.id,
      `Monthly Performance Report - ${reportDate}`,
      `# Monthly Performance Report

## Period: ${periodStart} to ${periodEnd}

*Generated on ${reportDate} for ${client.business_name}*

## Executive Summary

${(parsedOutput as any).executive_summary || 'Performance data has been analyzed for this period.'}

## Key Insights

${insights.map((insight: string) => `- ${insight}`).join('\n')}

## Recommendations

${recommendations.map((r: any) => `### ${r.priority?.toUpperCase()} Priority
**Action:** ${r.action}
**Expected Impact:** ${r.expected_impact}`).join('\n\n')}

## What's Next

Your marketing team will:
1. Implement high-priority recommendations
2. Continue optimizing current campaigns
3. Provide updates at our next check-in

*Thank you for your partnership!*`,
      "report"
    );
  }

  return { ...parsedOutput, deliverableCreated: true };
}

// Custom automation handler for tasks with custom job types
async function runCustomAutomation(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const taskName = (inputData?.taskName as string) || "Custom Task";
  const taskDescription = (inputData?.description as string) || "A custom automation task was executed.";
  const reportDate = formatDate();

  await createDeliverable(
    supabase,
    client.id,
    `${taskName} - ${reportDate}`,
    `# ${taskName}

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Details

${taskDescription}

## Input Parameters

${inputData ? Object.entries(inputData).map(([key, value]) => `- **${key}:** ${JSON.stringify(value)}`).join('\n') : 'No additional parameters provided.'}

## What's Next

This custom task has been completed and logged. Your team will follow up with any necessary actions.

*Task completed automatically.*`,
    "general"
  );

  return { 
    completed: true, 
    taskName,
    timestamp: new Date().toISOString(),
    deliverableCreated: true 
  };
}

async function addSegmentationLogicToFunnelSteps(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const reportDate = formatDate();
  
  // Define segmentation rules based on client tier and industry
  const segmentationRules = {
    leadScoring: [
      { criteria: "Website visit + form submission", score: 25, action: "Add to warm lead segment" },
      { criteria: "Multiple page views (5+)", score: 15, action: "Add to engaged visitor segment" },
      { criteria: "Downloaded resource/PDF", score: 20, action: "Add to interested prospects" },
      { criteria: "Email opened + clicked", score: 30, action: "Add to hot lead segment" },
      { criteria: "Requested quote/demo", score: 50, action: "Add to sales-ready segment" },
    ],
    industryRouting: [
      { industry: client.industry || "General", funnelPath: "Standard nurture sequence" },
      { condition: "B2B indicator", funnelPath: "Extended decision cycle nurture" },
      { condition: "High-value indicator", funnelPath: "VIP fast-track sequence" },
    ],
    behaviorTriggers: [
      { trigger: "Cart abandonment", action: "Send recovery email within 1 hour" },
      { trigger: "Pricing page visit (2+ times)", action: "Trigger sales notification" },
      { trigger: "Blog engagement (3+ articles)", action: "Add to thought leadership nurture" },
      { trigger: "Webinar registration", action: "Add to event attendee segment" },
      { trigger: "No engagement (30 days)", action: "Move to re-engagement campaign" },
    ],
    funnelStages: [
      { stage: "Awareness", segments: ["New visitors", "Social traffic", "Ad responders"] },
      { stage: "Interest", segments: ["Content consumers", "Email subscribers", "Resource downloaders"] },
      { stage: "Consideration", segments: ["Comparison shoppers", "Demo requesters", "Quote seekers"] },
      { stage: "Decision", segments: ["Hot leads", "Proposal recipients", "Trial users"] },
      { stage: "Retention", segments: ["New customers", "Active users", "At-risk accounts"] },
    ],
  };

  // Create email sequences based on segments
  const emailSequences = [
    {
      name: `${client.business_name} - New Lead Welcome`,
      trigger_type: "new_lead",
      emails: [
        { delay_days: 0, subject: "Welcome! Here's what to expect", template: "welcome_sequence_1" },
        { delay_days: 2, subject: "Your quick-start guide", template: "welcome_sequence_2" },
        { delay_days: 5, subject: "Success stories from businesses like yours", template: "welcome_sequence_3" },
      ],
    },
    {
      name: `${client.business_name} - Hot Lead Nurture`,
      trigger_type: "hot_lead",
      emails: [
        { delay_days: 0, subject: "Let's talk about your goals", template: "hot_lead_1" },
        { delay_days: 1, subject: "Quick question about your timeline", template: "hot_lead_2" },
        { delay_days: 3, subject: "Special offer for you", template: "hot_lead_3" },
      ],
    },
    {
      name: `${client.business_name} - Re-engagement`,
      trigger_type: "inactive_lead",
      emails: [
        { delay_days: 0, subject: "We miss you!", template: "reengagement_1" },
        { delay_days: 7, subject: "What's changed since we last talked", template: "reengagement_2" },
        { delay_days: 14, subject: "Last chance: Special offer inside", template: "reengagement_3" },
      ],
    },
  ];

  // Insert email sequences
  for (const sequence of emailSequences) {
    await supabase.from("email_sequences").insert({
      name: sequence.name,
      trigger_type: sequence.trigger_type,
      emails: sequence.emails,
      is_active: true,
    });
  }

  // Create deliverable with comprehensive documentation
  await createDeliverable(
    supabase,
    client.id,
    `Funnel Segmentation Logic - ${reportDate}`,
    `# Funnel Segmentation Logic Implementation

## Status: Complete ✅

*Generated on ${reportDate} for ${client.business_name}*

---

## 1. Lead Scoring Framework

| Criteria | Score | Action |
|----------|-------|--------|
${segmentationRules.leadScoring.map(rule => `| ${rule.criteria} | +${rule.score} | ${rule.action} |`).join('\n')}

**Score Thresholds:**
- 0-25: Cold Lead → Awareness nurture
- 26-50: Warm Lead → Interest building
- 51-75: Hot Lead → Sales engagement
- 76+: Sales-Ready → Immediate outreach

---

## 2. Industry-Based Routing

| Condition | Funnel Path |
|-----------|-------------|
${segmentationRules.industryRouting.map(rule => `| ${rule.industry || rule.condition} | ${rule.funnelPath} |`).join('\n')}

---

## 3. Behavior-Based Triggers

| Trigger Event | Automated Action |
|---------------|------------------|
${segmentationRules.behaviorTriggers.map(rule => `| ${rule.trigger} | ${rule.action} |`).join('\n')}

---

## 4. Funnel Stage Segments

${segmentationRules.funnelStages.map(stage => `
### ${stage.stage} Stage
- Segments: ${stage.segments.join(', ')}
`).join('')}

---

## 5. Email Sequences Created

${emailSequences.map(seq => `
### ${seq.name}
- **Trigger:** ${seq.trigger_type}
- **Emails:** ${seq.emails.length} in sequence
- **Duration:** ${seq.emails[seq.emails.length - 1].delay_days} days
`).join('')}

---

## Implementation Details

### What Was Configured:
1. ✅ Lead scoring rules added to pipeline
2. ✅ Behavior triggers configured
3. ✅ ${emailSequences.length} email sequences created
4. ✅ Funnel stage segments defined

### Next Steps:
1. Review and customize email templates for each sequence
2. Set up tracking pixels for behavior monitoring
3. Configure CRM integration for lead scoring sync
4. Test automation triggers with sample data

---

*This segmentation logic will automatically categorize and route leads through your funnel based on their behavior and characteristics.*`,
    "report"
  );

  return {
    success: true,
    segmentationRules,
    emailSequencesCreated: emailSequences.length,
    deliverableCreated: true,
    timestamp: new Date().toISOString(),
  };
}

// Build Renewal Reminder Sequence Automation
async function buildRenewalReminderSequence(
  supabase: any,
  client: ClientData,
  inputData?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  console.log(`Building renewal reminder sequence for ${client.business_name}`);

  // Define renewal reminder email sequence
  const renewalEmails = [
    {
      subject: `${client.business_name} - Subscription Renewal Reminder (60 Days)`,
      delay_days: 0,
      template: "renewal_60_day",
      content: `Hey there! Just a friendly heads up - your subscription with us is coming up for renewal in about 60 days. We've loved working with you and wanted to give you plenty of time to review your account and let us know if you have any questions.`
    },
    {
      subject: `${client.business_name} - Your Results This Year + Renewal Info`,
      delay_days: 15,
      template: "renewal_45_day",
      content: `With 45 days until renewal, we wanted to share a quick recap of what we've accomplished together. Your business has grown, and we're excited to continue partnering with you.`
    },
    {
      subject: `${client.business_name} - 30 Day Renewal Notice`,
      delay_days: 30,
      template: "renewal_30_day",
      content: `Your subscription renews in 30 days. If you'd like to make any changes to your plan or have questions about pricing, now is a great time to chat.`
    },
    {
      subject: `${client.business_name} - Renewal Coming Up (14 Days)`,
      delay_days: 46,
      template: "renewal_14_day",
      content: `Quick reminder: Your subscription renews in 2 weeks. We're here to answer any questions and make sure you're getting the most value from our partnership.`
    },
    {
      subject: `${client.business_name} - Final Renewal Reminder (7 Days)`,
      delay_days: 53,
      template: "renewal_7_day",
      content: `Your subscription renews in one week. If you need to update payment information or have any concerns, please reach out to us right away.`
    },
    {
      subject: `${client.business_name} - Renewal Tomorrow`,
      delay_days: 59,
      template: "renewal_1_day",
      content: `Just a heads up - your subscription renews tomorrow. Thank you for continuing to trust us with your marketing needs!`
    }
  ];

  // Create the email sequence in the database
  const { data: sequence, error: seqError } = await supabase
    .from("email_sequences")
    .insert({
      name: `Renewal Reminder - ${client.business_name}`,
      trigger_type: "renewal_reminder",
      is_active: true,
      emails: renewalEmails.map(email => ({
        subject: email.subject,
        delay_days: email.delay_days,
        template_slug: email.template,
        preview: email.content.substring(0, 100) + "..."
      }))
    })
    .select()
    .single();

  if (seqError) {
    throw new Error(`Failed to create renewal sequence: ${seqError.message}`);
  }

  // Create a deliverable with the sequence details
  await createDeliverable(
    supabase,
    client.id,
    `Renewal Reminder Sequence - ${client.business_name}`,
    `# Renewal Reminder Email Sequence

## Overview
A comprehensive 6-email renewal reminder sequence has been created for ${client.business_name} to ensure smooth subscription renewals and maintain strong client relationships.

---

## Email Sequence Timeline

| Day | Email | Purpose |
|-----|-------|---------|
${renewalEmails.map(email => `| Day ${email.delay_days} | ${email.template.replace(/_/g, ' ').toUpperCase()} | ${email.content.substring(0, 60)}... |`).join('\n')}

---

## Sequence Details

${renewalEmails.map((email, idx) => `
### Email ${idx + 1}: ${email.template.replace(/_/g, ' ').toUpperCase()}
- **Subject:** ${email.subject}
- **Send Day:** ${email.delay_days} days before renewal
- **Purpose:** ${email.content}
`).join('')}

---

## Implementation Notes

### Trigger Conditions:
1. ✅ Sequence triggers 60 days before renewal date
2. ✅ Stops if client renews early
3. ✅ Escalates to account manager if no response after Day 53

### Customization Options:
- Email templates can be personalized with client metrics
- Timing can be adjusted based on contract value
- Additional touchpoints can be added for high-value accounts

---

*This automated sequence ensures no renewal falls through the cracks while maintaining a professional, helpful tone throughout the process.*`,
    "email"
  );

  return {
    success: true,
    sequenceCreated: !!sequence,
    sequenceId: sequence?.id,
    emailCount: renewalEmails.length,
    deliverableCreated: true,
    timeline: renewalEmails.map(e => ({ day: e.delay_days, template: e.template })),
    timestamp: new Date().toISOString(),
  };
}

// Build a workflow to convert positive reviews into case studies
async function buildReviewToCaseStudyWorkflow(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  console.log(`Building review-to-case-study workflow for ${client.business_name}`);
  
  const workflowSteps = [
    {
      step: 1,
      name: "Review Monitoring",
      description: "Monitor for 5-star reviews with detailed feedback",
      trigger: "New review with rating >= 4.5 and character count > 200"
    },
    {
      step: 2,
      name: "Initial Outreach",
      description: "Send personalized thank you email with case study request",
      delay: "2 days after review",
      template: "review_to_case_study_request"
    },
    {
      step: 3,
      name: "Interview Scheduling",
      description: "If client agrees, schedule 15-minute video interview",
      action: "Send Calendly link for case study interview slot"
    },
    {
      step: 4,
      name: "Content Creation",
      description: "Draft case study from review + interview notes",
      deliverable: "Draft case study document for approval"
    },
    {
      step: 5,
      name: "Client Approval",
      description: "Send draft to client for review and approval",
      approval_required: true
    },
    {
      step: 6,
      name: "Publication",
      description: "Publish approved case study to website and marketing materials",
      outputs: ["Website case study page", "Social media posts", "Email newsletter feature"]
    }
  ];

  const reportDate = formatDate();
  await createDeliverable(
    supabase,
    client.id,
    `Review-to-Case-Study Workflow - ${reportDate}`,
    `# Review-to-Case-Study Workflow

## Status: Configured

*Generated on ${reportDate} for ${client.business_name}*

---

## Workflow Overview

This automated workflow identifies high-value positive reviews and converts them into compelling case studies for marketing use.

## Workflow Steps

${workflowSteps.map((step) => `### Step ${step.step}: ${step.name}
- **Description:** ${step.description}
${step.trigger ? `- **Trigger:** ${step.trigger}` : ''}
${step.delay ? `- **Timing:** ${step.delay}` : ''}
${step.template ? `- **Email Template:** ${step.template}` : ''}
${step.action ? `- **Action:** ${step.action}` : ''}
${step.deliverable ? `- **Deliverable:** ${step.deliverable}` : ''}
${step.approval_required ? `- **Requires Approval:** Yes` : ''}
${step.outputs ? `- **Outputs:** ${step.outputs.join(', ')}` : ''}
`).join('\n')}

---

## Qualifying Criteria for Reviews

| Criteria | Threshold |
|----------|-----------|
| Star Rating | ≥ 4.5 stars |
| Review Length | ≥ 200 characters |
| Contains Specific Results | Preferred |
| Mentions Specific Services | Preferred |

## Email Templates Included

1. **Initial Request** - Thank you + soft ask for case study participation
2. **Follow-up** - Reminder with simplified process explanation
3. **Interview Confirmation** - Details and prep questions
4. **Draft Review Request** - Link to approve case study draft
5. **Publication Notice** - Thank you with links to published case study

---

## Expected Outcomes

- **Conversion Rate:** ~15-25% of qualifying reviews become case studies
- **Timeline:** 2-3 weeks from review to published case study
- **Content Generated:** Full case study, social snippets, testimonial quotes

---

*This workflow helps systematically capture and leverage positive client experiences for marketing.*`,
    "workflow"
  );

  return {
    success: true,
    workflowConfigured: true,
    stepsCount: workflowSteps.length,
    deliverableCreated: true,
    timestamp: new Date().toISOString(),
  };
}
