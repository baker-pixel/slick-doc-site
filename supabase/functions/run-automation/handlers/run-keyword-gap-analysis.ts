import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";
import { callAIJson } from "../../_shared/ai.ts";

export async function runKeywordGapAnalysis(supabase: any, client: ClientData) {
  const { data: competitors } = await supabase
    .from("client_competitors")
    .select("*")
    .eq("client_account_id", client.id);

  const reportDate = formatDate();

  if (!competitors?.length) {
    await createDeliverable(
      supabase,
      client.id,
      `Keyword Gap Analysis - ${reportDate}`,
      `# Keyword Gap Analysis

## Status: Unable to Complete

*Generated on ${reportDate} for ${client.business_name}*

## Issue

No competitors are configured for this client. Competitor data is required to perform keyword gap analysis.

## How to Add Competitors

1. Go to the admin panel
2. Navigate to client settings
3. Add competitor domains

## Why This Matters

Keyword gap analysis helps identify:
- Keywords competitors rank for that you don't
- Content opportunities
- Market positioning gaps

*Add competitors to enable this analysis.*`,
      "report"
    );
    return { completed: false, reason: "No competitors configured", deliverableCreated: true };
  }

  // Fetch HTML and extract text/keywords from each URL
  const fetchPageKeywords = async (url: string): Promise<{ url: string; title: string; h1: string[]; metaKeywords: string; textPreview: string; wordCount: number }> => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "OrangeDoorSEOBot/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { url, title: "", h1: [], metaKeywords: "", textPreview: "", wordCount: 0 };
      const html = (await res.text()).slice(0, 50000);
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const h1Matches = html.match(/<h1[^>]*>([^<]+)<\/h1>/gi) || [];
      const metaKwMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i);
      const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return {
        url,
        title: titleMatch ? titleMatch[1].trim() : "",
        h1: h1Matches.map(h => h.replace(/<[^>]+>/g, "").trim()),
        metaKeywords: metaKwMatch ? metaKwMatch[1].trim() : "",
        textPreview: text.slice(0, 1000),
        wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
      };
    } catch (_e) {
      return { url, title: "", h1: [], metaKeywords: "", textPreview: "", wordCount: 0 };
    }
  };

  // Crawl client website
  const clientData = client.website_url ? await fetchPageKeywords(client.website_url) : null;

  // Crawl competitor websites
  const competitorData = await Promise.all(
    competitors.slice(0, 5).map(async (c: any) => {
      const domain = c.domain.startsWith("http") ? c.domain : `https://${c.domain}`;
      const pageData = await fetchPageKeywords(domain);
      return { name: c.name, ...pageData };
    })
  );

  // Ask AI to compare and identify gaps
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  let gapResults: any;

  if (GROQ_API_KEY && clientData) {
    try {
      const prompt = `You are an SEO keyword gap analyst. Compare the client's website with their competitors and identify keyword opportunities.

CLIENT WEBSITE: ${client.website_url || "N/A"}
Title: ${clientData.title}
H1 Tags: ${clientData.h1.join(", ")}
Meta Keywords: ${clientData.metaKeywords}
Content Preview: ${clientData.textPreview.slice(0, 500)}

COMPETITORS:
${competitorData.map(c => `
${c.name} (${c.url}):
  Title: ${c.title}
  H1: ${c.h1.join(", ")}
  Meta Keywords: ${c.metaKeywords}
  Content Preview: ${c.textPreview.slice(0, 300)}
`).join("\n")}

INDUSTRY: ${client.industry || "General"}

Return a JSON object with this exact structure:
{
  "totalOpportunities": number,
  "topKeywords": ["keyword1", "keyword2", ...up to 10],
  "competitorKeywords": [{"name": "competitor name", "uniqueTopics": ["topic1", "topic2"]}],
  "contentGaps": ["gap description 1", "gap description 2"],
  "quickWins": ["quick win 1", "quick win 2"]
}

Return only JSON.`;

      gapResults = await callAIJson({
        source: "run-automation:keyword_gap",
        prompt,
        maxTokens: 1024,
      });
    } catch (e) {
      console.error("AI keyword gap analysis error:", e);
    }
  }

  // Fallback if AI fails
  if (!gapResults) {
    gapResults = {
      totalOpportunities: 0,
      topKeywords: [],
      competitorKeywords: competitorData.map(c => ({ name: c.name, uniqueTopics: [] })),
      contentGaps: ["AI analysis unavailable — manual review recommended"],
      quickWins: [],
    };
  }

  await supabase.from("keyword_gap_results").insert({
    client_account_id: client.id,
    competitors: competitors.map((c: any) => c.domain),
    results: gapResults,
  });

  const markdownReport = `# Keyword Gap Analysis Report

## Summary

*Generated on ${reportDate} for ${client.business_name}*

**Total Keyword Opportunities Found:** ${gapResults.totalOpportunities}

## Top Keyword Opportunities

${gapResults.topKeywords.length ? gapResults.topKeywords.map((kw: string) => `- **${kw}**`).join('\n') : "- No keyword opportunities identified yet"}

## Competitor Analysis

${gapResults.competitorKeywords.map((c: any) => `### ${c.name}
${c.uniqueTopics?.length ? c.uniqueTopics.map((t: string) => `- ${t}`).join('\n') : '- No unique topics identified'}`).join('\n\n')}

## Content Gaps

${gapResults.contentGaps?.length ? gapResults.contentGaps.map((g: string) => `- ${g}`).join('\n') : "- No content gaps identified"}

## Quick Wins

${gapResults.quickWins?.length ? gapResults.quickWins.map((w: string) => `- ${w}`).join('\n') : "- No quick wins identified"}

## Recommendations

Based on this analysis, we recommend:
- Creating content targeting the top keyword opportunities
- Covering topics your competitors address but you don't
- Optimizing existing pages for related terms

*Your marketing team will develop a content strategy based on these findings.*`;

  await createDeliverable(
    supabase,
    client.id,
    `Keyword Gap Analysis - ${reportDate}`,
    markdownReport,
    "report"
  );

  return { completed: true, results: gapResults, deliverableCreated: true };
}
