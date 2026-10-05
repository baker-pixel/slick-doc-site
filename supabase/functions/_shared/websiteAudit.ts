// Shared "fetch + parse + score" pipeline for the marketing-site lead-gen
// flows -- analyze-website's instant URL scan and generate-analysis's
// full-form path both need the same real, ground-truth facts about the
// submitted website. One implementation, so both flows can't drift into two
// different ideas of what's "true" about a site.
import { parseOnPage, discoverPages } from "./seoSignals.ts";
import { computeAiReadiness, type AiReadinessScores } from "./aiReadiness.ts";
import { isPublicHttpUrl } from "./urlSafety.ts";

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

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type AuditFailureReason = "timeout" | "blocked" | "not_found" | "server_error" | "unreachable" | "not_html" | "empty" | "invalid_url";

export type AuditResult =
  | { ok: true; audit: WebsiteAudit }
  | { ok: false; reason: AuditFailureReason; status?: number };

// Visitor-facing wording for each failure, so nobody is left staring at a
// generic "failed to fetch".
export const AUDIT_FAILURE_MESSAGES: Record<AuditFailureReason, string> = {
  timeout: "That website took too long to respond. It may be down or very slow right now. Please try again in a few minutes.",
  blocked: "That website blocks automated visitors, so we couldn't scan it automatically. Book a free call and we'll review it by hand.",
  not_found: "We couldn't find a page at that address. Please check the spelling and try again.",
  server_error: "That website returned an error when we tried to open it. Please try again shortly.",
  unreachable: "We couldn't connect to that website. Please check the address and try again.",
  not_html: "That address doesn't look like a regular web page. Please enter your website's home page.",
  invalid_url: "That doesn't look like a public website address. Please enter your website's home page, like https://yourbusiness.com.",
  empty: "That page came back empty, so there was nothing to analyze. Please enter your website's home page.",
};

type FetchOutcome =
  | { ok: true; html: string }
  | { ok: false; reason: AuditFailureReason; status?: number };

async function fetchHomepage(url: string, userAgent: string, timeoutMs: number): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const status = res.status;
      if (status === 401 || status === 403 || status === 429) return { ok: false, reason: "blocked", status };
      if (status === 404 || status === 410) return { ok: false, reason: "not_found", status };
      return { ok: false, reason: "server_error", status };
    }
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml|text/i.test(type)) return { ok: false, reason: "not_html" };
    const html = await res.text();
    if (!html.trim()) return { ok: false, reason: "empty" };
    return { ok: true, html };
  } catch (e) {
    const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, reason: timedOut ? "timeout" : "unreachable" };
  }
}

// www <-> non-www twin of a URL, for sites that only answer on one of them.
function wwwTwin(url: string): string | null {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Same audit as auditWebsite, but says *why* it failed. Retries only where a
 * retry can actually help: a browser User-Agent when the site is blocking
 * bots, and the www/non-www twin when the host is unreachable. A timeout is
 * not retried -- a site that slow is down, and the visitor is waiting.
 */
export async function auditWebsiteDetailed(url: string, timeoutMs = 12000): Promise<AuditResult> {
  // Never fetch localhost / private / metadata addresses on a visitor's behalf.
  if (!isPublicHttpUrl(url)) return { ok: false, reason: "invalid_url" };

  let outcome = await fetchHomepage(url, UA, timeoutMs);
  let finalUrl = url;

  if (!outcome.ok && outcome.reason === "blocked") {
    outcome = await fetchHomepage(url, BROWSER_UA, 8000);
  }
  if (!outcome.ok && outcome.reason === "unreachable") {
    const twin = wwwTwin(url);
    if (twin) {
      const retry = await fetchHomepage(twin, UA, 8000);
      if (retry.ok) {
        outcome = retry;
        finalUrl = twin;
      }
    }
  }
  if (!outcome.ok) return { ok: false, reason: outcome.reason, status: outcome.status };

  const html = outcome.html;
  const signals = parseOnPage(html, finalUrl);
  const readiness = await computeAiReadiness(html, finalUrl, signals);
  const additionalPages = await fetchAdditionalPages(finalUrl);
  return { ok: true, audit: { html, signals, readiness, additionalPages } };
}

export async function auditWebsite(url: string, timeoutMs = 12000): Promise<WebsiteAudit | null> {
  const result = await auditWebsiteDetailed(url, timeoutMs);
  return result.ok ? result.audit : null;
}
