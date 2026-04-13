import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { clientName, industry, platform, topic, tone, websiteSummary } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const platformStyles: Record<string, string> = {
      facebook: "casual, friendly, community-focused with emojis. 150-250 characters.",
      instagram: "visual, trendy, with 5-10 relevant hashtags. 100-150 characters + hashtags.",
      linkedin: "professional, insightful, thought leadership. 200-300 characters.",
      twitter: "concise, punchy, trending. Max 280 characters with 2-3 hashtags.",
    };

    const style = platformStyles[platform] || platformStyles.facebook;
    const brandTone = tone || "professional";

    const prompt = `Create a compelling social media post for ${clientName} (${industry || "business"} industry) for ${platform}.

Style: ${style}
Brand tone: ${brandTone}

${websiteSummary ? `Business context: ${websiteSummary}` : ""}
${topic ? `Topic/Theme: ${topic}` : ""}

The post should:
- Be engaging and authentic
- Match the brand's ${brandTone} tone of voice
- Include a clear call-to-action
- Match the platform's best practices
- Be ready to post as-is

Return ONLY the post content, nothing else. No quotes, no explanations.`;

    console.log("Generating content for:", clientName, platform, "tone:", brandTone);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    console.log("Generated content length:", content.length);

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error generating content:", error);

    try {
      await _sb.from('automation_alerts').insert({
        alert_type: 'function_error',
        severity: 'error',
        title: `Error in generate-social-content`,
        message: error instanceof Error ? error.message : 'Unknown error',
        source: 'generate-social-content',
        metadata: {
          function_name: 'generate-social-content',
          client_id: null,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_alertErr) { console.error('Failed to log alert:', _alertErr); }
    const errorMessage = error instanceof Error ? error.message : "Failed to generate content";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
