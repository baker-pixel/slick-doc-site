import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STEPS = [
  { step_number: 1,  step_name: "Website analysis",       task_type: "website_analysis", depends_on: null },
  { step_number: 2,  step_name: "SEO audit",              task_type: "seo_audit",        depends_on: 1 },
  { step_number: 3,  step_name: "Gap report",             task_type: "gap_report",       depends_on: 2 },
  { step_number: 4,  step_name: "Keyword strategy",       task_type: "seo_audit",        depends_on: 3 },
  { step_number: 5,  step_name: "Homepage content",       task_type: "content",          depends_on: 3 },
  { step_number: 6,  step_name: "Blog post 1",            task_type: "content",          depends_on: 5 },
  { step_number: 7,  step_name: "Blog post 2",            task_type: "content",          depends_on: 6 },
  { step_number: 8,  step_name: "Social post batch",      task_type: "social_content",   depends_on: 5 },
  { step_number: 9,  step_name: "Email welcome sequence",task_type: "email_template",   depends_on: 5 },
  { step_number: 10, step_name: "Ad copy draft",          task_type: "ad_copy",          depends_on: 5 },
  { step_number: 11, step_name: "Publish blog 1",         task_type: "n8n_post_blog",    depends_on: 6 },
  { step_number: 12, step_name: "Publish blog 2",         task_type: "n8n_post_blog",    depends_on: 7 },
  { step_number: 13, step_name: "Post social batch",      task_type: "n8n_post_social",  depends_on: 8 },
  { step_number: 14, step_name: "Send welcome email",     task_type: "email_campaign",   depends_on: 9 },
  { step_number: 15, step_name: "Analytics snapshot",     task_type: "analytics",        depends_on: 14 },
  { step_number: 16, step_name: "Monthly report",         task_type: "report",           depends_on: 15 },
  { step_number: 17, step_name: "Client review ready",    task_type: "notify_client",    depends_on: 16 },
];

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

    // Create workflow record
    const { data: workflow, error: wfError } = await supabase
      .from("client_workflows")
      .insert({
        client_id,
        workflow_name: "system_17_step",
        current_step: 1,
        total_steps: 17,
        status: "active",
      })
      .select()
      .single();

    if (wfError) {
      throw new Error(`Failed to create workflow: ${wfError.message}`);
    }

    // Seed all 17 steps
    const steps = STEPS.map((s) => ({
      ...s,
      workflow_id: workflow.id,
      client_id,
    }));

    const { error: stepsError } = await supabase.from("workflow_steps").insert(steps);

    if (stepsError) {
      throw new Error(`Failed to seed steps: ${stepsError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, workflow_id: workflow.id }),
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
