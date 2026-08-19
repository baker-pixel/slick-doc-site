import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { callAIJson, AIError } from "../_shared/ai.ts";
import { parseOnPage } from "../_shared/seoSignals.ts";
import { auditWebsite } from "../_shared/websiteAudit.ts";
import { scoreEngagementRetention, scoreMetricsImprovement } from "../_shared/systemSignals.ts";

function getTier(score: number): "transformation" | "growth" | "optimization" {
  if (score <= 39) return "transformation";
  if (score <= 64) return "growth";
  return "optimization";
}

function factsSummary(signals: ReturnType<typeof parseOnPage>): string {
  return `DETECTED FACTS (parsed directly from the HTML — this is ground truth, not a guess. Cite any MISSING item by name in your findings):
- Title tag: ${signals.title ? `present ("${signals.title.slice(0, 80)}")` : "MISSING"}
- Meta description: ${signals.meta_description ? "present" : "MISSING"}
- H1 tags found: ${signals.h1_count}
- Images missing alt text: ${signals.images_missing_alt} of ${signals.image_count}
- Mobile viewport tag: ${signals.has_viewport ? "present" : "MISSING"}
- Canonical tag: ${signals.has_canonical ? "present" : "MISSING"}
- Schema/structured data: ${signals.has_schema ? "present" : "MISSING"}
- Open Graph tags: ${signals.has_open_graph ? "present" : "MISSING"}
- Word count: ${signals.word_count}`;
}

/** Ground-truth fact -> finding text, guaranteed to appear regardless of what the LLM notices. */
function detectedIssueFindings(signals: ReturnType<typeof parseOnPage>) {
  const seo: { missing: boolean; keywords: string[]; text: string }[] = [
    { missing: !signals.title, keywords: ["title tag", "<title>", "missing title"], text: "Missing <title> tag — search engines have nothing to show as the page headline." },
    { missing: !signals.meta_description, keywords: ["meta description"], text: "Missing meta description tag — search results will show a generic or blank snippet." },
    { missing: signals.h1_count === 0, keywords: ["h1", "heading"], text: "No <h1> heading found on the page." },
    { missing: !signals.has_canonical, keywords: ["canonical"], text: "Missing canonical tag — risk of duplicate-content SEO issues." },
    { missing: !signals.has_schema, keywords: ["schema", "structured data"], text: "No structured data (schema markup) found." },
    { missing: !signals.has_open_graph, keywords: ["open graph", "og:"], text: "Missing Open Graph tags — links look bare when shared on social media." },
  ];
  const technical: { missing: boolean; keywords: string[]; text: string }[] = [
    { missing: !signals.has_viewport, keywords: ["viewport"], text: "Missing mobile viewport meta tag — page may not render correctly on phones." },
    { missing: signals.images_missing_alt > 0, keywords: ["alt text", "alt attribute"], text: `${signals.images_missing_alt} image(s) missing alt text.` },
  ];
  return { seo, technical };
}

function factAlreadyMentioned(findings: string[], keywords: string[]): boolean {
  const joined = findings.join(" ").toLowerCase();
  return keywords.some((k) => joined.includes(k));
}

/** Facts that are PRESENT, phrased positively — for a genuine "what's working" list. */
function detectedStrengthFindings(signals: ReturnType<typeof parseOnPage>): string[] {
  const strengths: string[] = [];
  if (signals.title) strengths.push("Title tag is present");
  if (signals.meta_description) strengths.push("Meta description is present");
  if (signals.has_viewport) strengths.push("Mobile viewport configured correctly");
  if (signals.has_canonical) strengths.push("Canonical tag is present");
  if (signals.has_schema) strengths.push("Structured data (schema markup) found");
  if (signals.has_open_graph) strengths.push("Open Graph tags present for social sharing");
  return strengths;
}

/** Force any ground-truth issue the LLM didn't mention into the findings — the LLM's job is
 * framing/prioritization, not detection, so a miss here must never silently disappear. Also
 * attaches flat detectedStrengths/detectedGaps so callers don't have to guess sentiment out of
 * a findings array that mixes positives and negatives. */
function applyDetectedFacts(analysis: any, signals: ReturnType<typeof parseOnPage>) {
  const { seo, technical } = detectedIssueFindings(signals);
  analysis.seo ??= { score: 50, findings: [], recommendations: [] };
  analysis.technical ??= { score: 50, findings: [], recommendations: [] };
  analysis.seo.findings = Array.isArray(analysis.seo.findings) ? analysis.seo.findings : [];
  analysis.technical.findings = Array.isArray(analysis.technical.findings) ? analysis.technical.findings : [];

  for (const fact of seo) {
    if (fact.missing && !factAlreadyMentioned(analysis.seo.findings, fact.keywords)) {
      analysis.seo.findings.unshift(fact.text);
    }
  }
  for (const fact of technical) {
    if (fact.missing && !factAlreadyMentioned(analysis.technical.findings, fact.keywords)) {
      analysis.technical.findings.unshift(fact.text);
    }
  }
  analysis.seo.findings = analysis.seo.findings.slice(0, 6);
  analysis.technical.findings = analysis.technical.findings.slice(0, 6);

  analysis.detectedGaps = [...seo, ...technical].filter((f) => f.missing).map((f) => f.text);
  analysis.detectedStrengths = detectedStrengthFindings(signals);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { url, industry, prospect } = await req.json();
    let prospectId: string | null = null;

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prospectName = typeof prospect?.name === "string" ? prospect.name.trim() : "";
    const prospectEmail = typeof prospect?.email === "string" ? prospect.email.trim() : "";
    const prospectBusinessType =
      typeof prospect?.businessType === "string" && prospect.businessType.trim().length > 0
        ? prospect.businessType.trim()
        : null;

    if (prospectName && prospectEmail) {
      const { data: savedProspect, error: prospectError } = await supabase
        .from("prospects")
        .insert({
          name: prospectName,
          email: prospectEmail,
          business_type: prospectBusinessType,
          website_url: url,
        })
        .select("id")
        .single();

      if (prospectError) {
        console.error("Prospect insert error:", prospectError);
        throw new Error("Failed to save prospect");
      }

      prospectId = savedProspect.id;
    }

    console.log("Analyzing website:", url, "Industry:", industry || "not specified");

    const audit = await auditWebsite(url);
    if (!audit) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch website. Please check the URL and try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { html: htmlContent, signals, readiness } = audit;
    console.log("Fetched HTML length:", htmlContent.length);

    const truncatedHtml = htmlContent.substring(0, 50000);

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    const industryContext = industry
      ? `\nThe business is in the ${industry} industry. Tailor your recommendations to this industry's best practices and customer expectations.`
      : "";

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
  "summary": "<2-3 sentence summary>",
  "context_profile": {
    "industry": "a short industry/business-type label, e.g. 'Residential HVAC', 'Family Law', 'Med Spa'",
    "services": ["list of specific services or products offered — be specific, e.g. 'HVAC repair' not 'services'"],
    "differentiators": ["key differentiators or USPs visible on the site — e.g. '20+ years experience', 'family-owned', '24/7 emergency service'"],
    "target_audience": "who they primarily serve based on site content",
    "location": "geographic area or city if detectable from the site",
    "tone": "one of: professional, friendly, casual, expert — based on site copy style",
    "business_summary": "one sentence plain-English description of what this business does and who it serves"
  }
}

Additionally, extract a context_profile object from the website with the fields shown above. Be specific about services — list actual offerings, not generic terms.

SCORING RUBRIC (be strict):
- 85-100: ONLY if you find: proper meta tags, schema markup, multiple CTAs, testimonials, proper heading hierarchy
- 70-84: Good basics present, some optimization needed
- 50-69: Major elements missing (like no meta description, weak CTAs)
- 30-49: Significant issues (missing h1, no clear conversion path)
- 0-29: Critical failures (broken structure, no SEO elements at all)

Reference SPECIFIC elements from the HTML to justify each score. Any item flagged MISSING in the DETECTED FACTS block below is confirmed absent — always name it explicitly in the relevant findings, never omit it.`;

    const userPrompt = `Analyze this website HTML for SEO, conversion optimization, and technical performance:

URL: ${url}
${industry ? `Industry: ${industry}` : ""}

${factsSummary(signals)}

HTML Content:
${truncatedHtml}

Provide your analysis as a valid JSON object.`;

    console.log("Sending to AI for analysis...");

    let analysis: any;
    try {
      analysis = await callAIJson<any>({
        source: "analyze-website",
        system: systemPrompt,
        prompt: userPrompt,
        maxTokens: 4096,
      });
      console.log("AI response received");
    } catch (e) {
      const status = e instanceof AIError ? e.status : null;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a few moments." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (e instanceof AIError) throw new Error("AI analysis failed");
      throw e;
    }

    applyDetectedFacts(analysis, signals);

    // Two more SYSTEM categories a page fetch can honestly speak to --
    // ground-truth detected (regex over the HTML), never LLM-guessed. The
    // other two SYSTEM categories (Sequence & Nurture, Transaction
    // Activation) need real business-operations answers no page fetch can
    // provide, so Quick Analysis's frontend shows those locked rather than
    // faking a score for them here.
    analysis.engagement = scoreEngagementRetention(htmlContent);
    analysis.metrics = scoreMetricsImprovement(htmlContent);

    // Headline score = average of the 4 SYSTEM categories a site scan can
    // actually assess (Search & Visibility merges seo+technical; Yield is
    // conversion; Engagement/Metrics are the ground-truth signals above) --
    // must match what QuickAnalysis.tsx computes and displays, so the score
    // saved to `prospects` (and used for tier recommendation + the emailed
    // PDF) never disagrees with the on-screen report for the same scan.
    const searchVisibilityScore = Math.round((analysis.seo.score + analysis.technical.score) / 2);
    const systemOverallScore = Math.round(
      (searchVisibilityScore + analysis.conversion.score + analysis.engagement.score + analysis.metrics.score) / 4,
    );

    if (prospectId) {
      const topWeaknesses = [
        ...analysis.seo.recommendations.slice(0, 1),
        ...analysis.conversion.recommendations.slice(0, 1),
        ...analysis.technical.recommendations.slice(0, 1),
      ].slice(0, 3);

      const contextProfile = analysis.context_profile
        ? { ...analysis.context_profile, source: "website_scan", partial: false }
        : null;

      const { error: updateError } = await supabase
        .from("prospects")
        .update({
          gap_score: systemOverallScore,
          top_weaknesses: topWeaknesses,
          recommended_tier: getTier(systemOverallScore),
          analysis_snapshot: analysis,
          ...(contextProfile ? { context_profile: contextProfile } : {}),
        })
        .eq("id", prospectId);

      if (updateError) {
        console.error("Prospect update error:", updateError);
      }

      const { error: readinessError } = await supabase
        .from("ai_readiness_scores")
        .upsert({ prospect_id: prospectId, ...readiness }, { onConflict: "prospect_id" });
      if (readinessError) {
        console.error("AI readiness score insert error:", readinessError);
      }

      // Nurture: send-prospect-report (called separately by the frontend) is a
      // one-off email -- nothing else enrolls a quick-scan lead into any
      // follow-up sequence, so today they get one email and go stranded. Reuse
      // the same generic sequence full-form gap-analysis leads already get
      // (queue-sequence-emails already skips this if the email/site matches an
      // existing client) so every non-converted lead lands in one pipeline
      // regardless of which entry point it came from.
      try {
        const baseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const nurtureRes = await fetch(`${baseUrl}/functions/v1/queue-sequence-emails`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            triggerType: "gap_analysis_complete",
            recipientEmail: prospectEmail,
            recipientName: prospectName,
            data: {
              businessName: prospectBusinessType || new URL(url).hostname,
              websiteUrl: url,
              leadSource: "quick_analysis",
            },
          }),
        });
        if (!nurtureRes.ok) {
          console.error("queue-sequence-emails failed:", nurtureRes.status, await nurtureRes.text());
        }
      } catch (nurtureErr) {
        console.error("Failed to queue nurture sequence:", nurtureErr);
      }
    }

    console.log("Analysis complete:", analysis.overallScore);

    return new Response(
      JSON.stringify({ analysis, prospectId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-website function:", error);

    try {
      await supabase.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "Error in analyze-website",
        message: error instanceof Error ? error.message : "Unknown error",
        source: "analyze-website",
        metadata: {
          function_name: "analyze-website",
          client_id: null,
          error_message: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (_alertErr) {
      console.error("Failed to log alert:", _alertErr);
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
