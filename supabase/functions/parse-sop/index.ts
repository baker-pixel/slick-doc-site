import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParseSOPRequest {
  sopId: string;
  documentText?: string;
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

    const { sopId, documentText }: ParseSOPRequest = await req.json();
    console.log(`Parsing SOP ${sopId}`);

    // Get SOP document
    const { data: sop, error: sopError } = await supabase
      .from("sop_documents")
      .select("*")
      .eq("id", sopId)
      .single();

    if (sopError || !sop) {
      throw new Error(`SOP not found: ${sopError?.message}`);
    }

    // If document text provided, use it; otherwise use existing content
    const contentToAnalyze = documentText || sop.description || "";

    if (!contentToAnalyze) {
      throw new Error("No content to analyze");
    }

    // Call Lovable AI to parse the SOP
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert at analyzing Standard Operating Procedures (SOPs) for marketing agencies. 
Parse the following SOP document and extract structured information.

Output a JSON object with:
{
  "summary": "Brief summary of the SOP",
  "category": "email_sequences | content_generation | reporting | general",
  "action_items": [
    {
      "step": number,
      "action": "What to do",
      "trigger": "When to do it (optional)",
      "automation_potential": "high | medium | low",
      "required_inputs": ["list of required data"],
      "expected_outputs": ["list of outputs"]
    }
  ],
  "key_metrics": ["metrics to track"],
  "tools_mentioned": ["any tools referenced"],
  "frequency": "daily | weekly | monthly | as_needed"
}`;

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
          { role: "user", content: `Parse this SOP document:\n\n${contentToAnalyze}` },
        ],
      }),
    });

    if (!aiResponse.ok) {
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
    let parsedContent: Record<string, unknown> = {};
    let actionItems: unknown[] = [];
    
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
        actionItems = (parsedContent.action_items as unknown[]) || [];
      }
    } catch (e) {
      console.error("Failed to parse AI output:", e);
      parsedContent = { raw_content: aiContent };
    }

    // Update SOP with parsed content
    const { error: updateError } = await supabase
      .from("sop_documents")
      .update({
        parsed_content: parsedContent,
        action_items: actionItems,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sopId);

    if (updateError) {
      throw new Error(`Failed to update SOP: ${updateError.message}`);
    }

    console.log(`SOP ${sopId} parsed successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        parsedContent,
        actionItems,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Parse SOP error:", error);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in parse-sop`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'parse-sop',
      metadata: {
        function_name: 'parse-sop',
        client_id: null,
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
