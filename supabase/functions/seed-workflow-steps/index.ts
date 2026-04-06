import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOUNDATION_STEPS = [
  { step_number: 1,  step_name: "Website analysis",          task_type: "website_analysis", depends_on: null },
  { step_number: 2,  step_name: "SEO audit",                 task_type: "seo_audit",        depends_on: 1 },
  { step_number: 3,  step_name: "Gap report",                task_type: "gap_report",       depends_on: 2 },
  { step_number: 4,  step_name: "Keyword strategy",          task_type: "seo_audit",        depends_on: 3 },
  { step_number: 5,  step_name: "Homepage content",          task_type: "content",          depends_on: 3 },
  { step_number: 6,  step_name: "Google post batch",         task_type: "social_content",   depends_on: 5 },
  { step_number: 7,  step_name: "Email welcome sequence",    task_type: "email_template",   depends_on: 5 },
  { step_number: 8,  step_name: "Publish Google posts",      task_type: "n8n_post_social",  depends_on: 6 },
  { step_number: 9,  step_name: "Send welcome email",        task_type: "email_campaign",   depends_on: 7 },
  { step_number: 10, step_name: "Analytics + report",        task_type: "analytics",        depends_on: 9 },
];

const GROWTH_STEPS = [
  { step_number: 1,  step_name: "Website analysis",              task_type: "website_analysis", depends_on: null },
  { step_number: 2,  step_name: "SEO audit",                     task_type: "seo_audit",        depends_on: 1 },
  { step_number: 3,  step_name: "Gap report",                    task_type: "gap_report",       depends_on: 2 },
  { step_number: 4,  step_name: "Keyword strategy",              task_type: "seo_audit",        depends_on: 3 },
  { step_number: 5,  step_name: "Homepage content",              task_type: "content",          depends_on: 3 },
  { step_number: 6,  step_name: "Google post batch",             task_type: "social_content",   depends_on: 5 },
  { step_number: 7,  step_name: "Social post batch",             task_type: "social_content",   depends_on: 5 },
  { step_number: 8,  step_name: "Email welcome sequence",        task_type: "email_template",   depends_on: 5 },
  { step_number: 9,  step_name: "Email newsletter 1",            task_type: "email_template",   depends_on: 8 },
  { step_number: 10, step_name: "Ad copy draft",                 task_type: "ad_copy",          depends_on: 5 },
  { step_number: 11, step_name: "Publish Google + social posts",  task_type: "n8n_post_social",  depends_on: 7 },
  { step_number: 12, step_name: "Send welcome + newsletter",     task_type: "email_campaign",   depends_on: 9 },
  { step_number: 13, step_name: "Analytics snapshot",            task_type: "analytics",        depends_on: 12 },
  { step_number: 14, step_name: "Monthly report",               task_type: "report",           depends_on: 13 },
];

const TRANSFORMATION_STEPS = [
  { step_number: 1,  step_name: "Website analysis",              task_type: "website_analysis", depends_on: null },
  { step_number: 2,  step_name: "SEO audit",                     task_type: "seo_audit",        depends_on: 1 },
  { step_number: 3,  step_name: "Gap report",                    task_type: "gap_report",       depends_on: 2 },
  { step_number: 4,  step_name: "Keyword strategy",              task_type: "seo_audit",        depends_on: 3 },
  { step_number: 5,  step_name: "Homepage content",              task_type: "content",          depends_on: 3 },
  { step_number: 6,  step_name: "Blog post 1",                   task_type: "content",          depends_on: 5 },
  { step_number: 7,  step_name: "Blog post 2",                   task_type: "content",          depends_on: 6 },
  { step_number: 8,  step_name: "Google post batch",             task_type: "social_content",   depends_on: 5 },
  { step_number: 9,  step_name: "Social post batch",             task_type: "social_content",   depends_on: 5 },
  { step_number: 10, step_name: "Email welcome sequence",        task_type: "email_template",   depends_on: 5 },
  { step_number: 11, step_name: "Email newsletter 1",            task_type: "email_template",   depends_on: 10 },
  { step_number: 12, step_name: "Ad copy draft",                 task_type: "ad_copy",          depends_on: 5 },
  { step_number: 13, step_name: "Publish blog 1",                task_type: "n8n_post_blog",    depends_on: 6 },
  { step_number: 14, step_name: "Publish blog 2",                task_type: "n8n_post_blog",    depends_on: 7 },
  { step_number: 15, step_name: "Publish Google + social",       task_type: "n8n_post_social",  depends_on: 9 },
  { step_number: 16, step_name: "Send welcome + newsletter",     task_type: "email_campaign",   depends_on: 11 },
  { step_number: 17, step_name: "Analytics + monthly report",    task_type: "analytics",        depends_on: 16 },
];

function getStepsForTier(tier: string) {
  switch (tier) {
    case "growth":
      return GROWTH_STEPS;
    case "transformation":
      return TRANSFORMATION_STEPS;
    default:
      return FOUNDATION_STEPS;
  }
}

/** Add N business days to a date (skips weekends) */
function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) {
      added++;
    }
  }
  return result;
}

function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Calculate estimated_completion for each step based on sequential dependencies */
function calculateEstimatedDates(
  steps: Array<{ step_number: number; task_type: string; depends_on: number | null }>,
  startDate: Date
): Map<number, string> {
  const estimates = new Map<number, Date>();

  for (const step of steps) {
    const isN8n = step.task_type?.includes("n8n");
    const duration = isN8n ? 3 : 2;

    let stepStart: Date;
    if (step.depends_on && estimates.has(step.depends_on)) {
      // Start day after dependency completes
      stepStart = new Date(estimates.get(step.depends_on)!);
      stepStart.setDate(stepStart.getDate() + 1);
      // Skip to next business day if on weekend
      while (stepStart.getDay() === 0 || stepStart.getDay() === 6) {
        stepStart.setDate(stepStart.getDate() + 1);
      }
    } else {
      stepStart = new Date(startDate);
    }

    estimates.set(step.step_number, addBusinessDays(stepStart, duration));
  }

  const result = new Map<number, string>();
  for (const [num, date] of estimates) {
    result.set(num, toDateString(date));
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { client_id } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if active workflow already exists
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

    // Fetch plan_tier from client_accounts
    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("plan_tier")
      .eq("id", client_id)
      .single();

    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const planTier = client.plan_tier || "foundation";
    const steps = getStepsForTier(planTier);

    // Create workflow record
    const { data: workflow, error: wfError } = await supabase
      .from("client_workflows")
      .insert({
        client_id,
        workflow_name: `system_${planTier}`,
        current_step: 1,
        total_steps: steps.length,
        status: "active",
      })
      .select()
      .single();

    if (wfError) {
      throw new Error(`Failed to create workflow: ${wfError.message}`);
    }

    // Calculate estimated completion dates
    const startDate = new Date();
    const estimatedDates = calculateEstimatedDates(steps, startDate);

    // Seed all steps with estimated_completion
    const rows = steps.map((s) => ({
      ...s,
      workflow_id: workflow.id,
      client_id,
      estimated_completion: estimatedDates.get(s.step_number) || null,
    }));

    const { error: stepsError } = await supabase.from("workflow_steps").insert(rows);

    if (stepsError) {
      throw new Error(`Failed to seed steps: ${stepsError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, workflow_id: workflow.id, plan_tier: planTier, total_steps: steps.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("seed-workflow-steps error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
