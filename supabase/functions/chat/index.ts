import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "I'm a bit busy right now. Please try again in a moment!" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Transform Anthropic SSE → OpenAI SSE format expected by ChatWidget
    const transformer = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") { controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n")); continue; }
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
              const openaiChunk = JSON.stringify({ choices: [{ delta: { content: parsed.delta.text } }] });
              controller.enqueue(new TextEncoder().encode(`data: ${openaiChunk}\n\n`));
            } else if (parsed.type === "message_stop") {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            }
          } catch { /* skip non-JSON lines */ }
        }
      },
    });

    return new Response(response.body!.pipeThrough(transformer), {
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
