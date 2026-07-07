import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { callAI } from "../_shared/ai.ts";
import { checkAdminAuth } from "../_shared/auth.ts";

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
    const { originalContent, segment, componentType, password } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = await checkAdminAuth(req, supabase, password);
    if (!auth.authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!originalContent || !segment) {
      return new Response(
        JSON.stringify({ error: "originalContent and segment are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guard: cap input size so we never forward huge payloads to the AI
    const MAX_INPUT_CHARS = 3000;
    const safeContent = String(originalContent).slice(0, MAX_INPUT_CHARS);

    // Validate segment — fall back gracefully but log unknown values
    const knownSegment = Object.prototype.hasOwnProperty.call(SEGMENT_DESCRIPTIONS, segment);
    if (!knownSegment) {
      console.warn(`Unknown segment "${segment}" — falling back to original content`);
      return new Response(
        JSON.stringify({ success: true, personalizedContent: safeContent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const segmentDesc = SEGMENT_DESCRIPTIONS[segment];
    const componentDesc = componentType ? String(componentType).slice(0, 50) : "content";

    const prompt = `You are personalizing website content for a specific audience segment.

Original ${componentDesc}:
"${safeContent}"

Target segment: ${segmentDesc}

Rewrite the ${componentDesc} to resonate specifically with this user segment. Keep the same general message and intent, but adjust the tone, emphasis, and language to appeal directly to ${segmentDesc}.

Return ONLY the personalized content text — no explanation, no quotes, no extra formatting.`;

    const aiText = await callAI({
      source: "generate-personalized-content",
      system: "You are a conversion copywriter specializing in personalized website content. Return only the rewritten content text with no extra commentary.",
      prompt,
      maxTokens: 512,
      temperature: 0.7,
    });
    const personalizedContent = aiText.trim() || originalContent;

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
