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
    const { clientAccountId } = await req.json();
    
    if (!clientAccountId) {
      return new Response(
        JSON.stringify({ error: "clientAccountId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");


    // Fetch client info
    const { data: client, error: clientError } = await supabase
      .from("client_accounts")
      .select("id, business_name, tier, industry")
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

    const prompt = `You are a digital marketing agency project manager. Generate a comprehensive project plan for a new client.

CLIENT INFO:
- Business: ${client.business_name}
- Tier: ${client.tier}
- Industry: ${client.industry || "General Business"}

SOP ACTION ITEMS FOR ${client.tier.toUpperCase()} TIER:
${sopContext || "Standard marketing operations"}

AVAILABLE TASKS BY CATEGORY:
${tasksContext || "Standard task templates"}

Generate 3-5 projects that cover the key areas of the ${client.tier} tier service. Each project should have clear milestones.

Focus on these project types based on tier:
- Foundation: Website optimization, Google Business Profile setup, Review generation, Basic SEO
- Growth: Lead generation, Email marketing, Content marketing, Paid ads setup
- Dominate/Scale: Advanced SEO, Multi-channel campaigns, Automation, Reporting dashboards

Return your response as a JSON object with this structure:
{
  "projects": [
    {
      "name": "Project Name",
      "description": "Brief description",
      "milestones": [
        { "name": "Milestone name", "description": "What this milestone covers" }
      ]
    }
  ]
}`;

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a project management AI. Always respond with valid JSON only." },
          { role: "user", content: prompt }
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

    // Create projects and milestones in database
    const createdProjects = [];
    const today = new Date();

    for (const project of projectsPlan.projects || []) {
      // Create project
      const { data: newProject, error: projectError } = await supabase
        .from("client_projects")
        .insert({
          client_account_id: clientAccountId,
          name: project.name,
          description: project.description,
          status: "pending",
          start_date: today.toISOString().split('T')[0],
          progress_percentage: 0,
        })
        .select()
        .single();

      if (projectError) {
        console.error("Project creation error:", projectError);
        continue;
      }

      // Create milestones
      const milestones = project.milestones || [];
      for (let i = 0; i < milestones.length; i++) {
        const milestone = milestones[i];
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + (i + 1) * 7); // Weekly milestones

        await supabase
          .from("project_milestones")
          .insert({
            project_id: newProject.id,
            name: milestone.name,
            description: milestone.description,
            status: "pending",
            sort_order: i + 1,
            due_date: dueDate.toISOString().split('T')[0],
          });
      }

      createdProjects.push(newProject);
    }

    console.log(`Created ${createdProjects.length} projects for client ${client.business_name}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        projectsCreated: createdProjects.length,
        projects: createdProjects
      }),
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