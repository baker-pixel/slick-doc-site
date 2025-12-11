import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { goal, location, industry, budget, platform, additionalInfo } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const prompt = `You are an expert digital marketing strategist. Generate complete ad campaigns for the following business:

Campaign Goal: ${goal}
Target Location: ${location}
Industry: ${industry}
Monthly Budget: ${budget || "Not specified"}
Additional Info: ${additionalInfo || "None"}

Generate ads for ${platform === "both" ? "both Google Ads and Meta (Facebook/Instagram) Ads" : platform === "google" ? "Google Ads only" : "Meta (Facebook/Instagram) Ads only"}.

For each platform, provide:
1. 5 compelling headlines (max 30 chars for Google, max 40 chars for Meta)
2. 3 descriptions (max 90 chars for Google, max 125 chars for Meta)  
3. Recommended call-to-action
4. Target audience details (demographics, interests, behaviors)
5. Landing page copy (headline, subheadline, body text, CTA button text)
6. 3 image prompts for ad creatives
7. Brief video script outline (15-30 seconds)

Return ONLY valid JSON in this exact format:
{
  "ads": [
    {
      "platform": "google",
      "headlines": ["headline1", "headline2", "headline3", "headline4", "headline5"],
      "descriptions": ["desc1", "desc2", "desc3"],
      "callToAction": "Call Now",
      "targetAudience": {
        "demographics": "Age 25-54, homeowners, household income $75k+",
        "interests": ["interest1", "interest2", "interest3"],
        "behaviors": ["behavior1", "behavior2"]
      },
      "landingPageCopy": {
        "headline": "Main headline",
        "subheadline": "Supporting subheadline",
        "bodyText": "Body paragraph with key benefits and features",
        "ctaButton": "Get Free Quote"
      },
      "imagePrompts": ["prompt1", "prompt2", "prompt3"],
      "videoScriptOutline": "Scene 1: Opening hook...\nScene 2: Problem...\nScene 3: Solution...\nScene 4: Call to action..."
    }
  ]
}`;

    console.log("Generating ads for:", { goal, location, industry, platform });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an expert digital marketing strategist specializing in Google Ads and Meta Ads. Always respond with valid JSON only." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse the JSON response
    let parsedAds;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedAds = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse AI response");
    }

    console.log("Successfully generated ads");

    return new Response(JSON.stringify(parsedAds), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-ads:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
