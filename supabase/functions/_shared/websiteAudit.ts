// Shared "fetch + parse + score" pipeline for the marketing-site lead-gen
// flows -- analyze-website's instant URL scan and generate-analysis's
// full-form path both need the same real, ground-truth facts about the
// submitted website. One implementation, so both flows can't drift into two
// different ideas of what's "true" about a site.
import { parseOnPage, discoverPages } from "./seoSignals.ts";
import { computeAiReadiness, type AiReadinessScores } from "./aiReadiness.ts";

const UA = "Mozilla/5.0 (compatible; OrangeDoorAnalyzer/1.0)";

// Homepage + up to this many more real pages (about/services/contact, via
// the same sitemap-first discovery seo-audit uses), fetched purely to give
// context_profile extraction more than one page of ground truth to draw
// from. Kept small -- this runs synchronously in the onboarding/lead flow,
// not a background job.
const CONTEXT_PAGE_CAP = 5;
const CONTEXT_PAGE_CHAR_CAP = 1800;

export interface WebsiteAudit {
  html: string;
  signals: ReturnType<typeof parseOnPage>;
  readiness: AiReadinessScores;
  additionalPages: { url: string; text: string }[];
}

function stripToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageText(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return stripToText(await res.text()).slice(0, CONTEXT_PAGE_CHAR_CAP);
  } catch {
    return null;
  }
}

/**
 * Best-effort crawl of a few more real pages beyond the homepage, so
 * context_profile extraction isn't guessing a whole business off one page.
 * Never throws and never blocks the main audit on a slow/blocked site --
 * worst case this returns [] and callers fall back to homepage-only, same
 * as before this existed.
 */
async function fetchAdditionalPages(homeUrl: string): Promise<{ url: string; text: string }[]> {
  try {
    const { pages } = await discoverPages(homeUrl, CONTEXT_PAGE_CAP);
    const extra = pages.filter((p) => {
      try {
        return new URL(p).pathname !== "/";
      } catch {
        return true;
      }
    });
    const results = await Promise.allSettled(
      extra.map(async (u) => ({ url: u, text: await fetchPageText(u) })),
    );
    return results
      .filter((r): r is PromiseFulfilledResult<{ url: string; text: string | null }> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((r): r is { url: string; text: string } => !!r.text && r.text.length > 40);
  } catch {
    return [];
  }
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
  const additionalPages = await fetchAdditionalPages(url);
  return { html, signals, readiness, additionalPages };
}
