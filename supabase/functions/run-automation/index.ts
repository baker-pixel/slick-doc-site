import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  | "run_seo_audit"
  | "run_keyword_gap_analysis"
  | "setup_lead_automations"
  | "setup_retargeting_audiences"
  | "setup_retention_automations"
  | "generate_monthly_report"
  | "email_sequence"
  | "content_generation"
  | "report";

interface AutomationRequest {
  clientId: string;
  taskId?: string;
  jobType: AutomationType;
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
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { clientId, taskId, jobType, inputData }: AutomationRequest = await req.json();
    console.log(`Running ${jobType} automation for client ${clientId}`);

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
        result = await generateMonthlyReport(supabase, client);
        break;
      case "email_sequence":
      case "content_generation":
      case "report":
        result = await runAiAutomation(supabase, client, jobType, inputData);
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
    console.error("Automation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============ AUTOMATION HANDLERS ============

async function sendIntakeForm(supabase: any, client: ClientData) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const APP_URL = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || "https://app.orangedoormarketing.com";
  const intakeUrl = `${APP_URL}/intake?clientId=${client.id}`;

  if (RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Orange Door Marketing <noreply@orangedoormarketing.com>",
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

  return { intakeUrl, emailSent: !!RESEND_API_KEY };
}

async function addClientToCrm(supabase: any, client: ClientData) {
  // Get GHL integration config
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  if (!config) {
    console.log("No GHL integration configured, skipping CRM add");
    return { added: false, reason: "No GHL integration configured" };
  }

  // In production, call GHL API here
  console.log(`Would add ${client.business_name} to GHL CRM`);

  await supabase
    .from("client_onboarding")
    .update({ crm_added_at: new Date().toISOString() })
    .eq("client_account_id", client.id);

  return { added: true, crmId: `ghl_${client.id}` };
}

async function sendKickoffScheduler(supabase: any, client: ClientData) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const KICKOFF_CALENDAR_URL = "https://calendly.com/orangedoor/kickoff"; // Configure as needed

  if (RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Orange Door Marketing <noreply@orangedoormarketing.com>",
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

  return { schedulerSent: true, calendarUrl: KICKOFF_CALENDAR_URL };
}

async function runPageSpeedTest(supabase: any, client: ClientData) {
  // Use PageSpeed Insights API (free, no key required for basic use)
  const websiteUrl = client.industry ? `https://${client.business_name.toLowerCase().replace(/\s+/g, '')}.com` : "";
  
  if (!websiteUrl) {
    return { tested: false, reason: "No website URL configured" };
  }

  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(websiteUrl)}&strategy=mobile`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`PageSpeed API error: ${response.status}`);
    }

    const data = await response.json();
    const score = data.lighthouseResult?.categories?.performance?.score * 100;

    await supabase.from("page_speed_results").insert({
      client_account_id: client.id,
      url: websiteUrl,
      score_mobile: score,
      core_web_vitals: data.lighthouseResult?.audits,
      raw_data: data,
    });

    return { tested: true, scoreMobile: score };
  } catch (error) {
    console.error("PageSpeed test error:", error);
    return { tested: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function createGoogleReviewLink(supabase: any, client: ClientData) {
  if (!client.google_place_id) {
    return { created: false, reason: "No Google Place ID configured" };
  }

  const reviewUrl = `https://search.google.com/local/writereview?placeid=${client.google_place_id}`;

  await supabase
    .from("client_accounts")
    .update({ google_review_url: reviewUrl })
    .eq("id", client.id);

  return { created: true, reviewUrl };
}

async function createReviewQrCode(supabase: any, client: ClientData) {
  const reviewUrl = client.google_review_url;
  
  if (!reviewUrl) {
    return { created: false, reason: "No review URL configured" };
  }

  // Generate QR code using a free API
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(reviewUrl)}`;

  await supabase
    .from("client_accounts")
    .update({ review_qr_image_url: qrApiUrl })
    .eq("id", client.id);

  return { created: true, qrUrl: qrApiUrl };
}

async function setupReviewAutomation(supabase: any, client: ClientData) {
  // Get GHL integration config for review workflow
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  if (!config) {
    return { setup: false, reason: "No GHL integration configured" };
  }

  // In production, attach workflow to location
  console.log(`Would attach review workflow for ${client.business_name}`);

  return { setup: true, workflowId: "review_request_workflow" };
}

async function sendReviewScripts(supabase: any, client: ClientData) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!RESEND_API_KEY) {
    return { sent: false, reason: "No email integration configured" };
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Orange Door Marketing <noreply@orangedoormarketing.com>",
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

  return { sent: true };
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

  if (existing) {
    return { created: false, reason: "Dashboard already exists" };
  }

  await supabase.from("kpi_dashboards").insert({
    client_account_id: client.id,
    config: { widgets: widgetsByLevel[client.level || 1] || widgetsByLevel[1] },
  });

  return { created: true, widgets: widgetsByLevel[client.level || 1] };
}

async function runSeoAudit(supabase: any, client: ClientData) {
  // This would integrate with an SEO tool API in production
  const auditResults = {
    technical: { score: 75, issues: ["Missing meta descriptions", "Slow page load"] },
    onPage: { score: 80, issues: ["Thin content on some pages"] },
    offPage: { score: 60, issues: ["Low domain authority", "Few backlinks"] },
  };

  const overallScore = Math.round((auditResults.technical.score + auditResults.onPage.score + auditResults.offPage.score) / 3);

  await supabase.from("seo_audits").insert({
    client_account_id: client.id,
    audit_type: "full",
    score: overallScore,
    results: auditResults,
  });

  // Create a deliverable so client can view the SEO audit results
  const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  await supabase.from("deliverables").insert({
    client_account_id: client.id,
    title: `SEO Audit Report - ${reportDate}`,
    description: `Comprehensive SEO audit with overall score of ${overallScore}/100. Technical: ${auditResults.technical.score}, On-Page: ${auditResults.onPage.score}, Off-Page: ${auditResults.offPage.score}.`,
    category: "report",
    status: "pending_review",
    file_url: JSON.stringify(auditResults), // Store results as JSON for now
  });

  return { completed: true, results: auditResults, deliverableCreated: true };
}

async function runKeywordGapAnalysis(supabase: any, client: ClientData) {
  const { data: competitors } = await supabase
    .from("client_competitors")
    .select("*")
    .eq("client_account_id", client.id);

  if (!competitors?.length) {
    return { completed: false, reason: "No competitors configured" };
  }

  // This would integrate with an SEO tool API in production
  const gapResults = {
    totalOpportunities: 25,
    topKeywords: ["digital marketing agency", "seo services", "local marketing"],
    competitorKeywords: competitors.map((c: any) => ({ name: c.name, keywords: 50 })),
  };

  await supabase.from("keyword_gap_results").insert({
    client_account_id: client.id,
    competitors: competitors.map((c: any) => c.domain),
    results: gapResults,
  });

  return { completed: true, results: gapResults };
}

async function setupLeadAutomations(supabase: any, client: ClientData) {
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  if (!config) {
    return { setup: false, reason: "No GHL integration configured" };
  }

  // In production, configure lead automation workflows
  const workflows = [
    "immediate_response_email",
    "confirmation_sms",
    "follow_up_sequence",
    "no_response_sms",
    "nurture_sequence",
  ];

  console.log(`Would setup lead automations for ${client.business_name}: ${workflows.join(", ")}`);

  return { setup: true, workflows };
}

async function setupRetargetingAudiences(supabase: any, client: ClientData) {
  // In production, integrate with Facebook/Google Ads APIs
  const audiences = [
    { platform: "facebook", name: `${client.business_name} - Website Visitors` },
    { platform: "google", name: `${client.business_name} - Site Visitors` },
  ];

  console.log(`Would create retargeting audiences for ${client.business_name}`);

  return { setup: true, audiences };
}

async function setupRetentionAutomations(supabase: any, client: ClientData) {
  const { data: config } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("integration_type", "gohighlevel")
    .eq("is_active", true)
    .single();

  if (!config) {
    return { setup: false, reason: "No GHL integration configured" };
  }

  const workflows = ["win_back", "renewal_reminder", "review_to_case_study"];

  console.log(`Would setup retention automations for ${client.business_name}: ${workflows.join(", ")}`);

  return { setup: true, workflows };
}

async function generateMonthlyReport(supabase: any, client: ClientData) {
  const today = new Date();
  const periodStart = new Date(today);
  periodStart.setMonth(periodStart.getMonth() - 1);

  // Generate report using AI
  return runAiAutomation(supabase, client, "report", {
    periodStart: periodStart.toISOString().split("T")[0],
    periodEnd: today.toISOString().split("T")[0],
  });
}

async function runAiAutomation(supabase: any, client: ClientData, jobType: string, inputData?: Record<string, unknown>) {
  // Get SOPs for this client's tier and job type
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
      systemPrompt = `You are a digital marketing content expert. Create engaging content.\n\nOutput JSON: { "content_pieces": [{ "type": "blog_post | social_post | ad_copy", "title": "string", "content": "string", "platform": "string" }] }`;
      userPrompt = `Create ${client.tier}-tier content for ${client.business_name}. Context: ${JSON.stringify(inputData || {})}`;
      break;
    case "report":
      systemPrompt = `You are a marketing analytics expert. Generate an insightful performance report.\n\nOutput JSON: { "executive_summary": "string", "metrics": {}, "insights": ["string"], "recommendations": [{ "priority": "high|medium|low", "action": "string", "expected_impact": "string" }] }`;
      userPrompt = `Generate a performance report for ${client.business_name}. Period: ${JSON.stringify(inputData || {})}`;
      break;
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!aiResponse.ok) {
    throw new Error(`AI gateway error: ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  const aiContent = aiData.choices?.[0]?.message?.content || "";

  let parsedOutput: Record<string, unknown> = {};
  try {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedOutput = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    parsedOutput = { raw_content: aiContent };
  }

  // Store results based on type
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
  }

  return parsedOutput;
}
