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

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { clientAccountId, platforms, topic, tone, wordCount } = await req.json();
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");
    if (!clientAccountId) throw new Error("clientAccountId is required");

    // Fetch company context
    const { data: client, error: clientErr } = await sb
      .from("client_accounts")
      .select("business_name, industry, website_summary, context_profile")
      .eq("id", clientAccountId)
      .single();

    if (clientErr || !client) throw new Error("Client not found");

    const clientName = client.business_name || "the business";
    const industry = client.industry || "";
    const websiteSummary = client.website_summary ||
      (client.context_profile as Record<string, string> | null)?.website_summary || "";

    // Use first platform for style; fall back to linkedin
    const VALID_PLATFORMS = ["facebook", "instagram", "linkedin", "twitter"];
    const rawPlatform = (Array.isArray(platforms) ? platforms[0] : platforms) || "linkedin";
    const platform = VALID_PLATFORMS.includes(String(rawPlatform).toLowerCase())
      ? String(rawPlatform).toLowerCase()
      : "linkedin";

    const platformStyles: Record<string, string> = {
      facebook: "casual, friendly, community-focused with emojis. 150-250 characters.",
      instagram: "visual, trendy, with 5-10 relevant hashtags. 100-150 characters + hashtags.",
      linkedin: "professional, insightful, thought leadership. 200-300 characters.",
      twitter: "concise, punchy, trending. Max 280 characters with 2-3 hashtags.",
    };

    const style = platformStyles[platform];
    const brandTone = tone ? String(tone).slice(0, 50) : "professional";

    // Cap word count — min 20, max 300
    const targetWords = typeof wordCount === "number" && wordCount > 0
      ? Math.min(Math.max(wordCount, 20), 300)
      : 100;

    const prompt = `Create a compelling social media post for ${clientName}${industry ? ` (${industry} industry)` : ""} for ${platform}.

Style: ${style}
Brand tone: ${brandTone}
Target length: approximately ${targetWords} words (excluding hashtags)
${websiteSummary ? `\nBusiness context: ${websiteSummary}` : ""}
${topic ? `\nTopic/Theme: ${topic}` : ""}

The post should:
- Be engaging and authentic
- Match the brand's ${brandTone} tone of voice
- Include a clear call-to-action
- Match the platform's best practices
- Be approximately ${targetWords} words long
- Be ready to post as-is

Return ONLY the post content. No quotes, no explanations.`;

    console.log("Generating content for:", clientName, platform, "tone:", brandTone);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: "You are a professional social media copywriter. Write platform-native content that feels authentic and drives engagement. Return ONLY the post text — no commentary, no quotes around the post.",
          },
          { role: "user", content: prompt },
        ],
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

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content?.trim() || "";

    // Extract hashtags from content, strip them from the body, deduplicate
    const hashtagMatches = rawContent.match(/#\w+/g) || [];
    const hashtags = [...new Set(hashtagMatches.map((h: string) => h.slice(1).toLowerCase()))];
    const content = rawContent.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();

    console.log("Generated content length:", content.length, "hashtags:", hashtags.length);

    return new Response(
      JSON.stringify({ content, hashtags }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error generating content:", error);
    try {
      await sb.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "Error in generate-social-content",
        message: error instanceof Error ? error.message : "Unknown error",
        source: "generate-social-content",
        metadata: {
          function_name: "generate-social-content",
          error_message: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_alertErr) { console.error("Failed to log alert:", _alertErr); }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to generate content" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
