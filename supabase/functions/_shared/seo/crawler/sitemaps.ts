// Sitemap parsing for the crawler. Pure parsing here; fetching is injected so the
// whole tree-walk is testable with fixtures (including the Yoast-style index that
// the old crawler read only the first child of).

export interface SitemapEntry { loc: string; lastmod: string | null }
export interface ParsedSitemap { kind: "index" | "urlset" | "unknown"; entries: SitemapEntry[] }

const decode = (s: string) => s
  .replace(/^<!\[CDATA\[|\]\]>$/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .trim();

export function parseSitemap(xml: string): ParsedSitemap {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? "index" : /<urlset[\s>]/i.test(xml) ? "urlset" : "unknown";
  if (kind === "unknown") return { kind, entries: [] };
  const tag = kind === "index" ? "sitemap" : "url";
  const entries: SitemapEntry[] = [];
  for (const m of xml.matchAll(new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, "gi"))) {
    const loc = m[0].match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    entries.push({ loc: decode(loc), lastmod: m[0].match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i)?.[1]?.trim() ?? null });
  }
  return { kind, entries };
}

// Child sitemaps that list plumbing, not pages worth auditing.
const JUNK_SITEMAP = /(attachment|author|divi_overlay|elementor_library|e-landing-page|wp_template|wp_block|wp_global|nav_menu|oembed|shop_order|scheduled-action|acf-|ml-slider)[^/]*sitemap|sitemap[^/]*(attachment|author)/i;
export const isJunkSitemap = (url: string) => JUNK_SITEMAP.test(url);

export interface SitemapWalkOptions {
  fetchText: (url: string) => Promise<string | null>;
  maxSitemaps?: number;   // child sitemaps read
  maxUrls?: number;       // URLs collected in total
}

export interface SitemapWalk {
  entries: SitemapEntry[];
  sitemapsRead: string[];
  sitemapsSkipped: string[];
  truncated: boolean;
}

/** Reads every sitemap in the tree (index -> children), skipping junk ones, bounded. */
export async function walkSitemaps(roots: string[], opts: SitemapWalkOptions): Promise<SitemapWalk> {
  const maxSitemaps = opts.maxSitemaps ?? 60;
  const maxUrls = opts.maxUrls ?? 20000;
  const seen = new Set<string>();
  const queue = [...roots];
  const entries: SitemapEntry[] = [];
  const read: string[] = [], skipped: string[] = [];
  const have = new Set<string>();
  let truncated = false;

  while (queue.length) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (isJunkSitemap(url)) { skipped.push(url); continue; }
    if (read.length >= maxSitemaps) { truncated = true; break; }
    const xml = await opts.fetchText(url);
    if (!xml) { skipped.push(url); continue; }
    read.push(url);
    const parsed = parseSitemap(xml);
    if (parsed.kind === "index") { for (const e of parsed.entries) queue.push(e.loc); continue; }
    for (const e of parsed.entries) {
      if (have.has(e.loc)) continue;
      have.add(e.loc);
      entries.push(e);
      if (entries.length >= maxUrls) { truncated = true; return { entries, sitemapsRead: read, sitemapsSkipped: skipped, truncated }; }
    }
  }
  return { entries, sitemapsRead: read, sitemapsSkipped: skipped, truncated };
}
