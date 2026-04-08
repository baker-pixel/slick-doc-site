import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, industry } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Analyzing website:", url, "Industry:", industry || "not specified");

    // Fetch the website HTML
    let htmlContent = "";
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; WebsiteAnalyzer/1.0)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch website: ${response.status}`);
      }
      
      htmlContent = await response.text();
      console.log("Fetched HTML length:", htmlContent.length);
    } catch (fetchError) {
      console.error("Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch website. Please check the URL and try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Truncate HTML to avoid token limits
    const truncatedHtml = htmlContent.substring(0, 50000);

    // Use Lovable AI to analyze the website
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const industryContext = industry ? `\nThe business is in the ${industry} industry. Tailor your recommendations to this industry's best practices and customer expectations.` : "";

    const systemPrompt = `You are an expert digital marketing and web development analyst. Analyze the website HTML thoroughly and provide HONEST, VARIED scores based on what you ACTUALLY find.${industryContext}

CRITICAL: Do NOT default to average scores. Each website is different - scores should range from 20-95 based on actual evidence:
- If meta tags are missing/poor: SEO score should be 30-50
- If there are no clear CTAs: Conversion score should be 25-45
- If the site has excellent SEO with proper h1, meta descriptions, schema: Score 80-95
- If mediocre: 50-65
- Base EVERY score on specific evidence from the HTML

Return your analysis as a JSON object with this exact structure:
{
  "overallScore": <number 0-100 - weighted average of sub-scores>,
  "seo": {
    "score": <number 0-100 based on: title tag quality, meta description, h1 tags, heading hierarchy, image alts, schema markup, canonical tags>,
    "findings": [<3-4 SPECIFIC findings citing actual HTML elements found or missing>],
    "recommendations": [<2-3 actionable SEO recommendations>]
  },
  "conversion": {
    "score": <number 0-100 based on: clear CTAs, form presence, phone numbers visible, trust signals, testimonials, pricing clarity>,
    "findings": [<3-4 SPECIFIC findings about conversion elements>],
    "recommendations": [<2-3 actionable conversion recommendations>]
  },
  "technical": {
    "score": <number 0-100 based on: clean HTML structure, accessibility attributes, mobile viewport, script/style organization>,
    "findings": [<3-4 SPECIFIC technical findings>],
    "recommendations": [<2-3 actionable technical recommendations>]
  },
  "quickWins": [
    {
      "title": "<short title>",
      "description": "<what to do and why it matters>",
      "impact": "high" | "medium",
      "effort": "low" | "medium"
    }
  ],
  "actionPlan": {
    "week1": {
      "title": "Quick Fixes",
      "tasks": ["<task 1>", "<task 2>"]
    },
    "week2to4": {
      "title": "Foundation Building", 
      "tasks": ["<task 1>", "<task 2>"]
    },
    "month2to3": {
      "title": "Growth Acceleration",
      "tasks": ["<task 1>", "<task 2>"]
    }
  },
  "summary": "<2-3 sentence summary>"
}

SCORING RUBRIC (be strict):
- 85-100: ONLY if you find: proper meta tags, schema markup, multiple CTAs, testimonials, proper heading hierarchy
- 70-84: Good basics present, some optimization needed
- 50-69: Major elements missing (like no meta description, weak CTAs)
- 30-49: Significant issues (missing h1, no clear conversion path)
- 0-29: Critical failures (broken structure, no SEO elements at all)

Reference SPECIFIC elements from the HTML to justify each score.`;

    const userPrompt = `Analyze this website HTML for SEO, conversion optimization, and technical performance:

URL: ${url}
${industry ? `Industry: ${industry}` : ""}

HTML Content:
${truncatedHtml}

Provide your analysis as a valid JSON object.`;

    console.log("Sending to AI for analysis...");

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
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a few moments." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("AI analysis failed");
    }

    const aiData = await aiResponse.json();
    console.log("AI response received");

    const content = aiData.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No analysis content returned");
    }

    // Parse the JSON from the AI response
    let analysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Parse error:", parseError, "Content:", content);
      throw new Error("Failed to parse analysis results");
    }

    console.log("Analysis complete:", analysis.overallScore);

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in analyze-website function:", error);

    try {
      const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await _sb.from('automation_alerts').insert({
        alert_type: 'function_error',
        severity: 'error',
        title: `Error in analyze-website`,
        message: error instanceof Error ? error.message : 'Unknown error',
        source: 'analyze-website',
        metadata: {
          function_name: 'analyze-website',
        client_id: null,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      }).catch(console.error);
    } catch (_alertErr) { console.error('Failed to log alert:', _alertErr); }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
