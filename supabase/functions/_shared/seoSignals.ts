// SEO signal gathering (architecture v2, §03 tools). Pure data collection --
// no scoring, no LLM. Discovery respects robots.txt; rendering degrades
// honestly (a plain-fetch fallback is reported, never silently scored low).

const UA = "OrangeDoorSEOBot/1.0 (+https://orangedoormarketing.com/bot)";

export interface PageSignals {
  url: string;
  reachable: boolean;
  fetched_via: "render" | "plain";
  status_code: number | null;
  // on-page
  title: string;
  meta_description: string;
  h1_count: number;
  word_count: number;
  image_count: number;
  images_missing_alt: number;
  internal_links: number;
  external_links: number;
  has_viewport: boolean;
  has_canonical: boolean;
  has_schema: boolean;
  // Narrower than has_schema (which is "any JSON-LD present at all" -- true
  // even for e.g. a lone BreadcrumbList). These check actual @type values so
  // the AEO entity/FAQ fixes don't skip a page that has unrelated schema but
  // no real business-entity or FAQ markup.
  has_entity_schema: boolean;
  has_faq_schema: boolean;
  // Heading-phrased-as-question + its following text, extracted only when
  // both are genuinely present on the page -- feeds the FAQPage schema fix,
  // which must never mark up content that isn't actually on the page.
  qa_pairs: { question: string; answer: string }[];
  has_open_graph: boolean;
  looks_like_empty_spa: boolean;
  text_sample: string;
  // performance (null when not measured)
  performance: PageSpeed | null;
  // Crawl-health signals (v3). All optional so older fixtures and the free
  // scan (which has no network probe) stay valid; checks skip what is absent.
  /** HTTP status from the redirect-aware probe (may differ from status_code when rendered). */
  probe_status?: number | null;
  final_url?: string;
  redirect_hops?: number;
  redirect_loop?: boolean;
  /** Raw X-Robots-Tag response header. */
  x_robots_tag?: string;
  noindex?: boolean;
  canonical_href?: string | null;
  /** http:// subresources (img/script/stylesheet/iframe) on an https page. */
  mixed_content_count?: number;
  /** Same-site link targets found on the page, absolute, no hash, capped. */
  internal_link_urls?: string[];
}

export interface PageSpeed {
  mobile_score: number;
  desktop_score: number;
  lcp_ms: number | null;
  cls: number | null;
  tbt_ms: number | null;
}

// ── Discovery ────────────────────────────────────────────────────────────
async function fetchText(url: string, timeoutMs = 8000): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
    const body = res.ok ? await res.text() : "";
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: "" };
  }
}

/** Robots.txt disallow rules for our UA (and *). Minimal but honest. */
export async function getDisallows(origin: string): Promise<string[]> {
  const { ok, body } = await fetchText(`${origin}/robots.txt`);
  if (!ok || !body) return [];
  const lines = body.split("\n").map((l) => l.trim());
  const disallows: string[] = [];
  let applies = false;
  for (const line of lines) {
    const low = line.toLowerCase();
    if (low.startsWith("user-agent:")) {
      const agent = line.split(":")[1]?.trim().toLowerCase() ?? "";
      applies = agent === "*" || agent.includes("orangedoor");
    } else if (applies && low.startsWith("disallow:")) {
      const path = line.split(":")[1]?.trim();
      if (path) disallows.push(path);
    }
  }
  return disallows;
}

export function isAllowed(path: string, disallows: string[]): boolean {
  return !disallows.some((d) => d !== "" && path.startsWith(d));
}

function pageType(path: string): string {
  const p = path.toLowerCase();
  if (p === "/" || p === "") return "home";
  if (/\/blog|\/news|\/articles?|\/posts?\//.test(p)) return "blog";
  if (/\/services?|\/solutions?|\/products?|\/pricing|\/plans?/.test(p)) return "service";
  if (/\/about|\/team|\/company/.test(p)) return "about";
  if (/\/contact/.test(p)) return "contact";
  return "other";
}

/**
 * Discover pages to audit: prefer sitemap.xml, fall back to homepage internal
 * links. Select by importance (internal-link frequency proxy) while ensuring
 * each page type is represented, so a big blog can't crowd out the pricing
 * page. Returns [] with allowed=false semantics handled by caller.
 */
export async function discoverPages(siteUrl: string, cap = 12): Promise<{ pages: string[]; robots_blocked: boolean }> {
  let origin: string;
  try { origin = new URL(siteUrl).origin; } catch { return { pages: [], robots_blocked: false }; }

  const disallows = await getDisallows(origin);
  const home = new URL(siteUrl).pathname === "/" ? origin + "/" : siteUrl;

  const found = new Map<string, number>(); // path -> weight
  const add = (u: string, w = 1) => {
    try {
      const url = new URL(u, origin);
      if (url.origin !== origin) return;
      const path = url.pathname;
      if (!isAllowed(path, disallows)) return;
      if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|xml|css|js|mjs|ico|woff2?|json|webmanifest|txt|map)$/i.test(path)) return;
      found.set(path, (found.get(path) ?? 0) + w);
    } catch { /* skip bad urls */ }
  };
  add("/", 100); // homepage always, highest weight

  // Sitemap
  const sm = await fetchText(`${origin}/sitemap.xml`);
  if (sm.ok && sm.body) {
    const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
    // sitemap index -> pull first child sitemap
    if (locs.some((l) => l.endsWith(".xml"))) {
      const child = locs.find((l) => l.endsWith(".xml"));
      if (child) {
        const cs = await fetchText(child);
        [...cs.body.matchAll(/<loc>([^<]+)<\/loc>/gi)].forEach((m) => add(m[1].trim(), 2));
      }
    } else {
      locs.forEach((l) => add(l, 2));
    }
  }

  // Homepage internal links (importance proxy: link frequency)
  const hp = await fetchText(home);
  if (hp.ok) {
    [...hp.body.matchAll(/href=["']([^"'#?]+)["']/gi)].forEach((m) => add(m[1], 1));
  } else if (found.size <= 1) {
    // homepage unreachable and nothing from sitemap
    return { pages: [], robots_blocked: false };
  }

  // Select: homepage first, then top by weight, ensuring type coverage.
  const paths = [...found.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const selected: string[] = [];
  const typesSeen = new Set<string>();
  for (const p of paths) {
    if (selected.length >= cap) break;
    const t = pageType(p);
    // take if under cap and (type not yet seen OR we still have room)
    if (!typesSeen.has(t) || selected.length < cap) {
      selected.push(p);
      typesSeen.add(t);
    }
  }
  return { pages: selected.slice(0, cap).map((p) => origin + p), robots_blocked: disallows.length > 0 && selected.length === 0 };
}

// ── Redirect-aware probe ──────────────────────────────────────────────────
export interface ProbeResult {
  status: number;          // 0 = network error / timeout (unknown, never "broken")
  final_url: string;
  hops: number;
  chain: string[];
  loop: boolean;
  x_robots_tag: string;
  error: boolean;
}

/** Follows redirects by hand so chains and loops are visible. Never reads bodies. */
export async function probeUrl(url: string, timeoutMs = 6000, maxHops = 6): Promise<ProbeResult> {
  const chain = [url];
  let cur = url;
  for (let i = 0; i <= maxHops; i++) {
    let res: Response;
    try {
      res = await fetch(cur, { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      return { status: 0, final_url: cur, hops: chain.length - 1, chain, loop: false, x_robots_tag: "", error: true };
    }
    const loc = res.headers.get("location");
    const xr = res.headers.get("x-robots-tag") ?? "";
    res.body?.cancel().catch(() => {});
    if (res.status >= 300 && res.status < 400 && loc) {
      let next: string;
      try { next = new URL(loc, cur).toString(); } catch {
        return { status: res.status, final_url: cur, hops: chain.length - 1, chain, loop: false, x_robots_tag: xr, error: false };
      }
      if (chain.includes(next)) return { status: res.status, final_url: next, hops: chain.length, chain: [...chain, next], loop: true, x_robots_tag: xr, error: false };
      chain.push(next);
      cur = next;
      continue;
    }
    return { status: res.status, final_url: cur, hops: chain.length - 1, chain, loop: false, x_robots_tag: xr, error: false };
  }
  return { status: 310, final_url: cur, hops: chain.length - 1, chain, loop: true, x_robots_tag: "", error: false };
}

// ── Rendering ─────────────────────────────────────────────────────────────
export async function fetchHtml(url: string): Promise<{ html: string; via: "render" | "plain"; status: number }> {
  const key = Deno.env.get("BROWSERLESS_API_KEY");
  if (key) {
    try {
      const res = await fetch(`https://chrome.browserless.io/content?token=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, waitFor: 2000 }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return { html: await res.text(), via: "render", status: 200 };
    } catch { /* fall through to plain */ }
  }
  const r = await fetchText(url, 12000);
  return { html: r.body, via: "plain", status: r.status };
}

// ── PageSpeed ───────────────────────────────────────────────────────────────
async function getPageSpeed(url: string): Promise<PageSpeed | null> {
  const key = Deno.env.get("PAGESPEED_API_KEY");
  if (!key) return null; // caller emits an explicit "not measured" finding
  try {
    const base = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
    // Slow sites take PageSpeed longer to analyze -- give it room, since those
    // are exactly the sites whose performance score matters most.
    const [m, d] = await Promise.all([
      fetch(`${base}?url=${encodeURIComponent(url)}&strategy=mobile&key=${key}`, { signal: AbortSignal.timeout(55000) }),
      fetch(`${base}?url=${encodeURIComponent(url)}&strategy=desktop&key=${key}`, { signal: AbortSignal.timeout(55000) }),
    ]);
    if (!m.ok && !d.ok) return null;
    const md = m.ok ? await m.json() : null;
    const dd = d.ok ? await d.json() : null;
    const a = md?.lighthouseResult?.audits ?? {};
    return {
      mobile_score: Math.round((md?.lighthouseResult?.categories?.performance?.score ?? 0) * 100),
      desktop_score: Math.round((dd?.lighthouseResult?.categories?.performance?.score ?? 0) * 100),
      lcp_ms: a["largest-contentful-paint"]?.numericValue ?? null,
      cls: a["cumulative-layout-shift"]?.numericValue ?? null,
      tbt_ms: a["total-blocking-time"]?.numericValue ?? null,
    };
  } catch {
    return null;
  }
}

// ── Structured-data introspection ───────────────────────────────────────────
// Pulls @type values out of every JSON-LD block so callers can tell "has any
// schema" apart from "has the specific entity/FAQ schema that matters here."
function jsonLdTypes(html: string): Set<string> {
  const types = new Set<string>();
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const t = (item as Record<string, unknown>)["@type"];
        (Array.isArray(t) ? t : [t]).forEach((x) => { if (typeof x === "string") types.add(x.toLowerCase()); });
      }
    } catch {
      // malformed JSON-LD -- skip it, don't let one bad block sink detection
    }
  }
  return types;
}

// Extracts real on-page Q&A: a heading phrased as a question, paired with the
// text that follows it up to the next heading. Only content actually visible
// on the page qualifies -- this is what makes the FAQPage fix safe to
// auto-apply (it can't invent a question or answer the business never wrote).
function extractQaPairs(html: string): { question: string; answer: string }[] {
  const pairs: { question: string; answer: string }[] = [];
  const headingRe = /<h[234][^>]*>([\s\S]*?)<\/h[234]>/gi;
  const matches = [...html.matchAll(headingRe)];
  for (let i = 0; i < matches.length && pairs.length < 8; i++) {
    const question = matches[i][1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!question.endsWith("?") || question.length < 10 || question.length > 200) continue;
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : start + 2000;
    const answer = html.slice(start, end).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
    if (answer.length < 20) continue; // no real answer text -- just a bare heading, don't fabricate one
    pairs.push({ question, answer });
  }
  return pairs;
}

// ── Crawl-health parse (pure) ─────────────────────────────────────────────
const ASSET_EXT = /\.(pdf|jpg|jpeg|png|gif|svg|webp|avif|zip|xml|css|js|mjs|ico|woff2?|json|webmanifest|txt|map|mp4|mp3|docx?|xlsx?)$/i;
const stripWww = (h: string) => h.toLowerCase().replace(/^www\./, "");

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[1] ?? m[2] ?? "") : null;
}

/** Comparable form of a URL: no scheme, no www, no query/hash, no trailing slash. */
export function normalizeForCompare(u: string, base?: string): string | null {
  try {
    const url = new URL(u, base);
    const path = url.pathname.replace(/\/+$/, "") || "";
    return `${stripWww(url.hostname)}${path}`.toLowerCase();
  } catch { return null; }
}

export function parseCrawlHealth(html: string, url: string) {
  let noindex = false;
  let canonical_href: string | null = null;
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const name = (attr(m[0], "name") ?? "").toLowerCase();
    if ((name === "robots" || name === "googlebot") && /noindex/i.test(attr(m[0], "content") ?? "")) noindex = true;
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if ((attr(m[0], "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical")) {
      canonical_href = attr(m[0], "href")?.trim() || null;
      break;
    }
  }

  let mixed_content_count = 0;
  if (url.startsWith("https://")) {
    mixed_content_count += (html.match(/<(?:img|script|iframe|source|video|audio)\b[^>]*\ssrc\s*=\s*["']http:\/\//gi) ?? []).length;
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
      if (/stylesheet/i.test(attr(m[0], "rel") ?? "") && /^http:\/\//i.test(attr(m[0], "href") ?? "")) mixed_content_count++;
    }
  }

  const internal_link_urls: string[] = [];
  try {
    const host = stripWww(new URL(url).hostname);
    const seen = new Set<string>();
    for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
      const href = (attr(m[0], "href") ?? "").trim();
      if (!href || /^(#|mailto:|tel:|sms:|javascript:|data:)/i.test(href)) continue;
      let abs: URL;
      try { abs = new URL(href, url); } catch { continue; }
      if (!/^https?:$/.test(abs.protocol) || stripWww(abs.hostname) !== host) continue;
      if (ASSET_EXT.test(abs.pathname)) continue;
      abs.hash = "";
      const key = abs.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      internal_link_urls.push(key);
      if (internal_link_urls.length >= 100) break;
    }
  } catch { /* bad base url: no links */ }

  return { noindex, canonical_href, mixed_content_count, internal_link_urls };
}

// ── On-page parse ─────────────────────────────────────────────────────────
export function parseOnPage(html: string, url: string) {
  const low = html.toLowerCase();
  const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "").trim();
  const meta_description = (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? "").trim();
  const h1_count = (html.match(/<h1[\s>]/gi) ?? []).length;
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const word_count = text ? text.split(/\s+/).length : 0;
  const imgs = html.match(/<img[^>]*>/gi) ?? [];
  const images_missing_alt = imgs.filter((i) => !i.includes("alt=") || i.includes('alt=""')).length;
  let internal = 0, external = 0;
  const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const h = m[1];
    if (h.startsWith("/") || (host && h.includes(host))) internal++;
    else if (h.startsWith("http")) external++;
  }
  const bodyText = low.match(/<body[\s\S]*<\/body>/)?.[0] ?? low;
  const body_word_count = bodyText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().split(/\s+/).length;
  const ldTypes = jsonLdTypes(html);
  const has_entity_schema = [...ldTypes].some((t) => t.includes("localbusiness") || t.includes("organization") || t.includes("professionalservice"));
  const has_faq_schema = [...ldTypes].some((t) => t.includes("faqpage"));
  const crawl = parseCrawlHealth(html, url);
  return {
    ...crawl,
    title, meta_description, h1_count, word_count,
    image_count: imgs.length, images_missing_alt,
    internal_links: internal, external_links: external,
    has_viewport: low.includes('name="viewport"') || low.includes("name='viewport'"),
    has_canonical: low.includes('rel="canonical"') || low.includes("rel='canonical'"),
    has_schema: low.includes('"@type"') || low.includes("application/ld+json"),
    has_entity_schema, has_faq_schema,
    qa_pairs: has_faq_schema ? [] : extractQaPairs(html), // already marked up -- nothing to extract for
    has_open_graph: low.includes('property="og:') || low.includes("property='og:"),
    // A rendered page with almost no body text is an un-rendered SPA shell --
    // flagged so it never silently scores low. Historically this required
    // >3 <script> tags as corroborating evidence, but a modern single-bundle
    // app (Vite/CRA/Next/Gatsby) often ships just one <script type="module">
    // and a near-empty mount div, which that threshold missed entirely.
    looks_like_empty_spa: body_word_count < 40 && (
      (html.match(/<script/gi)?.length ?? 0) > 3 ||
      /id=["'](root|app|__next|___gatsby)["']/i.test(html)
    ),
    text_sample: text.slice(0, 1500),
  };
}

// withPageSpeed is capped by the caller to a few pages -- PageSpeed is the
// slow leg (~20-40s/page) and performance is largely site-wide, so we sample
// it rather than run it on every page and blow the request timeout.
export async function gatherPageSignals(url: string, withPageSpeed = true): Promise<PageSignals> {
  const [{ html, via, status }, probe] = await Promise.all([fetchHtml(url), probeUrl(url)]);
  const probeFields = {
    probe_status: probe.error ? null : probe.status,
    final_url: probe.final_url,
    redirect_hops: probe.hops,
    redirect_loop: probe.loop,
    x_robots_tag: probe.x_robots_tag,
  };
  if (!html) {
    return {
      url, reachable: false, fetched_via: via, status_code: status || null,
      title: "", meta_description: "", h1_count: 0, word_count: 0, image_count: 0,
      images_missing_alt: 0, internal_links: 0, external_links: 0, has_viewport: false,
      has_canonical: false, has_schema: false, has_entity_schema: false, has_faq_schema: false, qa_pairs: [],
      has_open_graph: false,
      looks_like_empty_spa: false, text_sample: "", performance: null,
      ...probeFields,
    };
  }
  const parsed = parseOnPage(html, url);
  const performance = withPageSpeed ? await getPageSpeed(url) : null;
  const headerNoindex = /noindex/i.test(probe.x_robots_tag);
  return { url, reachable: true, fetched_via: via, status_code: status, ...parsed, performance, ...probeFields, noindex: parsed.noindex || headerNoindex };
}
