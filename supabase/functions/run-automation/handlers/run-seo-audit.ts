import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function runSeoAudit(supabase: any, client: ClientData) {
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const websiteUrl = client.website_url;
  if (!websiteUrl) {
    // Fallback to hardcoded scores when no website URL is available
    const fallback = {
      technical: { score: 0, issues: ["No website URL configured for this client"] },
      onPage: { score: 0, issues: ["Cannot analyze – no website URL"] },
      offPage: { score: 0, issues: ["Cannot analyze – no website URL"] },
    };
    const overallScore = 0;
    await supabase.from("seo_audits").insert({
      client_account_id: client.id,
      audit_type: "full",
      score: overallScore,
      results: fallback,
    });
    return { completed: true, results: fallback, deliverableCreated: false };
  }

  // Build list of pages to analyze (homepage + up to 2 additional key pages)
  const pagesToAnalyze: string[] = [websiteUrl];

  // Check for additional pages from seo_page_analysis or content calendar
  try {
    const { data: existingPages } = await supabase
      .from("seo_page_analysis")
      .select("url")
      .eq("client_account_id", client.id)
      .neq("url", websiteUrl)
      .limit(2);
    if (existingPages?.length) {
      pagesToAnalyze.push(...existingPages.map((p: any) => p.url));
    }
  } catch (_e) {
    // No additional pages to analyze – that's fine
  }

  // Fetch target keywords from client competitors or use empty
  let targetKeywords: string[] = [];
  try {
    const { data: competitors } = await supabase
      .from("client_competitors")
      .select("name")
      .eq("client_account_id", client.id)
      .limit(5);
    if (competitors?.length) {
      targetKeywords = competitors.map((c: any) => c.name);
    }
  } catch (_e) { /* no keywords */ }

  // Analyze each page via the analyze-seo edge function
  const pageResults: any[] = [];
  for (const pageUrl of pagesToAnalyze.slice(0, 3)) {
    try {
      const res = await fetch(`${baseUrl}/functions/v1/analyze-seo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          clientId: client.id,
          url: pageUrl,
          targetKeywords,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.analysis) {
          pageResults.push(data.analysis);
        }
      } else {
        console.error(`analyze-seo failed for ${pageUrl}:`, res.status);
      }
    } catch (e) {
      console.error(`analyze-seo error for ${pageUrl}:`, e);
    }
  }

  // Aggregate scores from real analysis results
  let auditResults: any;
  if (pageResults.length > 0) {
    const avg = (field: string) =>
      Math.round(pageResults.reduce((sum, p) => sum + (p[field] || 0), 0) / pageResults.length);

    const technicalIssues = pageResults
      .flatMap((p) => (p.technical_issues || []).map((i: any) => typeof i === "string" ? i : i.issue))
      .filter(Boolean);
    const readabilityIssues = pageResults
      .flatMap((p) => (p.readability_issues || []).map((i: any) => typeof i === "string" ? i : i.issue))
      .filter(Boolean);

    // Deduplicate issues
    const uniqueTechnical = [...new Set(technicalIssues)];
    const uniqueReadability = [...new Set(readabilityIssues)];

    auditResults = {
      technical: { score: avg("technical_score"), issues: uniqueTechnical.length ? uniqueTechnical : ["No major technical issues found"] },
      onPage: { score: avg("keyword_score"), issues: uniqueReadability.length ? uniqueReadability : ["Content quality looks good"] },
      offPage: { score: avg("backlink_potential"), issues: pageResults.some(p => (p.external_links || 0) < 3) ? ["Few external links detected", "Consider building more quality backlinks"] : ["Backlink profile looks reasonable"] },
      pagesAnalyzed: pageResults.length,
      overallScore: avg("overall_score"),
      readabilityScore: avg("readability_score"),
    };
  } else {
    auditResults = {
      technical: { score: 50, issues: ["Could not reach website for analysis"] },
      onPage: { score: 50, issues: ["Website was unreachable during audit"] },
      offPage: { score: 50, issues: ["Unable to assess backlink profile"] },
    };
  }

  const overallScore = auditResults.overallScore ??
    Math.round((auditResults.technical.score + auditResults.onPage.score + auditResults.offPage.score) / 3);

  await supabase.from("seo_audits").insert({
    client_account_id: client.id,
    audit_type: "full",
    score: overallScore,
    results: auditResults,
  });

  const reportDate = formatDate();
  const markdownReport = `# SEO Audit Report

## Overall Score: ${overallScore}/100

*Generated on ${reportDate} for ${client.business_name}*
*Pages analyzed: ${pageResults.length}*

## Technical SEO
**Score:** ${auditResults.technical.score}/100

### Issues Found:
${auditResults.technical.issues.map((issue: string) => `- ${issue}`).join('\n')}

## On-Page SEO
**Score:** ${auditResults.onPage.score}/100

### Issues Found:
${auditResults.onPage.issues.map((issue: string) => `- ${issue}`).join('\n')}

## Off-Page SEO
**Score:** ${auditResults.offPage.score}/100

### Issues Found:
${auditResults.offPage.issues.map((issue: string) => `- ${issue}`).join('\n')}

## Next Steps

Based on this audit, we recommend focusing on:
${auditResults.technical.score < 70 ? '- Addressing technical SEO issues (meta tags, page speed, mobile friendliness)\n' : ''}${auditResults.offPage.score < 70 ? '- Building more quality backlinks\n' : ''}${auditResults.onPage.score < 70 ? '- Improving content depth and keyword optimization\n' : ''}${overallScore >= 70 ? '- Maintaining current SEO momentum with regular audits\n' : ''}
*Your marketing team will review these findings and create an action plan.*`;

  await createDeliverable(
    supabase,
    client.id,
    `SEO Audit Report - ${reportDate}`,
    markdownReport,
    "report"
  );

  return { completed: true, results: auditResults, deliverableCreated: true };
}
