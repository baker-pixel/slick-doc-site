import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ActionItem {
  action: string;
  automation_potential: string;
  expected_outputs: string[];
  required_inputs: string[];
  step: string;
  trigger: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const { clientAccountId, returnOnly = false } = await req.json();

    if (!clientAccountId) {
      return new Response(
        JSON.stringify({ error: "clientAccountId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    // Duplicate guard only when actually saving to DB
    if (!returnOnly) {
      const { data: existingProjects } = await supabase
        .from("client_projects")
        .select("id")
        .eq("client_account_id", clientAccountId);

      if (existingProjects && existingProjects.length > 0) {
        return new Response(
          JSON.stringify({ error: `Client already has ${existingProjects.length} project(s). Delete existing projects before regenerating.` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch client info including context fields
    const { data: client, error: clientError } = await supabase
      .from("client_accounts")
      .select("id, business_name, tier, industry, website_summary, tone, context_profile")
      .eq("id", clientAccountId)
      .single();

    if (clientError || !client) {
      console.error("Client fetch error:", clientError);
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch SOP for the client's tier
    const { data: sop, error: sopError } = await supabase
      .from("sop_documents")
      .select("name, action_items, parsed_content")
      .eq("tier", client.tier)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (sopError) {
      console.error("SOP fetch error:", sopError);
    }

    // Fetch task templates for this tier
    const { data: taskTemplates, error: templateError } = await supabase
      .from("task_templates")
      .select("name, description, category, automation_type")
      .eq("tier", client.tier)
      .eq("is_active", true)
      .order("order_index");

    if (templateError) {
      console.error("Task templates fetch error:", templateError);
    }

    // Group task templates by category
    const tasksByCategory: Record<string, any[]> = {};
    for (const task of taskTemplates || []) {
      if (!tasksByCategory[task.category]) {
        tasksByCategory[task.category] = [];
      }
      tasksByCategory[task.category].push(task);
    }

    // Build context for AI
    const actionItems = (sop?.action_items || []) as ActionItem[];
    const sopContext = actionItems.map((item: ActionItem) =>
      `- ${item.step}: ${item.action} (Automation: ${item.automation_potential})`
    ).join("\n");

    const tasksContext = Object.entries(tasksByCategory)
      .map(([category, tasks]) =>
        `${category.toUpperCase()}:\n${(tasks as any[]).map(t => `  - ${t.name}`).join("\n")}`
      ).join("\n\n");

    // Build client-specific context from stored profile
    const contextProfile = client.context_profile as Record<string, any> | null;
    const clientContextLines: string[] = [];
    if (client.website_summary) clientContextLines.push(`Website Overview: ${client.website_summary}`);
    if (client.tone) clientContextLines.push(`Brand Tone: ${client.tone}`);
    if (contextProfile?.services?.length) clientContextLines.push(`Services: ${Array.isArray(contextProfile.services) ? contextProfile.services.join(', ') : contextProfile.services}`);
    if (contextProfile?.target_audience) clientContextLines.push(`Target Audience: ${contextProfile.target_audience}`);
    if (contextProfile?.differentiators) clientContextLines.push(`Differentiators: ${contextProfile.differentiators}`);
    if (contextProfile?.goals) clientContextLines.push(`Business Goals: ${contextProfile.goals}`);

    const prompt = `You are a digital marketing agency project manager. Generate a tailored project plan for a specific client.

CLIENT INFO:
- Business: ${client.business_name}
- Tier: ${client.tier}
- Industry: ${client.industry || "General Business"}
${clientContextLines.length > 0 ? clientContextLines.map(l => `- ${l}`).join("\n") : ""}

SOP ACTION ITEMS FOR ${client.tier.toUpperCase()} TIER:
${sopContext || "Standard marketing operations"}

AVAILABLE TASKS BY CATEGORY:
${tasksContext || "Standard task templates"}

Generate 3-5 projects tailored specifically to ${client.business_name} and their ${client.industry || "industry"}. Use the client's actual context — their services, goals, and audience — to name and describe projects meaningfully. Do NOT use generic names like "Marketing Project 1".

Focus on these project types based on tier:
- Foundation: Local SEO, Google Business Profile, review generation, on-page optimisation
- Growth: Lead generation, email automation, content marketing, paid ads
- Transformation: Multi-channel campaigns, marketing automation, advanced analytics, CRO

For each milestone, include a realistic "days_from_start" integer based on work complexity:
- Quick setup tasks (profile, configs, accounts): 3–7 days
- Research, audit, or strategy tasks: 7–14 days
- Content creation or creative work: 14–21 days
- Technical builds or integrations: 14–28 days
- Reviews, reports, or sign-off milestones: 30 days

Return ONLY valid JSON with this structure:
{
  "projects": [
    {
      "name": "Project Name specific to ${client.business_name}",
      "description": "Brief description referencing their business context",
      "milestones": [
        { "name": "Milestone name", "description": "What this covers", "days_from_start": 7 }
      ]
    }
  ]
}`;

    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2048,
        messages: [
          { role: "system", content: "You are a project management AI. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content from AI");
    }

    // Parse the JSON from AI response
    let projectsPlan;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1]?.trim() || content.trim();
      projectsPlan = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Content:", content);
      throw new Error("Failed to parse AI response");
    }

    // returnOnly: return AI suggestions to the caller without touching the DB.
    // The Wizard uses this to pre-populate its form; admin reviews before committing.
    if (returnOnly) {
      return new Response(
        JSON.stringify({ success: true, projects: projectsPlan.projects || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save to DB atomically via the create_project_with_milestones RPC
    const today = new Date().toISOString().split('T')[0];
    const createdCount = { projects: 0 };

    for (const project of projectsPlan.projects || []) {
      const milestones = (project.milestones || []).map((m: any, i: number) => ({
        name: m.name,
        description: m.description || null,
        days_from_start: typeof m.days_from_start === 'number' && m.days_from_start > 0 ? m.days_from_start : (i + 1) * 7,
        sort_order: i,
      }));

      const { error: rpcError } = await supabase.rpc('create_project_with_milestones', {
        p_client_account_id: clientAccountId,
        p_name: project.name,
        p_description: project.description || null,
        p_start_date: today,
        p_milestones: milestones,
      });

      if (rpcError) {
        console.error("RPC project creation error:", rpcError);
        continue;
      }
      createdCount.projects++;
    }

    console.log(`Created ${createdCount.projects} projects for client ${client.business_name}`);

    return new Response(
      JSON.stringify({ success: true, projectsCreated: createdCount.projects }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Generate projects error:", error);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in generate-client-projects`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'generate-client-projects',
      source_id: null,
      metadata: {
        function_name: 'generate-client-projects',
        client_id: null,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});