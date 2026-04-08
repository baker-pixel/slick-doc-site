import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOUNDATION_STEPS = [
  { step_number: 1, step_name: "Analyze current website performance", task_type: "website_analysis", depends_on: null },
  { step_number: 2, step_name: "Run basic SEO audit", task_type: "seo_audit", depends_on: 1 },
  { step_number: 3, step_name: "Generate marketing gap report", task_type: "gap_report", depends_on: 2 },
  { step_number: 4, step_name: "Create Google Business Profile post", task_type: "content", depends_on: 3, payload: { content_type: "gbp_post" } },
  { step_number: 5, step_name: "Publish GBP post", task_type: "n8n_post_social", depends_on: 4 },
  { step_number: 6, step_name: "Write blog article", task_type: "content", depends_on: 3, payload: { content_type: "blog" } },
  { step_number: 7, step_name: "Publish blog article", task_type: "n8n_post_blog", depends_on: 6 },
  { step_number: 8, step_name: "Generate quarterly SEO report", task_type: "report", depends_on: 7 },
];

const GROWTH_EXTRA = [
  { step_number: 9, step_name: "Create email nurture sequence", task_type: "email_template", depends_on: 3 },
  { step_number: 10, step_name: "Generate retargeting ad copy", task_type: "ad_copy", depends_on: 3 },
  { step_number: 11, step_name: "Create social media content batch", task_type: "social_content", depends_on: 3, payload: { content_type: "social_batch" } },
  { step_number: 12, step_name: "Publish social content", task_type: "n8n_post_social", depends_on: 11 },
];

const TRANSFORMATION_EXTRA = [
  { step_number: 13, step_name: "Write second blog article", task_type: "content", depends_on: 8, payload: { content_type: "blog" } },
  { step_number: 14, step_name: "Publish second blog", task_type: "n8n_post_blog", depends_on: 13 },
  { step_number: 15, step_name: "Create retention email sequence", task_type: "email_template", depends_on: 8, payload: { content_type: "retention" } },
  { step_number: 16, step_name: "Scrape and compile analytics report", task_type: "analytics", depends_on: 14 },
  { step_number: 17, step_name: "Generate full monthly report", task_type: "report", depends_on: 16 },
];

function getStepsForTier(tier: string) {
  const t = tier.toLowerCase();
  if (t === "transformation") {
    return [...FOUNDATION_STEPS, ...GROWTH_EXTRA, ...TRANSFORMATION_EXTRA];
  }
  if (t === "growth") {
    return [...FOUNDATION_STEPS, ...GROWTH_EXTRA];
  }
  return [...FOUNDATION_STEPS];
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

    // Get client tier
    const { data: client, error: clientErr } = await supabase
      .from("client_accounts")
      .select("tier")
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

    const steps = getStepsForTier(client.tier);

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

    // Seed steps
    const rows = steps.map((s) => ({
      step_number: s.step_number,
      step_name: s.step_name,
      task_type: s.task_type,
      depends_on: s.depends_on,
      payload: (s as any).payload || null,
      workflow_id: workflow.id,
      client_id,
    }));

    const { error: stepsError } = await supabase.from("workflow_steps").insert(rows);
    if (stepsError) throw new Error(`Failed to seed steps: ${stepsError.message}`);

    // Auto-start step 1 by calling run-workflow-step
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const resp = await fetch(`${supabaseUrl}/functions/v1/run-workflow-step`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ workflow_id: workflow.id, step_number: 1 }),
      });
      const result = await resp.json();
      console.log("Auto-started step 1:", result);
    } catch (autoStartErr) {
      console.error("Failed to auto-start step 1 (workflow still created):", autoStartErr);
    }

    return new Response(
      JSON.stringify({ success: true, workflow_id: workflow.id, tier: client.tier, total_steps: steps.length, auto_started: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("seed-tier-workflow error:", error);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in seed-tier-workflow`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'seed-tier-workflow',
      source_id: client_id ?? undefined,
      metadata: {
        function_name: 'seed-tier-workflow',
        client_id: client_id ?? null,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
