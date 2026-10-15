// URL rules for the site crawler. Pure: no network, so every rule is unit-tested.
// Goal: one stable key per real page (so a page is fetched once), and a firm
// "don't go there" for URLs that are infinite or useless to crawl.

const TRACKING_PARAMS = /^(utm_[a-z]+|gclid|gbraid|wbraid|fbclid|msclkid|mc_cid|mc_eid|_ga|_gl|yclid|igshid|ref|ref_src|sessionid|sid|phpsessid|jsessionid|replytocom|share|print)$/i;
const ASSET_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|zip|gz|tar|rar|7z|css|js|mjs|map|json|xml|txt|csv|woff2?|ttf|eot|otf|mp3|mp4|mov|avi|wmv|webm|docx?|xlsx?|pptx?|apk|dmg|exe)$/i;
// Paths that are system plumbing or never worth auditing.
const SKIP_PATH = /^\/(wp-admin|wp-json|wp-login\.php|wp-content\/(uploads|plugins|themes|cache)|wp-includes|xmlrpc\.php|cdn-cgi|feed|comments\/feed|cart|checkout|my-account|account|login|logout|signin|signout|register|admin|api|graphql|_next|static\/js)(\/|$)|\/feed\/?$|\/(attachment|trackback)(\/|$)/i;
// Infinite-space patterns: calendars, deep pagination, faceted search.
const TRAP_PATH = /\/(page|paged|p)\/\d{3,}(\/|$)|\/\d{4}\/\d{2}\/\d{2}\/(.+\/){2,}|\/(calendar|events)\/\d{4}-\d{2}(-\d{2})?(\/|$)/i;
const MAX_QUERY_PARAMS = 3;
const MAX_URL_LENGTH = 300;
const MAX_PATH_SEGMENTS = 10;

export const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, "");

/** Same site = same host ignoring "www." (matches how the audit already treats variants). */
export function sameSite(a: string, b: string): boolean {
  try { return bareHost(new URL(a).hostname) === bareHost(new URL(b).hostname); } catch { return false; }
}

/**
 * Canonical key for a URL, or null if it must not be crawled at all
 * (not http/https, an asset, system path, too long). Two spellings of the same
 * page return the same key: case in the host, www, #fragment, tracking params,
 * param order, trailing slash, /index.html, default ports.
 */
export function urlKey(raw: string, base?: string): string | null {
  let u: URL;
  try { u = new URL(raw, base); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (raw.length > MAX_URL_LENGTH * 2) return null;

  let path = u.pathname.replace(/\/{2,}/g, "/");
  path = path.replace(/\/index\.(html?|php|aspx?)$/i, "/");
  if (ASSET_EXT.test(path)) return null;
  if (SKIP_PATH.test(path)) return null;
  if (path.length > 1) path = path.replace(/\/+$/, "");

  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : "";
  const key = `${bareHost(u.hostname)}${path}${query}`;
  return key.length > MAX_URL_LENGTH ? null : key;
}

/** The URL to actually request for a key: original scheme and host, tracking params removed, fragment dropped. */
export function fetchableUrl(raw: string, base?: string): string | null {
  if (urlKey(raw, base) === null) return null;
  const u = new URL(raw, base);
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  u.pathname = u.pathname.replace(/\/{2,}/g, "/");
  return u.toString();
}

/** URLs that would make the crawl infinite or waste it: too many params, deep archives, runaway nesting. */
export function isTrap(raw: string, base?: string): boolean {
  let u: URL;
  try { u = new URL(raw, base); } catch { return true; }
  const meaningful = [...u.searchParams.keys()].filter((k) => !TRACKING_PARAMS.test(k));
  if (meaningful.length > MAX_QUERY_PARAMS) return true;
  if (u.pathname.split("/").filter(Boolean).length > MAX_PATH_SEGMENTS) return true;
  if (/(.)\1{9,}/.test(u.pathname)) return true;
  // The same path segment repeating (/a/b/a/b/a/b) is a relative-link loop.
  const segs = u.pathname.split("/").filter(Boolean);
  for (let i = 0; i + 5 < segs.length; i++) {
    if (segs[i] === segs[i + 2] && segs[i + 2] === segs[i + 4] && segs[i + 1] === segs[i + 3]) return true;
  }
  return TRAP_PATH.test(u.pathname);
}

/** Path with its query, used to cap runaway ?param variants of one page. */
export function pathOnly(raw: string, base?: string): string {
  try { const u = new URL(raw, base); return `${bareHost(u.hostname)}${u.pathname.replace(/\/+$/, "") || "/"}`; } catch { return raw; }
}

export type PageType = "home" | "service" | "product" | "blog" | "about" | "contact" | "location" | "pricing" | "faq" | "legal" | "other";

/** Rough page type from the path alone. Used to order the crawl and to keep important pages in a capped crawl. */
export function pageTypeOf(raw: string, base?: string): PageType {
  let p: string;
  try { p = new URL(raw, base).pathname.toLowerCase(); } catch { return "other"; }
  if (p === "/" || p === "") return "home";
  if (/\/(privacy|terms|cookie|disclaimer|legal|gdpr|accessibility|sitemap)/.test(p)) return "legal";
  if (/\/(contact|get-in-touch|book|booking|quote|appointment|schedule)/.test(p)) return "contact";
  if (/\/(about|team|our-team|our-story|company|who-we-are|meet|mission|leadership|careers?)/.test(p)) return "about";
  if (/\/(pricing|plans?|packages|rates|cost)/.test(p)) return "pricing";
  if (/\/(faq|faqs|questions|help)/.test(p)) return "faq";
  if (/\/(locations?|areas?-we-serve|service-areas?|near-me|branches)/.test(p)) return "location";
  if (/\/(services?|solutions?|what-we-do|offerings?|treatments?|practice-areas?|capabilities|assessments?)/.test(p)) return "service";
  if (/\/(products?|shop|store|catalog|collections?)/.test(p)) return "product";
  if (/\/(blog|news|articles?|insights|resources|posts?|stories|press|journal|learn)(\/|$)|\/\d{4}\/\d{2}\//.test(p)) return "blog";
  return "other";
}

const TYPE_RANK: Record<PageType, number> = {
  home: 0, contact: 1, service: 2, pricing: 2, product: 3, about: 3, location: 3, faq: 4, other: 5, blog: 6, legal: 7,
};

/**
 * Lower = crawled earlier. Shallow, important page types first, so a crawl that
 * hits its cap or is cancelled has still read the pages that matter most.
 */
export function crawlPriority(type: PageType, depth: number, source: "seed" | "sitemap" | "link"): number {
  const src = source === "seed" ? 0 : source === "sitemap" ? 1 : 2;
  return TYPE_RANK[type] * 100 + Math.min(depth, 9) * 10 + src;
}
