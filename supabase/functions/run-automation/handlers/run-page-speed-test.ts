import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

export async function runPageSpeedTest(supabase: any, client: ClientData) {
  const websiteUrl = client.website_url || "";

  if (!websiteUrl) {
    const reportDate = formatDate();
    await createDeliverable(
      supabase,
      client.id,
      `Page Speed Test - ${reportDate}`,
      `# Page Speed Test

## Status: Unable to Complete

*Generated on ${reportDate} for ${client.business_name}*

## Issue

No website URL is configured for this client. Please add the client's website URL in their profile to run speed tests.

## Action Required

1. Update client profile with website URL
2. Re-run this automation

*This task requires manual configuration.*`,
      "report"
    );
    return { tested: false, reason: "No website URL configured", deliverableCreated: true };
  }

  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(websiteUrl)}&strategy=mobile`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`PageSpeed API error: ${response.status}`);
    }

    const data = await response.json();
    const score = data.lighthouseResult?.categories?.performance?.score * 100;
    const fcp = data.lighthouseResult?.audits?.['first-contentful-paint']?.displayValue || 'N/A';
    const lcp = data.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue || 'N/A';
    const cls = data.lighthouseResult?.audits?.['cumulative-layout-shift']?.displayValue || 'N/A';
    const tbt = data.lighthouseResult?.audits?.['total-blocking-time']?.displayValue || 'N/A';

    await supabase.from("page_speed_results").insert({
      client_account_id: client.id,
      url: websiteUrl,
      score_mobile: score,
      core_web_vitals: data.lighthouseResult?.audits,
      raw_data: data,
    });

    const reportDate = formatDate();
    await createDeliverable(
      supabase,
      client.id,
      `Page Speed Analysis - ${reportDate}`,
      `# Page Speed Analysis Report

## Overall Performance Score: ${Math.round(score)}/100

*Generated on ${reportDate} for ${client.business_name}*

**Website Tested:** ${websiteUrl}

## Core Web Vitals

| Metric | Value | Status |
|--------|-------|--------|
| First Contentful Paint (FCP) | ${fcp} | ${parseFloat(fcp) < 1.8 ? '✅ Good' : parseFloat(fcp) < 3 ? '⚠️ Needs Improvement' : '❌ Poor'} |
| Largest Contentful Paint (LCP) | ${lcp} | ${parseFloat(lcp) < 2.5 ? '✅ Good' : parseFloat(lcp) < 4 ? '⚠️ Needs Improvement' : '❌ Poor'} |
| Cumulative Layout Shift (CLS) | ${cls} | ${parseFloat(cls) < 0.1 ? '✅ Good' : parseFloat(cls) < 0.25 ? '⚠️ Needs Improvement' : '❌ Poor'} |
| Total Blocking Time (TBT) | ${tbt} | ${parseFloat(tbt) < 200 ? '✅ Good' : parseFloat(tbt) < 600 ? '⚠️ Needs Improvement' : '❌ Poor'} |

## Performance Grade

${score >= 90 ? '🏆 **Excellent!** Your website performs very well.' :
  score >= 50 ? '⚠️ **Needs Improvement.** Several optimizations could help.' :
  '❌ **Poor Performance.** Significant improvements needed.'}

## Recommendations

${score < 90 ? `Based on your score, we recommend:
- Optimizing images and using modern formats (WebP)
- Minimizing JavaScript and CSS files
- Implementing lazy loading for images
- Using a Content Delivery Network (CDN)
- Enabling browser caching` : 'Your website is performing well! Continue monitoring and maintain current optimizations.'}

*Your marketing team will review these findings and prioritize improvements.*`,
      "report"
    );

    return { tested: true, scoreMobile: score, deliverableCreated: true };
  } catch (error) {
    console.error("PageSpeed test error:", error);
    return { tested: false, error: error instanceof Error ? error.message : "Unknown error", deliverableCreated: false };
  }
}
