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

interface PageSpeedResult {
  performanceScore: number;
  mobileScore: number;
  lcp: number | null;
  cls: number | null;
  fcp: number | null;
  tbt: number | null;
  loadTimeMs: number | null;
  issues: { issue: string; severity: string; fix: string }[];
}

// Fetch rendered HTML via Browserless if key is set, else plain fetch
async function fetchHtml(url: string): Promise<{ html: string; renderedWithJs: boolean }> {
  const browserlessKey = Deno.env.get("BROWSERLESS_API_KEY");

  if (browserlessKey) {
    try {
      console.log("Fetching rendered HTML via Browserless...");
      const res = await fetch(
        `https://chrome.browserless.io/content?token=${browserlessKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, waitFor: 2000 }),
        }
      );
      if (res.ok) {
        const html = await res.text();
        console.log(`Browserless returned ${html.length} chars`);
        return { html, renderedWithJs: true };
      }
      console.warn("Browserless failed:", res.status, "— falling back to plain fetch");
    } catch (err) {
      console.warn("Browserless error:", err, "— falling back to plain fetch");
    }
  }

  console.log("Fetching HTML via plain fetch...");
  const res = await fetch(url, {
    headers: { "User-Agent": "OrangeDoorSEOBot/1.0" },
  });
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`);
  const html = await res.text();
  return { html, renderedWithJs: false };
}

// Google PageSpeed Insights — runs both mobile + desktop in parallel
async function getPageSpeedData(url: string): Promise<PageSpeedResult | null> {
  try {
    const key = Deno.env.get("PAGESPEED_API_KEY");
    const base = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
    const keyParam = key ? `&key=${key}` : "";

    const [mobileRes, desktopRes] = await Promise.all([
      fetch(`${base}?url=${encodeURIComponent(url)}&strategy=mobile${keyParam}`),
      fetch(`${base}?url=${encodeURIComponent(url)}&strategy=desktop${keyParam}`),
    ]);

    if (!mobileRes.ok && !desktopRes.ok) {
      console.warn("PageSpeed API failed:", mobileRes.status);
      return null;
    }

    const [mobileData, desktopData] = await Promise.all([
      mobileRes.ok ? mobileRes.json() : null,
      desktopRes.ok ? desktopRes.json() : null,
    ]);

    const audits = mobileData?.lighthouseResult?.audits ?? {};
    const mobileScore = Math.round((mobileData?.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
    const desktopScore = Math.round((desktopData?.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
    const performanceScore = Math.round((mobileScore + desktopScore) / 2);

    const lcp = audits["largest-contentful-paint"]?.numericValue ?? null;
    const cls = audits["cumulative-layout-shift"]?.numericValue ?? null;
    const fcp = audits["first-contentful-paint"]?.numericValue ?? null;
    const tbt = audits["total-blocking-time"]?.numericValue ?? null;
    const tti = audits["interactive"]?.numericValue ?? null;

    const issues: { issue: string; severity: string; fix: string }[] = [];

    if (mobileScore < 50) {
      issues.push({
        issue: `Poor mobile performance score (${mobileScore}/100)`,
        severity: "high",
        fix: "Optimize images, reduce JS bundle size, enable caching",
      });
    } else if (mobileScore < 75) {
      issues.push({
        issue: `Mobile performance needs improvement (${mobileScore}/100)`,
        severity: "medium",
        fix: "Review render-blocking resources and image sizes",
      });
    }

    if (lcp !== null && lcp > 4000) {
      issues.push({
        issue: `LCP too slow (${(lcp / 1000).toFixed(1)}s — target <2.5s)`,
        severity: "high",
        fix: "Optimize hero image, preload critical fonts, use a CDN",
      });
    } else if (lcp !== null && lcp > 2500) {
      issues.push({
        issue: `LCP borderline (${(lcp / 1000).toFixed(1)}s — target <2.5s)`,
        severity: "medium",
        fix: "Compress and lazy-load images below the fold",
      });
    }

    if (cls !== null && cls > 0.25) {
      issues.push({
        issue: `High layout shift (CLS ${cls.toFixed(3)} — target <0.1)`,
        severity: "high",
        fix: "Set explicit width/height on images and embeds",
      });
    } else if (cls !== null && cls > 0.1) {
      issues.push({
        issue: `Moderate layout shift (CLS ${cls.toFixed(3)} — target <0.1)`,
        severity: "medium",
        fix: "Reserve space for dynamically loaded content",
      });
    }

    if (tbt !== null && tbt > 600) {
      issues.push({
        issue: `High total blocking time (${Math.round(tbt)}ms — target <200ms)`,
        severity: "high",
        fix: "Split large JS bundles, defer non-critical scripts",
      });
    } else if (tbt !== null && tbt > 200) {
      issues.push({
        issue: `Elevated total blocking time (${Math.round(tbt)}ms — target <200ms)`,
        severity: "medium",
        fix: "Audit third-party scripts and remove unused JS",
      });
    }

    console.log(`PageSpeed: mobile=${mobileScore} desktop=${desktopScore} LCP=${lcp} CLS=${cls}`);

    return {
      performanceScore,
      mobileScore,
      lcp,
      cls,
      fcp,
      tbt,
      loadTimeMs: tti ?? null,
      issues,
    };
  } catch (err) {
    console.warn("PageSpeed error (non-fatal):", err);
    return null;
  }
}

function analyzeHtml(html: string, url: string, targetKeywords: string[]) {
  const lowercase = html.toLowerCase();

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : "";

  const metaTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const metaTitle = metaTitleMatch ? metaTitleMatch[1].trim() : title;

  const h1Matches = html.match(/<h1[^>]*>([^<]+)<\/h1>/gi) || [];
  const h1Tags = h1Matches.map(h => h.replace(/<[^>]+>/g, "").trim());

  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

  const imgMatches = html.match(/<img[^>]*>/gi) || [];
  const imageCount = imgMatches.length;
  const imagesMissingAlt = imgMatches.filter(img => !img.includes("alt=") || img.includes('alt=""')).length;

  const linkMatches = html.match(/<a[^>]*href=["']([^"']+)["']/gi) || [];
  let internalLinks = 0;
  let externalLinks = 0;
  const urlDomain = new URL(url).hostname;
  linkMatches.forEach(link => {
    const hrefMatch = link.match(/href=["']([^"']+)["']/i);
    if (hrefMatch) {
      const href = hrefMatch[1];
      if (href.startsWith("/") || href.includes(urlDomain)) internalLinks++;
      else if (href.startsWith("http")) externalLinks++;
    }
  });

  const hasViewport = lowercase.includes('name="viewport"') || lowercase.includes("name='viewport'");

  // Schema markup detection
  const hasSchema = lowercase.includes('"@type"') || lowercase.includes("application/ld+json");
  const hasOpenGraph = lowercase.includes('property="og:') || lowercase.includes("property='og:");
  const hasCanonical = lowercase.includes('rel="canonical"') || lowercase.includes("rel='canonical'");

  const keywords: { keyword: string; count: number; inTitle: boolean; inH1: boolean; inMeta: boolean }[] = [];
  targetKeywords.forEach(kw => {
    const kwLower = kw.toLowerCase();
    const matches = textContent.match(new RegExp(kwLower, "gi"));
    keywords.push({
      keyword: kw,
      count: matches?.length || 0,
      inTitle: title.toLowerCase().includes(kwLower),
      inH1: h1Tags.some(h => h.toLowerCase().includes(kwLower)),
      inMeta: metaDescription.toLowerCase().includes(kwLower),
    });
  });

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
      fix: "Add descriptive alt text to all images",
    });
  }

  if (!hasViewport) {
    technicalIssues.push({ issue: "Missing viewport meta tag", severity: "high", fix: "Add viewport meta for mobile" });
  }

  if (!hasCanonical) {
    technicalIssues.push({ issue: "Missing canonical tag", severity: "medium", fix: "Add <link rel=\"canonical\"> to prevent duplicate content issues" });
  }

  if (!hasSchema) {
    technicalIssues.push({ issue: "No structured data (schema.org)", severity: "medium", fix: "Add JSON-LD schema markup for your business type" });
  }

  if (!hasOpenGraph) {
    technicalIssues.push({ issue: "Missing Open Graph tags", severity: "low", fix: "Add og:title, og:description, og:image for social sharing" });
  }

  if (wordCount < 300) {
    technicalIssues.push({ issue: "Thin content", severity: "medium", fix: "Expand content to at least 500 words" });
  }

  const readabilityIssues: { issue: string; severity: string; fix?: string }[] = [];

  const paragraphs = html.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
  const longParagraphs = paragraphs.filter(p => p.replace(/<[^>]+>/g, "").split(/\s+/).length > 100);
  if (longParagraphs.length > 0) {
    readabilityIssues.push({ issue: `${longParagraphs.length} paragraphs over 100 words`, severity: "medium", fix: "Break long paragraphs into shorter chunks" });
  }

  const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLength = sentences.length > 0 ? wordCount / sentences.length : 0;
  if (avgSentenceLength > 25) {
    readabilityIssues.push({ issue: "Average sentence length too long", severity: "medium", fix: "Aim for sentences under 20 words" });
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
    hasSchema,
    hasOpenGraph,
    hasCanonical,
    keywords,
    technicalIssues,
    readabilityIssues,
    textContent: textContent.slice(0, 2000),
  };
}

function calculateScores(
  analysis: ReturnType<typeof analyzeHtml>,
  pageSpeed: PageSpeedResult | null
) {
  let technical = 100;
  const allTechnicalIssues = [
    ...analysis.technicalIssues,
    ...(pageSpeed?.issues ?? []),
  ];
  allTechnicalIssues.forEach(issue => {
    if (issue.severity === "high") technical -= 15;
    else if (issue.severity === "medium") technical -= 8;
    else technical -= 3;
  });
  technical = Math.max(0, technical);

  // Blend with PageSpeed performance score when available (40% weight)
  if (pageSpeed) {
    technical = Math.round(technical * 0.6 + pageSpeed.performanceScore * 0.4);
  }

  let readability = 100;
  analysis.readabilityIssues.forEach(issue => {
    if (issue.severity === "high") readability -= 15;
    else if (issue.severity === "medium") readability -= 10;
    else readability -= 5;
  });
  readability = Math.max(0, readability);

  // Keyword score — start at 0 when no keywords provided (not 50)
  let keyword = analysis.keywords.length > 0 ? 50 : 0;
  analysis.keywords.forEach(kw => {
    if (kw.inTitle) keyword += 10;
    if (kw.inH1) keyword += 10;
    if (kw.inMeta) keyword += 5;
    if (kw.count >= 3) keyword += 5;
  });
  keyword = Math.min(100, keyword);

  let backlink = 40;
  if (analysis.wordCount > 1000) backlink += 15;
  if (analysis.wordCount > 2000) backlink += 10;
  if (analysis.imageCount > 3) backlink += 10;
  if (analysis.externalLinks > 2) backlink += 10;
  if (analysis.hasSchema) backlink += 10;
  backlink = Math.min(100, backlink);

  const overall = Math.round(
    technical * 0.3 + readability * 0.2 + keyword * 0.3 + backlink * 0.2
  );

  return { overall, technical, readability, keyword, backlink };
}

async function getAiSuggestions(
  analysis: ReturnType<typeof analyzeHtml>,
  targetKeywords: string[],
  pageSpeed: PageSpeedResult | null
) {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) return { suggestions: [], rewrites: [] };

  const pageSpeedSection = pageSpeed
    ? `
PageSpeed Insights:
- Mobile performance: ${pageSpeed.mobileScore}/100
- LCP: ${pageSpeed.lcp !== null ? `${(pageSpeed.lcp / 1000).toFixed(2)}s` : "unknown"} (target <2.5s)
- CLS: ${pageSpeed.cls !== null ? pageSpeed.cls.toFixed(3) : "unknown"} (target <0.1)
- FCP: ${pageSpeed.fcp !== null ? `${(pageSpeed.fcp / 1000).toFixed(2)}s` : "unknown"}
- TBT: ${pageSpeed.tbt !== null ? `${Math.round(pageSpeed.tbt)}ms` : "unknown"} (target <200ms)
`
    : "\nPageSpeed: data unavailable\n";

  const prompt = `Analyze this webpage SEO data and return a JSON object with exactly this structure:
{
  "suggestions": [
    { "type": "string (title|content|technical|internal_links|meta|images|performance|schema)", "suggestion": "string", "priority": "string (high|medium|low)" }
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
Has Schema Markup: ${analysis.hasSchema}
Has Open Graph: ${analysis.hasOpenGraph}
Has Canonical Tag: ${analysis.hasCanonical}
Target Keywords: ${targetKeywords.join(", ") || "(none specified)"}
${pageSpeedSection}
Technical Issues Found:
${[...analysis.technicalIssues, ...(pageSpeed?.issues ?? [])].map(i => `- ${i.issue} (${i.severity})`).join("\n")}

Content Preview (first 800 chars):
${analysis.textContent.slice(0, 800)}

Return only valid JSON, no markdown fences.`;

  try {
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

    let parsed: any;
    try {
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (_e) {
      console.error("Failed to parse AI SEO suggestions as JSON");
      return { suggestions: [], rewrites: [] };
    }

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .map((s: any) => ({
            type: s.type || "content",
            suggestion: s.suggestion || s.description || "",
            priority: s.priority || "medium",
          }))
          .filter((s: any) => s.suggestion)
      : [];

    const rewrites: { type: string; original: string; rewritten: string; aiGenerated: boolean }[] = [];
    if (parsed.rewrites?.title && parsed.rewrites.title !== analysis.title) {
      rewrites.push({ type: "title", original: analysis.title, rewritten: parsed.rewrites.title, aiGenerated: true });
    }
    if (parsed.rewrites?.meta_description && parsed.rewrites.meta_description !== analysis.metaDescription) {
      rewrites.push({ type: "meta_description", original: analysis.metaDescription || "", rewritten: parsed.rewrites.meta_description, aiGenerated: true });
    }
    if (parsed.rewrites?.first_paragraph) {
      rewrites.push({ type: "first_paragraph", original: "", rewritten: parsed.rewrites.first_paragraph, aiGenerated: true });
    }

    return { suggestions, rewrites };
  } catch (error) {
    console.error("AI suggestions error:", error);
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("automation_alerts").insert({
        alert_type: "function_error",
        severity: "error",
        title: "Error in analyze-seo",
        message: error instanceof Error ? error.message : "Unknown error",
        source: "analyze-seo",
        source_id: null,
        metadata: { function_name: "analyze-seo", timestamp: new Date().toISOString() },
      });
    } catch (_alertErr) {
      console.error("Failed to log alert:", _alertErr);
    }
    return { suggestions: [], rewrites: [] };
  }
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

    // Fetch rendered HTML and PageSpeed data in parallel
    const [{ html, renderedWithJs }, pageSpeed] = await Promise.all([
      fetchHtml(url),
      getPageSpeedData(url),
    ]);

    console.log(`HTML fetched (JS rendered: ${renderedWithJs}), PageSpeed: ${pageSpeed ? "ok" : "unavailable"}`);

    const analysis = analyzeHtml(html, url, targetKeywords);

    // Use PageSpeed mobile score for mobile_friendly when available
    const mobileFriendly = pageSpeed
      ? pageSpeed.mobileScore >= 50
      : analysis.mobileFriendly;

    const [aiSuggestions, scores] = await Promise.all([
      getAiSuggestions(analysis, targetKeywords, pageSpeed),
      Promise.resolve(calculateScores(analysis, pageSpeed)),
    ]);

    const { data, error } = await supabase
      .from("seo_page_analysis")
      .upsert(
        {
          client_account_id: clientId,
          url,
          page_title: analysis.title,
          overall_score: scores.overall,
          readability_score: scores.readability,
          keyword_score: scores.keyword,
          technical_score: scores.technical,
          backlink_potential: scores.backlink,
          keywords_found: analysis.keywords,
          technical_issues: [
            ...analysis.technicalIssues,
            ...(pageSpeed?.issues ?? []),
          ],
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
          mobile_friendly: mobileFriendly,
          load_time_ms: pageSpeed?.loadTimeMs ?? null,
          analyzed_at: new Date().toISOString(),
        },
        { onConflict: "client_account_id,url" }
      )
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        analysis: data,
        meta: {
          renderedWithJs,
          pageSpeedAvailable: pageSpeed !== null,
          mobileScore: pageSpeed?.mobileScore ?? null,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("SEO Analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
