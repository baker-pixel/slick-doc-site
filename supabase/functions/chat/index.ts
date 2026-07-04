import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { MODELS } from "../_shared/ai.ts";

const SYSTEM_PROMPT = `You are the Orange Door AI Assistant - a friendly, knowledgeable digital marketing expert for small businesses in East Tennessee.

Your role:
- Answer questions about digital marketing, SEO, paid ads, lead generation, and business growth
- Help visitors understand Orange Door's services and the SYSTEM methodology
- Qualify leads by understanding their business challenges
- Keep responses concise (2-3 sentences max unless asked for detail)
- Be warm, approachable, and use simple language (no jargon)
- When appropriate, suggest they take the free Gap Analysis or schedule a call

About Orange Door:
- Digital marketing consultancy for East Tennessee SMBs
- 6-Step SYSTEM: Strategy, Your Audience, Search, Traffic, Engage, Measure
- Services include SEO, paid ads, lead nurturing, analytics, and full marketing systems
- Focus on predictable, measurable growth

If asked about pricing, mention they have flexible packages and suggest scheduling a discovery call.
If someone seems interested, encourage them to take the free Gap Analysis for personalized insights.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const rawBody = await req.text();
    let body: any = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = body?.messages;
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELS.fast,
        max_tokens: 1024,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "I'm a bit busy right now. Please try again in a moment!" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Groq uses OpenAI-compatible SSE format natively — pipe directly
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    try {
      await _sb.from("automation_alerts").insert({
        alert_type: "function_error", severity: "error", title: "Error in chat",
        message: error instanceof Error ? error.message : "Unknown error", source: "chat",
        metadata: { function_name: "chat", client_id: null, error_message: error instanceof Error ? error.message : "Unknown error", timestamp: new Date().toISOString() },
      });
    } catch (_e) { /* ignore */ }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
