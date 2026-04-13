import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalysisRequest {
  clientId: string;
  url: string;
  targetKeywords?: string[];
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
    const { clientId, url, targetKeywords = [] }: AnalysisRequest = await req.json();
    console.log(`Analyzing SEO for ${url}`);

    // Fetch the page
    const pageResponse = await fetch(url, {
      headers: { "User-Agent": "OrangeDoorSEOBot/1.0" },
    });

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch page: ${pageResponse.status}`);
    }

    const html = await pageResponse.text();
    const loadTime = Date.now();

    // Parse HTML for SEO elements
    const analysis = analyzeHtml(html, url, targetKeywords);

    // Get AI suggestions using Lovable AI
    const aiSuggestions = await getAiSuggestions(analysis, targetKeywords);

    // Calculate scores
    const scores = calculateScores(analysis);

    // Save to database
    const { data, error } = await supabase
      .from("seo_page_analysis")
      .upsert({
        client_account_id: clientId,
        url,
        page_title: analysis.title,
        overall_score: scores.overall,
        readability_score: scores.readability,
        keyword_score: scores.keyword,
        technical_score: scores.technical,
        backlink_potential: scores.backlink,
        keywords_found: analysis.keywords,
        technical_issues: analysis.technicalIssues,
        readability_issues: analysis.readabilityIssues,
        suggestions: aiSuggestions.suggestions,
        ai_rewrites: aiSuggestions.rewrites,
        meta_title: analysis.metaTitle,
        meta_description: analysis.metaDescription,
        h1_tags: analysis.h1Tags,
        word_count: analysis.wordCount,
        image_count: analysis.imageCount,
        images_missing_alt: analysis.imagesMissingAlt,
        internal_links: analysis.internalLinks,
        external_links: analysis.externalLinks,
        mobile_friendly: analysis.mobileFriendly,
        analyzed_at: new Date().toISOString(),
      }, { onConflict: "client_account_id,url" })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, analysis: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("SEO Analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function analyzeHtml(html: string, url: string, targetKeywords: string[]) {
  const lowercase = html.toLowerCase();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Extract meta description
  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : "";

  // Extract meta title (og:title or twitter:title)
  const metaTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const metaTitle = metaTitleMatch ? metaTitleMatch[1].trim() : title;

  // Extract H1 tags
  const h1Matches = html.match(/<h1[^>]*>([^<]+)<\/h1>/gi) || [];
  const h1Tags = h1Matches.map(h => h.replace(/<[^>]+>/g, "").trim());

  // Count words (strip HTML)
  const textContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

  // Count images and missing alt
  const imgMatches = html.match(/<img[^>]*>/gi) || [];
  const imageCount = imgMatches.length;
  const imagesMissingAlt = imgMatches.filter(img => !img.includes("alt=") || img.includes('alt=""')).length;

  // Count links
  const linkMatches = html.match(/<a[^>]*href=["']([^"']+)["']/gi) || [];
  let internalLinks = 0;
  let externalLinks = 0;
  const urlDomain = new URL(url).hostname;

  linkMatches.forEach(link => {
    const hrefMatch = link.match(/href=["']([^"']+)["']/i);
    if (hrefMatch) {
      const href = hrefMatch[1];
      if (href.startsWith("/") || href.includes(urlDomain)) {
        internalLinks++;
      } else if (href.startsWith("http")) {
        externalLinks++;
      }
    }
  });

  // Check for viewport meta tag (mobile friendly indicator)
  const hasViewport = lowercase.includes('name="viewport"') || lowercase.includes("name='viewport'");

  // Find keywords in content
  const keywords: { keyword: string; count: number; inTitle: boolean; inH1: boolean; inMeta: boolean }[] = [];
  targetKeywords.forEach(kw => {
    const kwLower = kw.toLowerCase();
    const regex = new RegExp(kwLower, "gi");
    const matches = textContent.match(regex);
    keywords.push({
      keyword: kw,
      count: matches?.length || 0,
      inTitle: title.toLowerCase().includes(kwLower),
      inH1: h1Tags.some(h => h.toLowerCase().includes(kwLower)),
      inMeta: metaDescription.toLowerCase().includes(kwLower),
    });
  });

  // Technical issues
  const technicalIssues: { issue: string; severity: string; fix: string }[] = [];

  if (!title) {
    technicalIssues.push({ issue: "Missing page title", severity: "high", fix: "Add a <title> tag" });
  } else if (title.length < 30) {
    technicalIssues.push({ issue: "Title too short", severity: "medium", fix: "Expand title to 50-60 characters" });
  } else if (title.length > 60) {
    technicalIssues.push({ issue: "Title too long", severity: "low", fix: "Shorten title to under 60 characters" });
  }

  if (!metaDescription) {
    technicalIssues.push({ issue: "Missing meta description", severity: "high", fix: "Add a meta description tag" });
  } else if (metaDescription.length < 120) {
    technicalIssues.push({ issue: "Meta description too short", severity: "medium", fix: "Expand to 150-160 characters" });
  } else if (metaDescription.length > 160) {
    technicalIssues.push({ issue: "Meta description too long", severity: "low", fix: "Shorten to under 160 characters" });
  }

  if (h1Tags.length === 0) {
    technicalIssues.push({ issue: "Missing H1 tag", severity: "high", fix: "Add a single H1 heading" });
  } else if (h1Tags.length > 1) {
    technicalIssues.push({ issue: "Multiple H1 tags", severity: "medium", fix: "Use only one H1 per page" });
  }

  if (imagesMissingAlt > 0) {
    technicalIssues.push({ 
      issue: `${imagesMissingAlt} images missing alt text`, 
      severity: "medium", 
      fix: "Add descriptive alt text to all images" 
    });
  }

  if (!hasViewport) {
    technicalIssues.push({ issue: "Missing viewport meta tag", severity: "high", fix: "Add viewport meta for mobile" });
  }

  if (wordCount < 300) {
    technicalIssues.push({ issue: "Thin content", severity: "medium", fix: "Expand content to at least 500 words" });
  }

  // Readability issues
  const readabilityIssues: { issue: string; severity: string }[] = [];
  
  // Check for very long paragraphs
  const paragraphs = html.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
  const longParagraphs = paragraphs.filter(p => p.replace(/<[^>]+>/g, "").split(/\s+/).length > 100);
  if (longParagraphs.length > 0) {
    readabilityIssues.push({ issue: `${longParagraphs.length} paragraphs over 100 words`, severity: "medium" });
  }

  // Average sentence length estimation
  const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLength = sentences.length > 0 ? wordCount / sentences.length : 0;
  if (avgSentenceLength > 25) {
    readabilityIssues.push({ issue: "Average sentence length too long", severity: "medium" });
  }

  return {
    title,
    metaTitle,
    metaDescription,
    h1Tags,
    wordCount,
    imageCount,
    imagesMissingAlt,
    internalLinks,
    externalLinks,
    mobileFriendly: hasViewport,
    keywords,
    technicalIssues,
    readabilityIssues,
    textContent: textContent.slice(0, 2000), // For AI analysis
  };
}

function calculateScores(analysis: ReturnType<typeof analyzeHtml>) {
  // Technical score
  let technical = 100;
  analysis.technicalIssues.forEach(issue => {
    if (issue.severity === "high") technical -= 15;
    else if (issue.severity === "medium") technical -= 8;
    else technical -= 3;
  });
  technical = Math.max(0, technical);

  // Readability score
  let readability = 100;
  analysis.readabilityIssues.forEach(issue => {
    if (issue.severity === "high") readability -= 15;
    else if (issue.severity === "medium") readability -= 10;
    else readability -= 5;
  });
  readability = Math.max(0, readability);

  // Keyword score
  let keyword = 50; // Base score
  analysis.keywords.forEach(kw => {
    if (kw.inTitle) keyword += 10;
    if (kw.inH1) keyword += 10;
    if (kw.inMeta) keyword += 5;
    if (kw.count >= 3) keyword += 5;
  });
  keyword = Math.min(100, keyword);

  // Backlink potential (based on content quality signals)
  let backlink = 50;
  if (analysis.wordCount > 1000) backlink += 15;
  if (analysis.wordCount > 2000) backlink += 10;
  if (analysis.imageCount > 3) backlink += 10;
  if (analysis.externalLinks > 2) backlink += 10;
  backlink = Math.min(100, backlink);

  // Overall score (weighted average)
  const overall = Math.round(
    technical * 0.3 + readability * 0.2 + keyword * 0.3 + backlink * 0.2
  );

  return { overall, technical, readability, keyword, backlink };
}

async function getAiSuggestions(
  analysis: ReturnType<typeof analyzeHtml>,
  targetKeywords: string[]
) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!LOVABLE_API_KEY) {
    return { suggestions: [], rewrites: [] };
  }

  try {
    const prompt = `Analyze this webpage SEO data and return a JSON object with exactly this structure:
{
  "suggestions": [
    { "type": "string (title|content|technical|internal_links|meta|images)", "suggestion": "string", "priority": "string (high|medium|low)" }
  ],
  "rewrites": {
    "title": "suggested better title or null if current is fine",
    "meta_description": "suggested better meta description or null if current is fine",
    "first_paragraph": "rewritten first paragraph optimized for keywords or null"
  }
}

Page Title: ${analysis.title || "(missing)"}
Meta Description: ${analysis.metaDescription || "(missing)"}
H1 Tags: ${analysis.h1Tags.join(", ") || "(none)"}
Word Count: ${analysis.wordCount}
Images: ${analysis.imageCount} total, ${analysis.imagesMissingAlt} missing alt text
Internal Links: ${analysis.internalLinks}, External Links: ${analysis.externalLinks}
Target Keywords: ${targetKeywords.join(", ") || "(none specified)"}

Technical Issues Already Found:
${analysis.technicalIssues.map(i => `- ${i.issue} (${i.severity})`).join("\n")}

Content Preview (first 800 chars):
${analysis.textContent.slice(0, 800)}

Return only valid JSON, no markdown fences.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an SEO expert. Return only valid JSON. No extra text." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI API error:", response.status);
      return { suggestions: [], rewrites: [] };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response
    let parsed: any;
    try {
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (_e) {
      console.error("Failed to parse AI SEO suggestions as JSON");
      return { suggestions: [], rewrites: [] };
    }

    // Map suggestions to expected shape
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map((s: any) => ({
          type: s.type || "content",
          suggestion: s.suggestion || s.description || "",
          priority: s.priority || "medium",
        })).filter((s: any) => s.suggestion)
      : [];

    // Map rewrites to expected shape
    const rewrites: { type: string; original: string; rewritten: string; aiGenerated: boolean }[] = [];
    if (parsed.rewrites?.title && parsed.rewrites.title !== analysis.title) {
      rewrites.push({
        type: "title",
        original: analysis.title,
        rewritten: parsed.rewrites.title,
        aiGenerated: true,
      });
    }
    if (parsed.rewrites?.meta_description && parsed.rewrites.meta_description !== analysis.metaDescription) {
      rewrites.push({
        type: "meta_description",
        original: analysis.metaDescription || "",
        rewritten: parsed.rewrites.meta_description,
        aiGenerated: true,
      });
    }
    if (parsed.rewrites?.first_paragraph) {
      rewrites.push({
        type: "first_paragraph",
        original: "",
        rewritten: parsed.rewrites.first_paragraph,
        aiGenerated: true,
      });
    }

    return { suggestions, rewrites };
  } catch (error) {
    console.error("AI suggestions error:", error);

    await supabase.from('automation_alerts').insert({
      alert_type: 'function_error',
      severity: 'error',
      title: `Error in analyze-seo`,
      message: error instanceof Error ? error.message : 'Unknown error',
      source: 'analyze-seo',
      source_id: null,
      metadata: {
        function_name: 'analyze-seo',
        client_id: null,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    });
    return { suggestions: [], rewrites: [] };
  }
}
