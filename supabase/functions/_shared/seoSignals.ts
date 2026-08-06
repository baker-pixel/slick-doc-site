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
  has_open_graph: boolean;
  looks_like_empty_spa: boolean;
  text_sample: string;
  // performance (null when not measured)
  performance: PageSpeed | null;
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
async function getDisallows(origin: string): Promise<string[]> {
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

function isAllowed(path: string, disallows: string[]): boolean {
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
  return {
    title, meta_description, h1_count, word_count,
    image_count: imgs.length, images_missing_alt,
    internal_links: internal, external_links: external,
    has_viewport: low.includes('name="viewport"') || low.includes("name='viewport'"),
    has_canonical: low.includes('rel="canonical"') || low.includes("rel='canonical'"),
    has_schema: low.includes('"@type"') || low.includes("application/ld+json"),
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
  const { html, via, status } = await fetchHtml(url);
  if (!html) {
    return {
      url, reachable: false, fetched_via: via, status_code: status || null,
      title: "", meta_description: "", h1_count: 0, word_count: 0, image_count: 0,
      images_missing_alt: 0, internal_links: 0, external_links: 0, has_viewport: false,
      has_canonical: false, has_schema: false, has_open_graph: false,
      looks_like_empty_spa: false, text_sample: "", performance: null,
    };
  }
  const parsed = parseOnPage(html, url);
  const performance = withPageSpeed ? await getPageSpeed(url) : null;
  return { url, reachable: true, fetched_via: via, status_code: status, ...parsed, performance };
}
