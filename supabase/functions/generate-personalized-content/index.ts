import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SEGMENT_DESCRIPTIONS: Record<string, string> = {
  new_visitor: "a first-time visitor who has never seen this site before",
  returning_visitor: "a returning visitor who has been to this site before",
  local_user: "a local user within the service area who values community and proximity",
  out_of_town: "a visitor from outside the local service area",
  past_buyer: "an existing customer who has previously purchased or hired this business",
  engaged_scroller: "a highly engaged user who has scrolled deep into the page, showing strong interest",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { originalContent, segment, componentType } = await req.json();

    if (!originalContent || !segment) {
      return new Response(
        JSON.stringify({ error: "originalContent and segment are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const segmentDesc = SEGMENT_DESCRIPTIONS[segment] || segment;
    const componentDesc = componentType || "content";

    const prompt = `You are personalizing website content for a specific audience segment.

Original ${componentDesc}:
"${originalContent}"

Target segment: ${segmentDesc}

Rewrite the ${componentDesc} to resonate specifically with this user segment. Keep the same general message and intent, but adjust the tone, emphasis, and language to appeal directly to ${segmentDesc}.

Return ONLY the personalized content text — no explanation, no quotes, no extra formatting.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        temperature: 0.7,
        system: "You are a conversion copywriter specializing in personalized website content. Return only the rewritten content text with no extra commentary.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", response.status, errText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const personalizedContent = data.content?.[0]?.text?.trim() || originalContent;

    return new Response(
      JSON.stringify({ success: true, personalizedContent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-personalized-content error:", error);
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "Error in generate-personalized-content",
        message: error instanceof Error ? error.message : "Unknown error",
        source: "generate-personalized-content",
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (_) { /* ignore */ }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
