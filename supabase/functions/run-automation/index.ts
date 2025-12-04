import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutomationRequest {
  clientId: string;
  jobType: "email_sequence" | "content_generation" | "report";
  inputData?: Record<string, unknown>;
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

    const { clientId, jobType, inputData }: AutomationRequest = await req.json();
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

    // Get SOPs for this client's tier and job type
    const categoryMap: Record<string, string> = {
      email_sequence: "email_sequences",
      content_generation: "content_generation",
      report: "reporting",
    };

    const { data: sops, error: sopError } = await supabase
      .from("sop_documents")
      .select("*")
      .eq("tier", client.tier)
      .eq("category", categoryMap[jobType])
      .eq("is_active", true);

    if (sopError) {
      throw new Error(`Failed to fetch SOPs: ${sopError.message}`);
    }

    // Create automation job
    const { data: job, error: jobError } = await supabase
      .from("automation_jobs")
      .insert({
        client_id: clientId,
        sop_id: sops?.[0]?.id || null,
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

    // Build AI prompt based on SOPs and job type
    const sopContent = sops?.map((s) => s.parsed_content || s.description).join("\n\n") || "";
    
    let systemPrompt = "";
    let userPrompt = "";

    switch (jobType) {
      case "email_sequence":
        systemPrompt = `You are an expert email marketing specialist. Based on the following SOPs and client information, create a personalized email sequence.

SOPs:
${sopContent}

Output a JSON object with:
{
  "sequence_name": "string",
  "emails": [
    {
      "subject": "string",
      "body": "string (HTML)",
      "send_delay_days": number,
      "purpose": "string"
    }
  ]
}`;
        userPrompt = `Create a ${client.tier}-tier email sequence for ${client.business_name}.
Client email: ${client.email}
Additional context: ${JSON.stringify(inputData || {})}`;
        break;

      case "content_generation":
        systemPrompt = `You are an expert content creator. Based on the following SOPs and client information, generate marketing content.

SOPs:
${sopContent}

Output a JSON object with:
{
  "content_pieces": [
    {
      "type": "blog_post | social_post | ad_copy",
      "title": "string",
      "content": "string",
      "platform": "string (optional)"
    }
  ]
}`;
        userPrompt = `Create ${client.tier}-tier marketing content for ${client.business_name}.
Additional context: ${JSON.stringify(inputData || {})}`;
        break;

      case "report":
        systemPrompt = `You are a marketing analytics expert. Based on the following SOPs and client information, generate an insightful report.

SOPs:
${sopContent}

Output a JSON object with:
{
  "executive_summary": "string",
  "metrics": { "key": "value" },
  "insights": ["string"],
  "recommendations": [
    {
      "priority": "high | medium | low",
      "action": "string",
      "expected_impact": "string"
    }
  ]
}`;
        userPrompt = `Generate a ${client.tier}-tier marketing report for ${client.business_name}.
Additional data: ${JSON.stringify(inputData || {})}`;
        break;
    }

    // Call Lovable AI
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
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      
      // Update job as failed
      await supabase
        .from("automation_jobs")
        .update({
          status: "failed",
          error_message: `AI error: ${aiResponse.status}`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    
    // Parse AI response
    let parsedOutput: Record<string, unknown> = {};
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedOutput = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse AI output:", e);
      parsedOutput = { raw_content: aiContent };
    }

    // Store generated content based on job type
    if (jobType === "content_generation" && parsedOutput.content_pieces) {
      const pieces = parsedOutput.content_pieces as Array<{
        type: string;
        title: string;
        content: string;
        platform?: string;
      }>;
      
      for (const piece of pieces) {
        await supabase.from("generated_content").insert({
          client_id: clientId,
          job_id: job.id,
          content_type: piece.type || "other",
          title: piece.title,
          content: piece.content,
          metadata: { platform: piece.platform },
        });
      }
    }

    if (jobType === "report") {
      const today = new Date();
      const periodStart = new Date(today);
      periodStart.setDate(periodStart.getDate() - 30);
      
      await supabase.from("client_reports").insert({
        client_id: clientId,
        job_id: job.id,
        report_type: "monthly",
        report_period_start: periodStart.toISOString().split("T")[0],
        report_period_end: today.toISOString().split("T")[0],
        metrics: parsedOutput.metrics || {},
        insights: parsedOutput.insights || [],
        recommendations: parsedOutput.recommendations || [],
      });
    }

    // Update job as completed
    await supabase
      .from("automation_jobs")
      .update({
        status: "completed",
        output_data: parsedOutput,
        ai_model_used: "google/gemini-2.5-flash",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log(`Job ${job.id} completed successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        output: parsedOutput,
      }),
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
