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
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Analyzing website:", url);

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

    const systemPrompt = `You are an expert digital marketing and web development analyst. Analyze the provided website HTML and provide a comprehensive assessment.

Return your analysis as a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "seo": {
    "score": <number 0-100>,
    "findings": [<3-4 specific findings about SEO elements>],
    "recommendations": [<2-3 actionable SEO recommendations>]
  },
  "conversion": {
    "score": <number 0-100>,
    "findings": [<3-4 specific findings about conversion elements like CTAs, forms, trust signals>],
    "recommendations": [<2-3 actionable conversion recommendations>]
  },
  "technical": {
    "score": <number 0-100>,
    "findings": [<3-4 specific findings about technical aspects like structure, accessibility, mobile-friendliness indicators>],
    "recommendations": [<2-3 actionable technical recommendations>]
  },
  "summary": "<2-3 sentence overall summary of the website's digital marketing health>"
}

Scoring guidelines:
- 80-100: Excellent - Well optimized
- 60-79: Good - Some improvements needed
- 40-59: Fair - Significant gaps
- 0-39: Poor - Major issues

Be specific and actionable in your findings and recommendations. Reference actual elements you find (or don't find) in the HTML.`;

    const userPrompt = `Analyze this website HTML for SEO, conversion optimization, and technical performance:

URL: ${url}

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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
