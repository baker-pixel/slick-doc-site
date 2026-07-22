import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkClientOrAdminAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 5 client-facing onboarding gates — prepended to ALL tiers
// Order rationale:
//   1. Confirm info first (we need this before anything)
//   2. Schedule kickoff immediately — creates commitment while client is engaged
//   3. Upload brand assets — they have time before the call
//   4. Connect social accounts — after kickoff call, trust is established
//   5. Approve first content — after kickoff, strategy is aligned
const ONBOARDING_STEPS = [
  {
    step_number: 1,
    step_name: "Confirm Business Information",
    task_type: "client_form",
    depends_on: null,
    payload: {
      form_type: "business_info",
      fields: ["business_name", "website_url", "phone", "address", "industry", "target_audience", "main_competitors"],
    },
  },
  {
    step_number: 2,
    step_name: "Schedule Kickoff Call",
    task_type: "client_calendar",
    depends_on: 1,
    payload: {
      calendar_url: "https://calendly.com/baker-orangedoor",
    },
  },
  {
    step_number: 3,
    step_name: "Upload Brand Assets",
    task_type: "client_upload",
    depends_on: 2,
    payload: {
      required: ["logo_primary"],
      optional: ["logo_dark", "brand_colors", "font_guidelines"],
    },
  },
  {
    step_number: 4,
    step_name: "Connect Social Accounts",
    task_type: "client_oauth",
    depends_on: 3,
    payload: {
      platforms: ["linkedin", "facebook", "instagram", "twitter"],
      minimum_required: 1,
    },
  },
  {
    step_number: 5,
    step_name: "Approve Your First Content Draft",
    task_type: "client_approval",
    depends_on: 4,
    payload: { content_type: "linkedin_post" },
  },
];

const ONBOARDING_OFFSET = ONBOARDING_STEPS.length; // 5

// Automation steps — original step_numbers start at 1 but will be offset by 5.
// No "Publish X" step here anymore (was n8n_post_social/n8n_post_blog, routed
// to trigger-n8n) -- actual publishing already happens on its own continuous
// schedule (auto-schedule-content -> content_calendar -> publish-scheduled-
// content), not as a one-time onboarding checklist gate, and n8n has no real
// role left in it for the platforms this covers (see git history for the
// removal). Step numbers are intentionally left with gaps rather than
// renumbered, since depends_on references specific step_numbers.
const FOUNDATION_STEPS = [
  { step_number: 1, step_name: "Analyze current website performance", task_type: "website_analysis", depends_on: null },
  { step_number: 2, step_name: "Run basic SEO audit", task_type: "seo_audit", depends_on: 1 },
  { step_number: 3, step_name: "Generate marketing gap report", task_type: "gap_report", depends_on: 2 },
  { step_number: 4, step_name: "Create Google Business Profile post", task_type: "content", depends_on: 3, payload: { content_type: "gbp_post" } },
  { step_number: 6, step_name: "Write blog article", task_type: "content", depends_on: 3, payload: { content_type: "blog" } },
  { step_number: 8, step_name: "Generate quarterly SEO report", task_type: "report", depends_on: 6 },
];

const GROWTH_EXTRA = [
  { step_number: 9, step_name: "Create email nurture sequence", task_type: "email_template", depends_on: 3 },
  { step_number: 10, step_name: "Generate retargeting ad copy", task_type: "ad_copy", depends_on: 3 },
  { step_number: 11, step_name: "Create social media content batch", task_type: "social_content", depends_on: 3, payload: { content_type: "social_batch" } },
];

const TRANSFORMATION_EXTRA = [
  { step_number: 13, step_name: "Write second blog article", task_type: "content", depends_on: 8, payload: { content_type: "blog" } },
  { step_number: 15, step_name: "Create retention email sequence", task_type: "email_template", depends_on: 8, payload: { content_type: "retention" } },
  { step_number: 16, step_name: "Scrape and compile analytics report", task_type: "analytics", depends_on: 13 },
  { step_number: 17, step_name: "Generate full monthly report", task_type: "report", depends_on: 16 },
];

function renumberAutomationSteps(steps: any[]) {
  return steps.map((s) => ({
    ...s,
    step_number: s.step_number + ONBOARDING_OFFSET,
    depends_on: s.depends_on != null ? s.depends_on + ONBOARDING_OFFSET : ONBOARDING_OFFSET, // first automation step depends on last onboarding step
  }));
}

function getStepsForTier(tier: string) {
  const t = tier.toLowerCase();
  let automationSteps: any[];
  if (t === "transformation") {
    automationSteps = [...FOUNDATION_STEPS, ...GROWTH_EXTRA, ...TRANSFORMATION_EXTRA];
  } else if (t === "growth") {
    automationSteps = [...FOUNDATION_STEPS, ...GROWTH_EXTRA];
  } else {
    automationSteps = [...FOUNDATION_STEPS];
  }

  // Set initial status for onboarding steps
  const onboarding = ONBOARDING_STEPS.map((s, i) => ({
    ...s,
    status: i === 0 ? "pending" : "locked",
  }));

  return [...onboarding, ...renumberAutomationSteps(automationSteps)];
}

/** Add `businessDays` working days to `start`, skipping Sat/Sun. */
function addBusinessDays(start: Date, businessDays: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < businessDays) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let client_id: string | undefined;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    client_id = body.client_id;
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = await checkClientOrAdminAuth(req, supabase, client_id, body.password);
    if (!auth.authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client tier + website_url for brand extraction
    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("tier, website_url")
      .eq("id", client_id)
      .single();

    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing active workflow
    const { data: existing } = await supabase
      .from("client_workflows")
      .select("id")
      .eq("client_id", client_id)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Active workflow already exists", workflow_id: existing.id }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read Calendly URL from admin_settings (falls back to hardcoded default)
    const { data: calendlySetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "calendly_url")
      .maybeSingle();
    const calendlyUrl = calendlySetting?.value || "https://calendly.com/baker-orangedoor";

    const steps = getStepsForTier(client.tier);

    // Inject the live Calendly URL into the kickoff step payload
    const calendarStep = steps.find((s: any) => s.task_type === "client_calendar");
    if (calendarStep) calendarStep.payload = { ...calendarStep.payload, calendar_url: calendlyUrl };

    // Create workflow
    const { data: workflow, error: wfError } = await supabase
      .from("client_workflows")
      .insert({
        client_id,
        workflow_name: `${client.tier}_workflow`,
        current_step: 1,
        total_steps: steps.length,
        status: "active",
      })
      .select()
      .single();

    if (wfError) throw new Error(`Failed to create workflow: ${wfError.message}`);

    // Calculate estimated_completion dates
    const today = new Date();
    const estimatedDates: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      // Onboarding steps (client-driven) get 1 business day each
      const isOnboarding = s.task_type.startsWith("client_");
      const bizDays = isOnboarding ? 1 : 2;
      if (i === 0) {
        estimatedDates.push(toDateStr(addBusinessDays(today, bizDays)));
      } else {
        const prevDate = new Date(estimatedDates[i - 1] + "T00:00:00");
        const startFrom = new Date(prevDate);
        startFrom.setDate(startFrom.getDate() + 1);
        estimatedDates.push(toDateStr(addBusinessDays(startFrom, bizDays)));
      }
    }

    // Seed steps
    const rows = steps.map((s: any, i: number) => ({
      step_number: s.step_number,
      step_name: s.step_name,
      task_type: s.task_type,
      depends_on: s.depends_on,
      payload: s.payload || null,
      status: s.status || "locked",
      workflow_id: workflow.id,
      client_id,
      estimated_completion: estimatedDates[i],
    }));

    const { error: stepsError } = await supabase.from("workflow_steps").insert(rows);
    if (stepsError) throw new Error(`Failed to seed steps: ${stepsError.message}`);

    // Seed client_onboarding record so admin panels show this client immediately
    const { error: onboardingErr } = await supabase
      .from("client_onboarding")
      .insert({ client_account_id: client_id, current_step: 1 });
    // 23505 = unique violation (already exists) — safe to ignore
    if (onboardingErr && onboardingErr.code !== "23505") {
      console.error("Failed to seed client_onboarding:", onboardingErr.message);
    }

    // Fire brand extraction in background (non-blocking). Project generation is
    // no longer auto-triggered here -- bootstrap_client_projects (seeded via
    // workflowUnlock.ts at onboarding completion) owns automatic seo/social/
    // prospect shells; custom/LLM projects are admin-triggered only
    // (ProjectSetupWizard.tsx).
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const bgHeaders = {
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      "Content-Type": "application/json",
    };

    const bgTasks: Record<string, string> = {};

    if (client.website_url) {
      fetch(`${supabaseUrl}/functions/v1/extract-brand-assets`, {
        method: "POST",
        headers: bgHeaders,
        body: JSON.stringify({ client_account_id: client_id, website_url: client.website_url }),
      })
        .then((r) => { bgTasks.brand_assets = r.ok ? "queued" : `http_${r.status}`; })
        .catch((e) => {
          bgTasks.brand_assets = "failed";
          console.error("Background brand extraction failed:", e);
        });
    } else {
      bgTasks.brand_assets = "skipped_no_url";
    }

    return new Response(
      JSON.stringify({
        success: true,
        workflow_id: workflow.id,
        tier: client.tier,
        total_steps: steps.length,
        background_tasks: bgTasks,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("seed-tier-workflow error:", error);

    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "Error in seed-tier-workflow",
        message: error instanceof Error ? error.message : "Unknown error",
        source: "seed-tier-workflow",
        source_id: client_id ?? undefined,
        metadata: {
          function_name: "seed-tier-workflow",
          client_id: client_id ?? null,
          error_message: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_alertErr) {
      console.error("Failed to log alert:", _alertErr);
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
