// Shared "fetch + parse + score" pipeline for the marketing-site lead-gen
// flows -- analyze-website's instant URL scan and generate-analysis's
// full-form path both need the same real, ground-truth facts about the
// submitted website. One implementation, so both flows can't drift into two
// different ideas of what's "true" about a site.
import { parseOnPage } from "./seoSignals.ts";
import { computeAiReadiness, type AiReadinessScores } from "./aiReadiness.ts";

const UA = "Mozilla/5.0 (compatible; OrangeDoorAnalyzer/1.0)";

export interface WebsiteAudit {
  html: string;
  signals: ReturnType<typeof parseOnPage>;
  readiness: AiReadinessScores;
}

export async function auditWebsite(url: string, timeoutMs = 12000): Promise<WebsiteAudit | null> {
  let html = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }
  if (!html) return null;

  const signals = parseOnPage(html, url);
  const readiness = await computeAiReadiness(html, url, signals);
  return { html, signals, readiness };
}
