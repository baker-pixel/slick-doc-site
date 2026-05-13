import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getClientBrandKit } from "../_shared/brandKit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_PAGES        = 25;
const PAGE_TIMEOUT_MS  = 12_000;
const AUDIT_TIMEOUT_MS = 85_000; // 5-second AI buffer within 90s limit
const RATE_LIMIT_MS    = 1_100;  // >1 second between requests
const MAX_HTML_CHARS   = 80_000;
const IMPORTANT_PATHS  = ["/services", "/products", "/blog", "/shop", "/contact", "/about", "/pricing"];

// ── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

let lastFetchAt = 0;
async function rateFetch(url: string, opts?: RequestInit): Promise<Response> {
  const wait = RATE_LIMIT_MS - (Date.now() - lastFetchAt);
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
  return fetch(url, { ...opts, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
}

function stripTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Types ────────────────────────────────────────────────────────────────────

interface RobotsData {
  present: boolean;
  disallowedAll: string[];
  sitemapUrls: string[];
  crawlDelay: number | null;
  blocksImportantPaths: string[];
}

interface SitemapData {
  present: boolean;
  url: string | null;
  urlCount: number;
  urls: string[];
  hasLastmod: boolean;
  categories: Record<string, string[]>;
}

interface PageSignals {
  url: string;
  status: number;
  failed: boolean;
  failReason?: string;
  title: string | null;
  titleLen: number;
  metaDesc: string | null;
  metaDescLen: number;
  h1Count: number;
  h1Tags: string[];
  h2Count: number;
  h2Tags: string[];
  wordCount: number;
  hasAuthorByline: boolean;
  hasDatePublished: boolean;
  isHttps: boolean;
  hasViewport: boolean;
  canonical: string | null;
  isNoindex: boolean;
  hasHreflang: boolean;
  schemaTypes: string[];
  hasOgImage: boolean;
  hasTwitterCard: boolean;
  imageCount: number;
  imagesMissingAlt: number;
  imagesWithBadNames: number;
  internalLinks: number;
  externalLinks: number;
  internalLinkUrls: string[];
  nonDescAnchors: number;
  hasPhone: boolean;
  hasAddress: boolean;
  hasMapEmbed: boolean;
  errors: string[];
  warnings: string[];
  notices: string[];
}

interface SiteAuditData {
  siteUrl: string;
  robots: RobotsData;
  sitemap: SitemapData;
  pages: PageSignals[];
  pagesFailed: string[];
  crawlDuration: number;
  pagesMissingTitle: string[];
  pagesMissingDesc: string[];
  dupTitles: { title: string; pages: string[] }[];
  dupDescs: { desc: string; pages: string[] }[];
  pagesMissingCanon: string[];
  pagesNoindex: string[];
  pagesThinContent: { url: string; words: number }[];
  pagesMissingH1: string[];
  pagesMultipleH1: string[];
  pagesNoSchema: string[];
  imgMissingAltTotal: number;
  httpsSitewide: boolean;
  orphanPages: string[];
  avgInternalLinks: number;
  cannibalRisks: { keyword: string; pages: string[] }[];
  pageSpeedSummary: { url: string; mobile: number; lcp: number | null; cls: number | null }[];
}

// ── Phase 1: Robots.txt ──────────────────────────────────────────────────────

async function fetchRobotsTxt(siteUrl: string): Promise<RobotsData> {
  const result: RobotsData = {
    present: false, disallowedAll: [], sitemapUrls: [],
    crawlDelay: null, blocksImportantPaths: [],
  };
  try {
    const res = await rateFetch(`${siteUrl}/robots.txt`);
    if (!res.ok) return result;
    result.present = true;
    const text = await res.text();
    let inAll = false, inGooglebot = false;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (/^user-agent:\s*\*/i.test(line)) { inAll = true; inGooglebot = false; continue; }
      if (/^user-agent:\s*googlebot/i.test(line)) { inGooglebot = true; inAll = false; continue; }
      if (/^user-agent:/i.test(line)) { inAll = false; inGooglebot = false; continue; }
      if ((inAll || inGooglebot) && /^disallow:/i.test(line)) {
        const path = line.replace(/^disallow:\s*/i, "").trim();
        if (path) result.disallowedAll.push(path);
      }
      if (/^crawl-delay:/i.test(line)) {
        const val = parseFloat(line.replace(/^crawl-delay:\s*/i, ""));
        if (!isNaN(val)) result.crawlDelay = val;
      }
      if (/^sitemap:/i.test(line)) {
        const url = line.replace(/^sitemap:\s*/i, "").trim();
        if (url) result.sitemapUrls.push(url);
      }
    }
    result.blocksImportantPaths = IMPORTANT_PATHS.filter(p =>
      result.disallowedAll.some(d => p.startsWith(d) || d === "/")
    );
  } catch { /* robots.txt unavailable */ }
  return result;
}

// ── Phase 1: Sitemap ─────────────────────────────────────────────────────────

async function parseSitemapXml(xml: string, baseUrl: string): Promise<{ urls: string[]; hasLastmod: boolean }> {
  const urls: string[] = [];
  let hasLastmod = false;
  if (xml.includes("<sitemapindex")) {
    // Sitemap index — fetch child sitemaps (up to 3)
    const childUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m => m[1].trim());
    for (const childUrl of childUrls.slice(0, 3)) {
      try {
        const res = await rateFetch(childUrl);
        if (res.ok) {
          const child = await res.text();
          const childParsed = await parseSitemapXml(child, baseUrl);
          urls.push(...childParsed.urls);
          if (childParsed.hasLastmod) hasLastmod = true;
          if (urls.length >= MAX_PAGES * 2) break;
        }
      } catch { /* skip */ }
    }
  } else {
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
      urls.push(m[1].trim());
    }
    hasLastmod = xml.includes("<lastmod>");
  }
  return { urls: urls.slice(0, MAX_PAGES * 2), hasLastmod };
}

function categorizeSitemapUrls(urls: string[]): Record<string, string[]> {
  const cats: Record<string, string[]> = {
    homepage: [], about: [], services: [], blog: [], contact: [], other: [],
  };
  for (const url of urls) {
    const path = new URL(url).pathname.toLowerCase();
    if (path === "/" || path === "") cats.homepage.push(url);
    else if (/\/(about|team|who-we-are)/.test(path)) cats.about.push(url);
    else if (/\/(service|product|offer|solution|package|pricing)/.test(path)) cats.services.push(url);
    else if (/\/(blog|news|article|post|resource|guide|tip)/.test(path)) cats.blog.push(url);
    else if (/\/(contact|get-in-touch|reach)/.test(path)) cats.contact.push(url);
    else cats.other.push(url);
  }
  return cats;
}

async function fetchSitemapData(siteUrl: string, robotsSitemaps: string[]): Promise<SitemapData> {
  const result: SitemapData = {
    present: false, url: null, urlCount: 0,
    urls: [], hasLastmod: false, categories: {},
  };
  const candidates = [
    ...robotsSitemaps,
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/sitemap_index.xml`,
    `${siteUrl}/sitemap_news.xml`,
  ];
  for (const candidate of candidates) {
    try {
      const res = await rateFetch(candidate);
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.includes("<url") && !xml.includes("<sitemap")) continue;
      const parsed = await parseSitemapXml(xml, siteUrl);
      result.present   = true;
      result.url       = candidate;
      result.urls      = parsed.urls;
      result.urlCount  = parsed.urls.length;
      result.hasLastmod = parsed.hasLastmod;
      result.categories = categorizeSitemapUrls(parsed.urls);
      break;
    } catch { continue; }
  }
  return result;
}

// ── Phase 1: Crawl Queue ─────────────────────────────────────────────────────

async function buildCrawlQueue(
  siteUrl: string, sitemap: SitemapData, robots: RobotsData
): Promise<string[]> {
  const isDisallowed = (url: string) => {
    try {
      const path = new URL(url).pathname;
      return robots.disallowedAll.some(d => d !== "" && path.startsWith(d));
    } catch { return false; }
  };

  const queue: string[] = [];
  const seen = new Set<string>();

  const add = (url: string) => {
    if (seen.has(url) || isDisallowed(url) || queue.length >= MAX_PAGES) return;
    seen.add(url);
    queue.push(url);
  };

  // Priority 1: homepage
  add(siteUrl);

  if (sitemap.present && sitemap.urls.length > 0) {
    const cats = sitemap.categories;
    // Priority 2-5: by category
    for (const u of [...(cats.about || []).slice(0, 1), ...(cats.services || []).slice(0, 4), ...(cats.contact || []).slice(0, 1)]) add(u);
    // Priority 6: blog posts (3 most recent)
    for (const u of (cats.blog || []).slice(0, 3)) add(u);
    // Priority 7: remaining for diversity
    for (const cat of Object.values(cats)) { for (const u of cat) add(u); }
  } else {
    // No sitemap — discover from homepage HTML
    try {
      const res = await rateFetch(siteUrl);
      if (res.ok) {
        const html = (await res.text()).slice(0, MAX_HTML_CHARS);
        const domain = new URL(siteUrl).hostname;
        for (const m of html.matchAll(/href=["']([^"'#?]+)["']/gi)) {
          const href = m[1];
          const full = href.startsWith("http") ? href :
            href.startsWith("/")   ? `${new URL(siteUrl).origin}${href}` : null;
          if (full && full.includes(domain)) add(full);
        }
      }
    } catch { /* homepage fetch failed */ }
  }

  return queue;
}

// ── Phase 2: Per-Page Signal Extraction ─────────────────────────────────────

function detectSchemaTypes(html: string): string[] {
  const types: string[] = [];
  for (const m of html.matchAll(/"@type"\s*:\s*"([^"]+)"/gi)) {
    types.push(m[1]);
  }
  return [...new Set(types)];
}

function extractPageSignals(url: string, html: string, status: number): PageSignals {
  const lower  = html.toLowerCase();
  const isHttps = url.startsWith("https://");

  // Title
  const titleM   = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title    = titleM ? titleM[1].trim() : null;
  const titleLen = title?.length ?? 0;

  // Meta description
  const metaM   = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
               ?? html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const metaDesc    = metaM ? metaM[1].trim() : null;
  const metaDescLen = metaDesc?.length ?? 0;

  // Headings
  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  const h1Tags    = h1Matches.map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  const h2Tags    = h2Matches.map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);

  // Content
  const text       = stripTags(html);
  const words      = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount  = words.length;
  const paras      = [...html.matchAll(/<p[^>]*>[\s\S]*?<\/p>/gi)];
  const sentences  = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const avgSentLen = sentences.length > 0 ? wordCount / sentences.length : 0;
  const hasAuthorByline   = /\b(author|by|written by|posted by)\b/i.test(html);
  const hasDatePublished  = html.includes('datePublished') || html.includes('date-published')
    || html.includes('article:published_time') || /\d{4}-\d{2}-\d{2}/.test(html.slice(0, 2000));

  // Technical
  const hasViewport = lower.includes('name="viewport"') || lower.includes("name='viewport'");
  const canonM     = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  const canonical  = canonM ? canonM[1].trim() : null;
  const isNoindex  = /content=["'][^"']*noindex/i.test(html);
  const hasHreflang = lower.includes('rel="alternate"') && lower.includes('hreflang');

  // Schema
  const schemaTypes = detectSchemaTypes(html);

  // Open Graph / Twitter
  const hasOgImage    = lower.includes('property="og:image"') || lower.includes("property='og:image'");
  const hasTwitterCard = lower.includes('name="twitter:card"') || lower.includes("name='twitter:card'");

  // Images
  const imgTags          = [...html.matchAll(/<img[^>]*>/gi)];
  const imageCount       = imgTags.length;
  const imagesMissingAlt = imgTags.filter(([t]) => !/alt=["'][^"']+["']/i.test(t) && !/alt=""/i.test(t)).length;
  const imagesWithBadNames = imgTags.filter(([t]) => /src=["'][^"']*\/(img|image|photo|pic|dsc|img_|p\d{4})[_\-.\d]*\.(jpg|jpeg|png|webp)/i.test(t)).length;

  // Links
  const allLinks = [...html.matchAll(/href=["']([^"'#]+)["']/gi)];
  const origin   = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  let internalLinks = 0, externalLinks = 0;
  const internalLinkUrls: string[] = [];
  let nonDescAnchors = 0;
  for (const match of allLinks) {
    const href  = match[1];
    const full  = href.startsWith("http") ? href : href.startsWith("/") ? `${new URL(url).origin}${href}` : null;
    if (!full) continue;
    try {
      const isInt = new URL(full).hostname === origin || new URL(full).hostname.endsWith(`.${origin}`);
      if (isInt) { internalLinks++; internalLinkUrls.push(full); }
      else externalLinks++;
    } catch { /* malformed */ }
  }
  // Non-descriptive anchors
  for (const m of html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)) {
    const anchor = m[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
    if (["click here", "here", "read more", "more", "learn more"].includes(anchor)) nonDescAnchors++;
  }

  // Local SEO
  const hasPhone   = /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/.test(text);
  const hasAddress = /(street|avenue|ave|blvd|boulevard|drive|dr|road|rd|lane|ln|way|court|ct)[,.\s]/i.test(text)
    || /\d{5}(-\d{4})?/.test(text);
  const hasMapEmbed = lower.includes("maps.google") || lower.includes("google.com/maps") || lower.includes("maps.googleapis");

  // Issue classification
  const errors: string[] = [];
  const warnings: string[] = [];
  const notices: string[] = [];

  if (!title) errors.push("Missing title tag");
  else if (titleLen < 30) warnings.push(`Title too short (${titleLen} chars, min 30)`);
  else if (titleLen > 60) warnings.push(`Title too long (${titleLen} chars, max 60)`);

  if (!metaDesc) warnings.push("Missing meta description");
  else if (metaDescLen < 70) notices.push(`Meta description short (${metaDescLen} chars, target 70-160)`);
  else if (metaDescLen > 160) warnings.push(`Meta description too long (${metaDescLen} chars)`);

  if (h1Tags.length === 0) errors.push("Missing H1 tag");
  else if (h1Tags.length > 1) warnings.push(`Multiple H1 tags (${h1Tags.length}) — use only one`);
  if (h1Tags.length === 1 && h1Tags[0] === title) notices.push("H1 identical to title — missed secondary keyword opportunity");
  if (wordCount > 300 && h2Tags.length === 0) warnings.push("No H2 headings on content page (300+ words)");

  if (!isHttps) errors.push("Not served over HTTPS");
  if (!hasViewport) errors.push("Missing viewport meta — mobile users affected");
  if (!canonical) warnings.push("Missing canonical tag — duplicate content risk");
  else if (canonical && !canonical.startsWith(new URL(url).origin)) errors.push(`Canonical points to different domain: ${canonical}`);
  if (isNoindex) errors.push("noindex detected — page excluded from search results");

  if (schemaTypes.length === 0) warnings.push("No structured data (schema.org) detected");
  if (!hasOgImage) notices.push("Missing og:image — affects social sharing previews");

  const altPct = imageCount > 0 ? imagesMissingAlt / imageCount : 0;
  if (altPct > 0.2) warnings.push(`${imagesMissingAlt}/${imageCount} images missing alt text (>${Math.round(altPct * 100)}%)`);
  else if (imagesMissingAlt > 0) notices.push(`${imagesMissingAlt} image(s) missing alt text`);
  if (imagesWithBadNames > 0) notices.push(`${imagesWithBadNames} image(s) with generic file names (img001.jpg etc.)`);

  if (wordCount < 150) errors.push(`Very thin content — ${wordCount} words (min 150)`);
  else if (wordCount < 300) warnings.push(`Thin content — ${wordCount} words (target 300+)`);

  if (nonDescAnchors > 0) notices.push(`${nonDescAnchors} non-descriptive anchor text(s) — "click here", "read more", etc.`);

  return {
    url, status, failed: false,
    title, titleLen, metaDesc, metaDescLen,
    h1Count: h1Tags.length, h1Tags, h2Count: h2Tags.length, h2Tags,
    wordCount, hasAuthorByline, hasDatePublished,
    isHttps, hasViewport, canonical, isNoindex, hasHreflang,
    schemaTypes, hasOgImage, hasTwitterCard,
    imageCount, imagesMissingAlt, imagesWithBadNames,
    internalLinks, externalLinks, internalLinkUrls, nonDescAnchors,
    hasPhone, hasAddress, hasMapEmbed,
    errors, warnings, notices,
  };
}

// ── Phase 2: PageSpeed ───────────────────────────────────────────────────────

async function fetchPageSpeedForUrl(url: string): Promise<{ mobile: number; lcp: number | null; cls: number | null } | null> {
  const key = Deno.env.get("PAGESPEED_API_KEY");
  if (!key) return null;
  try {
    const base = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
    const res  = await fetch(`${base}?url=${encodeURIComponent(url)}&strategy=mobile&key=${key}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data   = await res.json();
    const audits = data?.lighthouseResult?.audits ?? {};
    const mobile = Math.round((data?.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
    const lcp    = audits["largest-contentful-paint"]?.numericValue ?? null;
    const cls    = audits["cumulative-layout-shift"]?.numericValue ?? null;
    return { mobile, lcp: lcp ? Math.round(lcp) : null, cls: cls ? parseFloat(cls.toFixed(3)) : null };
  } catch {
    return null;
  }
}

// ── Phase 3: Site-Wide Aggregation ───────────────────────────────────────────

function aggregateSiteSignals(
  pages: PageSignals[],
  pagesFailed: string[],
  robots: RobotsData,
  sitemap: SitemapData,
  crawlDuration: number,
  pageSpeedSummary: SiteAuditData["pageSpeedSummary"],
): SiteAuditData {
  const pagesMissingTitle  = pages.filter(p => !p.title).map(p => p.url);
  const pagesMissingDesc   = pages.filter(p => !p.metaDesc).map(p => p.url);
  const pagesMissingCanon  = pages.filter(p => !p.canonical).map(p => p.url);
  const pagesNoindex       = pages.filter(p => p.isNoindex).map(p => p.url);
  const pagesThinContent   = pages.filter(p => p.wordCount < 300).map(p => ({ url: p.url, words: p.wordCount }));
  const pagesMissingH1     = pages.filter(p => p.h1Count === 0).map(p => p.url);
  const pagesMultipleH1    = pages.filter(p => p.h1Count > 1).map(p => p.url);
  const pagesNoSchema      = pages.filter(p => p.schemaTypes.length === 0).map(p => p.url);
  const imgMissingAltTotal = pages.reduce((s, p) => s + p.imagesMissingAlt, 0);
  const httpsSitewide      = pages.every(p => p.isHttps);
  const avgInternalLinks   = pages.length > 0
    ? Math.round(pages.reduce((s, p) => s + p.internalLinks, 0) / pages.length) : 0;

  // Duplicate title/desc detection
  const titleMap: Record<string, string[]> = {};
  const descMap:  Record<string, string[]> = {};
  for (const p of pages) {
    if (p.title) {
      titleMap[p.title] = titleMap[p.title] ?? [];
      titleMap[p.title].push(p.url);
    }
    if (p.metaDesc) {
      descMap[p.metaDesc] = descMap[p.metaDesc] ?? [];
      descMap[p.metaDesc].push(p.url);
    }
  }
  const dupTitles = Object.entries(titleMap).filter(([, ps]) => ps.length > 1).map(([title, pages]) => ({ title, pages }));
  const dupDescs  = Object.entries(descMap).filter(([, ps]) => ps.length > 1).map(([desc, pages]) => ({ desc, pages }));

  // Orphan page detection — pages no other crawled page links to
  const allInternalTargets = new Set(pages.flatMap(p => p.internalLinkUrls));
  const orphanPages = pages
    .filter(p => !allInternalTargets.has(p.url) && p.url !== pages[0]?.url)
    .map(p => p.url);

  // Keyword cannibalization — pages with very similar H1s or titles
  const cannibalRisks: SiteAuditData["cannibalRisks"] = [];
  const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 4);
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const a = pages[i], b = pages[j];
      const aTokens = new Set(tokenize(a.h1Tags[0] ?? a.title ?? ""));
      const bTokens = tokenize(b.h1Tags[0] ?? b.title ?? "");
      if (aTokens.size === 0) continue;
      const overlap = bTokens.filter(t => aTokens.has(t)).length;
      if (overlap >= 3 && overlap / Math.max(aTokens.size, bTokens.length) > 0.6) {
        const keyword = bTokens.filter(t => aTokens.has(t)).slice(0, 3).join(" ");
        cannibalRisks.push({ keyword, pages: [a.url, b.url] });
      }
    }
  }

  return {
    siteUrl: pages[0]?.url ?? "",
    robots, sitemap, pages, pagesFailed, crawlDuration,
    pagesMissingTitle, pagesMissingDesc, dupTitles, dupDescs,
    pagesMissingCanon, pagesNoindex, pagesThinContent,
    pagesMissingH1, pagesMultipleH1, pagesNoSchema,
    imgMissingAltTotal, httpsSitewide, orphanPages,
    avgInternalLinks, cannibalRisks, pageSpeedSummary,
  };
}

// ── Phase 4: AI Analysis ─────────────────────────────────────────────────────

function buildAIPrompt(
  data: SiteAuditData,
  client: Record<string, unknown>,
  brandVoiceContext?: string
): string {
  const cp   = (client.context_profile as Record<string, unknown> | null) ?? {};
  const biz  = client.business_name ?? "Unknown";
  const ind  = (cp.services as string[] | undefined)?.join(", ") ?? client.industry ?? "General";
  const loc  = cp.location ?? "";
  const aud  = cp.target_audience ?? "";

  // Worst 5 pages for detailed breakdown
  const worstPages = [...data.pages]
    .sort((a, b) => (b.errors.length + b.warnings.length) - (a.errors.length + a.warnings.length))
    .slice(0, 5);

  const fmt = (urls: string[]) => urls.slice(0, 5).map(u => `  - ${u}`).join("\n") || "  None";
  const fmtIssue = (p: PageSignals) =>
    `  URL: ${p.url}\n  Title: ${p.title ?? "MISSING"} (${p.titleLen}ch)\n  Meta: ${p.metaDesc ? `${p.metaDescLen}ch` : "MISSING"}\n  H1: ${p.h1Tags[0] ?? "MISSING"} (${p.h1Count} found)\n  Words: ${p.wordCount} | Schema: ${p.schemaTypes.join(",") || "none"}\n  Errors: ${p.errors.join("; ") || "none"}\n  Warnings: ${p.warnings.join("; ") || "none"}`;

  return `You are a senior technical SEO consultant who just completed a full site audit for a small business client.
Behave like a Semrush-level auditor. Return evidence-based insights grounded in the data below.

BUSINESS CONTEXT:
- Name: ${biz}
- Industry/Services: ${ind}
- Location: ${loc}
- Target Audience: ${aud}
${brandVoiceContext ? `\nBRAND VOICE (align keyword recommendations with actual brand language):\n${brandVoiceContext}\n` : ""}

SITE CRAWL SUMMARY:
- Pages crawled: ${data.pages.length} | Failed: ${data.pagesFailed.length}
- Crawl duration: ${(data.crawlDuration / 1000).toFixed(1)}s

CRAWLABILITY:
- robots.txt: ${data.robots.present ? "present" : "MISSING — critical"}
- Sitemap: ${data.sitemap.present ? `${data.sitemap.urlCount} URLs at ${data.sitemap.url}` : "MISSING"}
- Sitemap has lastmod dates: ${data.sitemap.hasLastmod}
- Pages blocking important paths: ${data.robots.blocksImportantPaths.join(", ") || "none"}
- Pages with noindex: ${data.pagesNoindex.length} → ${fmt(data.pagesNoindex)}

ON-PAGE:
- Pages missing title: ${data.pagesMissingTitle.length} → ${fmt(data.pagesMissingTitle)}
- Pages missing meta description: ${data.pagesMissingDesc.length} → ${fmt(data.pagesMissingDesc)}
- Duplicate titles: ${data.dupTitles.length} groups → ${data.dupTitles.slice(0, 3).map(d => `"${d.title.slice(0, 40)}" (${d.pages.length} pages)`).join("; ")}
- Pages missing H1: ${data.pagesMissingH1.length} → ${fmt(data.pagesMissingH1)}
- Pages with multiple H1s: ${data.pagesMultipleH1.length}
- Pages missing canonical: ${data.pagesMissingCanon.length}

CONTENT QUALITY:
- Pages with thin content (<300 words): ${data.pagesThinContent.length} → ${data.pagesThinContent.slice(0, 3).map(p => `${p.url} (${p.words}w)`).join("; ")}
- Pages with no schema markup: ${data.pagesNoSchema.length}
- Images missing alt text sitewide: ${data.imgMissingAltTotal}

TECHNICAL:
- HTTPS sitewide: ${data.httpsSitewide}
- PageSpeed (mobile): ${data.pageSpeedSummary.map(p => `${p.url.split("/")[2]} ${p.mobile}/100 LCP ${p.lcp ? `${(p.lcp / 1000).toFixed(1)}s` : "n/a"}`).join("; ") || "Not measured"}

SITE ARCHITECTURE:
- Avg internal links per page: ${data.avgInternalLinks}
- Orphan pages: ${data.orphanPages.length} → ${fmt(data.orphanPages)}
- Keyword cannibalisation risks: ${data.cannibalRisks.length}

WORST 5 PAGES — FULL BREAKDOWN:
${worstPages.map(fmtIssue).join("\n\n")}

CANNIBALIZATION RISKS:
${data.cannibalRisks.slice(0, 5).map(r => `- "${r.keyword}" → ${r.pages.slice(0, 2).join(" vs ")}`).join("\n") || "None detected"}

SCORING RUBRIC (weighted 100 points, max realistic 94):
- Crawlability & Indexation (25pts): robots.txt, sitemap, noindex, HTTPS, canonicals
- On-Page Optimisation (25pts): titles, descriptions, headings, URL structure
- Content Quality (20pts): word count, thin pages, E-E-A-T, freshness
- Technical Performance (15pts): Core Web Vitals, mobile, schema markup
- Site Architecture (15pts): internal linking, orphan pages, cannibalisation

Deduct proportionally. Never give 100.

Return ONLY valid JSON. No markdown. No extra text. Exact structure:
{
  "seo_score": number,
  "score_breakdown": { "crawlability": number, "on_page": number, "content_quality": number, "technical_performance": number, "site_architecture": number },
  "pages_crawled": number,
  "errors": [{ "issue": string, "affected_pages": string[], "impact": string }],
  "warnings": [{ "issue": string, "affected_pages": string[], "impact": string }],
  "notices": [{ "issue": string, "affected_pages": string[], "impact": string }],
  "working_well": string[],
  "quick_wins": [{ "action": string, "effort": "low|medium", "impact": "high|medium" }],
  "recommended_keywords": string[],
  "keyword_cannibalisation_risks": string[],
  "local_seo_gaps": string[],
  "executive_summary": string,
  "action_priority_list": [{ "priority": number, "action": string, "category": string, "estimated_effort": string }]
}`;
}

async function callGroqAI(prompt: string): Promise<AuditResult | null> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2500,
      temperature: 0,
      messages: [
        { role: "system", content: "You are a senior technical SEO consultant. Return only valid JSON. No markdown, no code fences, no commentary." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const raw  = data.choices?.[0]?.message?.content ?? "";
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned) as AuditResult;
  } catch {
    return null;
  }
}

// ── Progress updater ─────────────────────────────────────────────────────────

async function updateProgress(
  sb: ReturnType<typeof createClient>,
  taskId: string,
  message: string,
  pagesCrawled = 0,
) {
  await sb.from("workflow_tasks").update({
    status: "running",
    progress_message: message,
    pages_crawled: pagesCrawled,
  }).eq("id", taskId);
}

// ── Full Site Audit Orchestrator ─────────────────────────────────────────────

async function runFullSiteAudit(
  sb: ReturnType<typeof createClient>,
  task: Record<string, unknown>,
  client: Record<string, unknown>,
  taskId: string,
): Promise<Record<string, unknown>> {
  const auditStart = Date.now();
  const siteUrl    = (client.website_url as string).replace(/\/$/, "");

  // Step 1: robots.txt
  await updateProgress(sb, taskId, "Fetching robots.txt...");
  const robots = await fetchRobotsTxt(siteUrl);

  // Step 2: Sitemap
  await updateProgress(sb, taskId, "Discovering pages via sitemap...");
  const sitemap = await fetchSitemapData(siteUrl, robots.sitemapUrls);

  // Step 3: Crawl queue
  await updateProgress(sb, taskId, "Building crawl queue...");
  const queue = await buildCrawlQueue(siteUrl, sitemap, robots);

  console.log(`Crawl queue: ${queue.length} URLs`);

  // Step 4: Crawl each page
  const pages: PageSignals[] = [];
  const pagesFailed: string[] = [];
  const psUrls = queue.slice(0, 4); // PageSpeed for first 4 URLs

  for (let i = 0; i < queue.length; i++) {
    if (Date.now() - auditStart > AUDIT_TIMEOUT_MS) {
      console.warn("Audit timeout reached — returning partial results");
      break;
    }
    const url = queue[i];
    await updateProgress(sb, taskId, `Crawling page ${i + 1} of ${queue.length}...`, i + 1);
    try {
      const res  = await rateFetch(url);
      const html = (await res.text()).slice(0, MAX_HTML_CHARS);
      pages.push(extractPageSignals(url, html, res.status));
    } catch (e) {
      pagesFailed.push(url);
      pages.push({
        url, status: 0, failed: true,
        failReason: e instanceof Error ? e.message : "fetch failed",
        title: null, titleLen: 0, metaDesc: null, metaDescLen: 0,
        h1Count: 0, h1Tags: [], h2Count: 0, h2Tags: [],
        wordCount: 0, hasAuthorByline: false, hasDatePublished: false,
        isHttps: url.startsWith("https"), hasViewport: false, canonical: null,
        isNoindex: false, hasHreflang: false, schemaTypes: [], hasOgImage: false,
        hasTwitterCard: false, imageCount: 0, imagesMissingAlt: 0, imagesWithBadNames: 0,
        internalLinks: 0, externalLinks: 0, internalLinkUrls: [], nonDescAnchors: 0,
        hasPhone: false, hasAddress: false, hasMapEmbed: false,
        errors: ["Page could not be fetched"], warnings: [], notices: [],
      });
    }
  }

  // Step 5: PageSpeed (parallel, after crawl)
  await updateProgress(sb, taskId, "Fetching PageSpeed scores...", pages.length);
  const pageSpeedSummary: SiteAuditData["pageSpeedSummary"] = [];
  if (Date.now() - auditStart < AUDIT_TIMEOUT_MS - 20_000) {
    const psResults = await Promise.allSettled(psUrls.map(u => fetchPageSpeedForUrl(u)));
    psResults.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) {
        pageSpeedSummary.push({ url: psUrls[i], ...r.value });
      }
    });
  }

  // Step 6: Aggregate
  await updateProgress(sb, taskId, "Analysing signals...", pages.length);
  const siteData = aggregateSiteSignals(pages, pagesFailed, robots, sitemap, Date.now() - auditStart, pageSpeedSummary);

  // Step 7: AI
  await updateProgress(sb, taskId, "Generating AI report...", pages.length);

  let brandVoiceCtx: string | undefined;
  try {
    const kit = await getClientBrandKit(sb, (task as any).client_id as string, true);
    const parts: string[] = [];
    if (kit.voice.tone_descriptors.length > 0) parts.push(`Tone: ${kit.voice.tone_descriptors.join(", ")}`);
    if (kit.voice.audience_language.length > 0) parts.push(`Audience language: ${kit.voice.audience_language.join(", ")}`);
    if (kit.voice.messaging_pillars.length > 0) parts.push(`Messaging pillars: ${kit.voice.messaging_pillars.join(" | ")}`);
    if (parts.length > 0) brandVoiceCtx = parts.join("\n");
  } catch {
    // non-fatal
  }

  const prompt   = buildAIPrompt(siteData, client, brandVoiceCtx);
  const aiResult = await callGroqAI(prompt);

  const finalResult = {
    ...(aiResult ?? {
      seo_score: 50,
      score_breakdown: { crawlability: 12, on_page: 12, content_quality: 10, technical_performance: 8, site_architecture: 8 },
      pages_crawled: pages.length,
      errors: [], warnings: [], notices: [], working_well: [],
      quick_wins: [], recommended_keywords: [],
      keyword_cannibalisation_risks: [], local_seo_gaps: [],
      executive_summary: "AI analysis unavailable — see raw signals below.",
      action_priority_list: [],
    }),
    pages_crawled: pages.length,
    crawl_data: {
      robots_txt_present: siteData.robots.present,
      sitemap_present:    siteData.sitemap.present,
      sitemap_url_count:  siteData.sitemap.urlCount,
      pages_crawled:      pages.length,
      pages_failed:       pagesFailed,
      pages_noindex:      siteData.pagesNoindex,
      duplicate_titles:   siteData.dupTitles.slice(0, 10),
      orphan_pages:       siteData.orphanPages.slice(0, 10),
      thin_content_pages: siteData.pagesThinContent.slice(0, 10),
      pagespeed_summary:  siteData.pageSpeedSummary,
    },
  };

  await sb.from("workflow_tasks").update({
    status: "completed",
    result: finalResult,
    progress_message: `Audit complete — ${pages.length} pages crawled`,
    pages_crawled: pages.length,
  }).eq("id", taskId);

  // Also save to seo_audits table for history
  try {
    await sb.from("seo_audits").insert({
      client_account_id: task.client_id,
      audit_type: "full",
      results: finalResult,
      score: finalResult.seo_score,
    });
  } catch { /* non-fatal */ }

  return finalResult;
}

// ── Legacy Simple Audit ───────────────────────────────────────────────────────

async function runLegacyAudit(
  sb: ReturnType<typeof createClient>,
  task: Record<string, unknown>,
  client: Record<string, unknown>,
  taskId: string,
) {
  const siteUrl = client.website_url as string;
  let htmlSignals = "";
  let fetchFailed = false;

  if (siteUrl) {
    try {
      const siteRes = await fetch(siteUrl, {
        headers: { "User-Agent": "OrangeDoorSEOBot/1.0" },
        signal: AbortSignal.timeout(12_000),
      });
      if (siteRes.ok) {
        const html   = (await siteRes.text()).slice(0, MAX_HTML_CHARS);
        const lower  = html.toLowerCase();
        const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const metaM  = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        const h1Tags = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim());
        const imgM   = html.match(/<img[^>]*>/gi) || [];
        const imgsBad = imgM.filter(t => !/alt=["'][^"']+["']/i.test(t)).length;
        const hasVP  = lower.includes('name="viewport"');
        const hasSchema = lower.includes('"@type"') || lower.includes("application/ld+json");
        const hasOG  = lower.includes('property="og:');
        const hasCan = lower.includes('rel="canonical"');
        const text   = stripTags(html);
        const words  = text.split(/\s+/).filter(w => w.length > 0).length;
        const isHttps = siteUrl.startsWith("https://");

        htmlSignals = `
REAL HTML SIGNALS (crawled from ${siteUrl}):

On-Page SEO:
- Page Title: ${titleM ? `"${titleM[1].trim()}" (${titleM[1].trim().length} chars)` : "MISSING — critical"}
- Meta Description: ${metaM ? `"${metaM[1].trim().slice(0, 120)}" (${metaM[1].trim().length} chars)` : "MISSING — critical"}
- H1 Tags (${h1Tags.length}): ${h1Tags.slice(0, 3).join(" | ") || "NONE — critical"}
- Word Count: ${words} ${words < 300 ? "(too thin)" : "(ok)"}
- Images: ${imgM.length} total, ${imgsBad} missing alt text

Technical:
- HTTPS: ${isHttps ? "Yes" : "NO — critical"}
- Viewport Meta: ${hasVP ? "Present" : "MISSING — critical"}
- Canonical Tag: ${hasCan ? "Present" : "Missing"}
- Schema Markup: ${hasSchema ? "Present" : "Missing"}
- Open Graph: ${hasOG ? "Present" : "Missing"}

Content Preview: ${text.slice(0, 500)}`;
      } else {
        fetchFailed = true;
        htmlSignals = `\nNote: HTTP ${siteRes.status} — score conservatively.`;
      }
    } catch (e) {
      fetchFailed = true;
      htmlSignals = `\nNote: Fetch failed (${e instanceof Error ? e.message : "timeout"})`;
    }
  }

  const cp     = (client.context_profile as Record<string, unknown> | null) ?? {};
  const services = Array.isArray(cp.services) ? (cp.services as string[]).join(", ") : (client.industry ?? "General");
  const diffs    = Array.isArray(cp.differentiators) ? `Key differentiators: ${(cp.differentiators as string[]).join("; ")}.` : "";
  const audience = cp.target_audience ? `Target audience: ${cp.target_audience}.` : "";

  const prompt = `You are a senior SEO analyst. Produce a precise, evidence-based SEO audit.

BUSINESS CONTEXT:
- Name: ${client.business_name ?? "Unknown"}
- Industry/Services: ${services}
- Website: ${siteUrl ?? "Not provided"}
- Summary: ${client.website_summary ?? "No summary"}
${diffs}
${audience}
${htmlSignals}

SCORING RUBRIC:
- 85-100: All on-page elements present and optimised; schema; HTTPS; viewport; 600+ words; canonical
- 70-84: Most elements present with minor gaps
- 50-69: 1-2 critical elements missing; thin content
- 30-49: Multiple critical issues
- 0-29: Site uncrawlable or no SEO signals

${fetchFailed ? "IMPORTANT: Site could not be fetched. Score conservatively (max 40)." : "Base every point on the signals above. Do not fabricate."}

Return ONLY valid JSON:
{
  "seo_score": number,
  "working_well": string[],
  "needs_improvement": string[],
  "recommended_keywords": string[],
  "action_summary": string
}`;

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not configured");

  const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1000,
      temperature: 0,
      messages: [
        { role: "system", content: "You are a senior SEO analyst. Return valid JSON only. No markdown, no extra text." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!aiRes.ok) {
    const txt = await aiRes.text();
    if (aiRes.status === 429) throw new Error("Rate limit exceeded. Try again later.");
    throw new Error(`Groq API error ${aiRes.status}: ${txt.slice(0, 200)}`);
  }

  const aiData = await aiRes.json();
  const raw    = aiData.choices?.[0]?.message?.content ?? "";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
  } catch {
    throw new Error("Failed to parse AI response as JSON");
  }

  const result = {
    seo_score:            typeof parsed.seo_score === "number" ? parsed.seo_score : 50,
    working_well:         Array.isArray(parsed.working_well)       ? parsed.working_well.slice(0, 5) : [],
    needs_improvement:    Array.isArray(parsed.needs_improvement)   ? parsed.needs_improvement.slice(0, 6) : [],
    recommended_keywords: Array.isArray(parsed.recommended_keywords) ? parsed.recommended_keywords.slice(0, 8) : [],
    action_summary:       typeof parsed.action_summary === "string" ? parsed.action_summary : "",
    generated_at:         new Date().toISOString(),
  };

  await sb.from("workflow_tasks").update({ status: "completed", result }).eq("id", taskId);
}

// ── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let taskId: string | null = null;

  try {
    const body = await req.json();
    let task: Record<string, unknown>;

    if (body.task_id) {
      // Legacy: task was pre-created by caller
      taskId = body.task_id;
      const { data, error: te } = await sb.from("workflow_tasks").select("*").eq("id", taskId).single();
      if (te || !data) return new Response(JSON.stringify({ error: "Task not found" }), { status: 404, headers: corsHeaders });
      task = data as Record<string, unknown>;
    } else if (body.client_id) {
      // New: frontend passes client_id directly — create task with service_role (bypasses RLS)
      const { data, error: te } = await sb.from("workflow_tasks").insert({
        client_id: body.client_id,
        task_type: "seo",
        status: "running",
        audit_scope: "full",
        payload: { audit_scope: "full", analysis_type: "full_site_audit" },
      }).select().single();
      if (te || !data) throw new Error(`Failed to create task: ${te?.message}`);
      task = data as Record<string, unknown>;
      taskId = data.id as string;
    } else {
      return new Response(JSON.stringify({ error: "client_id or task_id required" }), { status: 400, headers: corsHeaders });
    }

    const { data: client, error: ce } = await sb.from("client_accounts")
      .select("business_name, industry, website_url, website_summary, context_profile")
      .eq("id", task.client_id).single();
    if (ce || !client) {
      await sb.from("workflow_tasks").update({ status: "failed", result: { error: "Client not found" } }).eq("id", taskId);
      return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: corsHeaders });
    }

    const isFullAudit = (task.payload as any)?.audit_scope === "full"
      || (task.payload as any)?.analysis_type === "full_site_audit"
      || task.audit_scope === "full";

    console.log(`Task ${taskId}: ${isFullAudit ? "FULL SITE AUDIT" : "legacy simple audit"} for ${(client as any).business_name}`);

    if (isFullAudit) {
      const result = await runFullSiteAudit(sb, task, client, taskId);
      return new Response(JSON.stringify({ success: true, task_id: taskId, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      await runLegacyAudit(sb, task, client, taskId);
      return new Response(JSON.stringify({ success: true, task_id: taskId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("run-seo-agent error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";

    await sb.from("automation_alerts").insert({
      alert_type: "function_error", severity: "error",
      title: "Error in run-seo-agent",
      message: msg, source: "run-seo-agent",
      metadata: { task_id: taskId, timestamp: new Date().toISOString() },
    }).catch(() => {});

    if (taskId) {
      await sb.from("workflow_tasks").update({ status: "failed", result: { error: msg } }).eq("id", taskId).catch(() => {});
    }

    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
