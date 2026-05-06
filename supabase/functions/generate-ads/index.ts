import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const {
      // Ad generation
      goal,
      location,
      industry,
      budget,
      platform,
      additionalInfo,
      competitorUrls,
      generateVariants,
      includePredictions,
      includeBudgetRecs,
      generateLandingPage,

      // Image-only generation
      generateImageOnly,
      imagePrompt,
    } = await req.json();
    
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    // Image-only generation path — not available without dedicated image service
    if (generateImageOnly) {
      return new Response(JSON.stringify({ error: "Image generation not available" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate required fields for ad generation
    if (!goal || !location || !industry || !platform) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: goal, location, industry, platform",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build competitor analysis section
    let competitorSection = "";
    if (competitorUrls && competitorUrls.length > 0) {
      competitorSection = `
Competitor URLs to differentiate from: ${competitorUrls.join(", ")}
Analyze common patterns in competitors' messaging and create ads that stand out.`;
    }

    // Build A/B variants section
    let variantsSection = "";
    if (generateVariants) {
      variantsSection = `
Also generate 2 A/B test variants for each platform with:
- Different headline approaches (emotional vs. logical, question vs. statement)
- Different value propositions
- Different calls to action
Include these in an "abVariants" array.`;
    }

    // Build predictions section
    let predictionsSection = "";
    if (includePredictions) {
      predictionsSection = `
Include performance predictions with:
- Estimated CTR range (low, medium, high)
- Estimated conversion rate
- Quality score prediction (1-10)
- Competition level assessment
- Best days/times to run
Include these in a "performancePredictions" object.`;
    }

    // Build budget recommendations section
    let budgetSection = "";
    if (includeBudgetRecs) {
      budgetSection = `
Include budget recommendations with:
- Recommended daily budget range
- Suggested bid strategy
- Expected monthly impressions/clicks at different budget levels
- ROI optimization tips
Include these in a "budgetRecommendations" object.`;
    }

    // Build landing page section
    let landingPageSection = "";
    if (generateLandingPage) {
      landingPageSection = `
Also generate complete landing page HTML with:
- Hero section with headline, subheadline, and CTA
- Trust signals (testimonials, reviews, certifications)
- Benefits section with icons
- FAQ section
- Contact form
- Mobile-responsive design
- Clean, modern styling
Include this in a "landingPageHtml" string field.`;
    }

    const prompt = `You are an expert digital marketing strategist and performance marketer. Generate complete ad campaigns for the following business:

Campaign Goal: ${goal}
Target Location: ${location}
Industry: ${industry}
Monthly Budget: ${budget || "Not specified"}
Additional Info: ${additionalInfo || "None"}
${competitorSection}

Generate ads for ${platform === "both" ? "both Google Ads and Meta (Facebook/Instagram) Ads" : platform === "google" ? "Google Ads only" : "Meta (Facebook/Instagram) Ads only"}.

For each platform, provide:
1. 5 compelling headlines (max 30 chars for Google, max 40 chars for Meta)
2. 3 descriptions (max 90 chars for Google, max 125 chars for Meta)  
3. Recommended call-to-action
4. Target audience details (demographics, interests, behaviors)
5. Landing page copy (headline, subheadline, body text, CTA button text)
6. 3 detailed image prompts for ad creatives (describe the scene, style, colors, mood)
7. Brief video script outline (15-30 seconds)
${variantsSection}
${predictionsSection}
${budgetSection}
${landingPageSection}

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
      "imagePrompts": ["detailed prompt1", "detailed prompt2", "detailed prompt3"],
      "videoScriptOutline": "Scene 1: Opening hook...\\nScene 2: Problem...\\nScene 3: Solution...\\nScene 4: Call to action..."
    }
  ]${generateVariants ? `,
  "abVariants": [
    {
      "platform": "google",
      "variantName": "Emotional Appeal",
      "headlines": ["variant headline1", "variant headline2"],
      "descriptions": ["variant desc1"],
      "callToAction": "Get Started"
    }
  ]` : ""}${includePredictions ? `,
  "performancePredictions": {
    "estimatedCTR": "2.5% - 4.0%",
    "estimatedConversionRate": "3% - 5%",
    "qualityScorePrediction": 8,
    "competitionLevel": "Medium-High",
    "bestDays": ["Tuesday", "Wednesday", "Thursday"],
    "bestHours": "9am-12pm, 6pm-9pm"
  }` : ""}${includeBudgetRecs ? `,
  "budgetRecommendations": {
    "dailyBudgetRange": "$30 - $75",
    "bidStrategy": "Maximize conversions with target CPA",
    "monthlyProjections": {
      "low": { "budget": 900, "impressions": 15000, "clicks": 450, "conversions": 15 },
      "medium": { "budget": 1500, "impressions": 30000, "clicks": 900, "conversions": 30 },
      "high": { "budget": 2500, "impressions": 55000, "clicks": 1650, "conversions": 55 }
    },
    "roiTips": ["Tip 1", "Tip 2", "Tip 3"]
  }` : ""}${generateLandingPage ? `,
  "landingPageHtml": "<!DOCTYPE html><html>...</html>"` : ""}
}`;

    console.log("Generating enhanced ads for:", { goal, location, industry, platform, generateVariants, includePredictions, includeBudgetRecs });

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 4096,
        messages: [
          { role: "system", content: "You are an expert digital marketing strategist specializing in Google Ads and Meta Ads with deep knowledge of performance optimization, A/B testing, and conversion rate optimization. Always respond with valid JSON only." },
          { role: "user", content: prompt },
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
      // Remove markdown code blocks if present (handle various formats)
      let cleanContent = content.trim();
      // Remove opening code fence with optional language identifier
      cleanContent = cleanContent.replace(/^```(?:json)?\s*/i, '');
      // Remove closing code fence
      cleanContent = cleanContent.replace(/\s*```$/i, '');
      cleanContent = cleanContent.trim();
      
      parsedAds = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      console.error("Parse error:", parseError);
      throw new Error("Failed to parse AI response");
    }

    console.log("Successfully generated enhanced ads");

    return new Response(JSON.stringify(parsedAds), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-ads:", error);

    try {
      await _sb.from('automation_alerts').insert({
        alert_type: 'function_error',
        severity: 'error',
        title: `Error in generate-ads`,
        message: error instanceof Error ? error.message : 'Unknown error',
        source: 'generate-ads',
        metadata: {
          function_name: 'generate-ads',
          client_id: null,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_alertErr) { console.error('Failed to log alert:', _alertErr); }
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
