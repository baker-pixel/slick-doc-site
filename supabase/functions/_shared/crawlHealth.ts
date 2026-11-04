// Site-level crawl-health checks (rubric v3). Two halves:
//   gatherSiteHealth  -- the only part that touches the network (bounded by a
//                        time budget, degrades to "unknown" rather than guessing)
//   runSiteChecks     -- pure: SiteHealth + page signals -> findings, unit-tested
// Unknown is never a defect: a probe that timed out or was bot-blocked
// (0 / 401 / 403 / 429) produces no finding.
import { CHECKS } from "./seoRubric.ts";
import { mk, type Finding } from "./seoChecks.ts";
import { getDisallows, isAllowed, probeUrl, type PageSignals, type ProbeResult } from "./seoSignals.ts";

const UA = "OrangeDoorSEOBot/1.0 (+https://orangedoormarketing.com/bot)";
const SITEMAP_SAMPLE = 10;
const SITEMAP_MAX_URLS = 500;
const LINK_SAMPLE = 30;
const CONCURRENCY = 8;
const BUDGET_MS = 25_000;

export interface SiteHealth {
  origin: string;
  /** null = could not be determined */
  http: { redirects_to_https: boolean | null; final_url: string | null };
  hosts: { split: boolean | null; main: string | null; variant: string | null };
  sitemap: {
    found: boolean;
    /** true only when the site gave a definitive answer (e.g. 404); a timeout or bot block leaves it false. */
    checked: boolean;
    url: string | null;
    url_count: number;
    sampled: number;
    dead: { url: string; status: number }[];
    redirected: { url: string; to: string }[];
    blocked_by_robots: string[];
  };
  broken_links: { url: string; status: number; found_on: string[] }[];
  links_checked: number;
  /** Sitemap pages nothing links to (only filled from a full crawl). */
  orphan_pages: string[];
}

export function emptySiteHealth(origin: string): SiteHealth {
  return {
    origin,
    http: { redirects_to_https: null, final_url: null },
    hosts: { split: null, main: null, variant: null },
    sitemap: { found: false, checked: false, url: null, url_count: 0, sampled: 0, dead: [], redirected: [], blocked_by_robots: [] },
    broken_links: [], links_checked: 0, orphan_pages: [],
  };
}

/** Real error for a link target. 0/401/403/429 are "unknown" (timeout / bot protection). */
export const isBroken = (status: number) => status === 404 || status === 410 || (status >= 500 && status < 600);

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

async function fetchBody(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, status: res.status, body: res.ok ? await res.text() : "" };
  } catch { return { ok: false, status: 0, body: "" }; }
}

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi)].map((m) => m[1].trim());

const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
const bare = (h: string) => h.replace(/^www\./, "");

export function normalizeUrlKey(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    const path = x.pathname.replace(/\/+$/, "") || "";
    return `${bare(x.hostname.toLowerCase())}${path}${x.search}`;
  } catch { return u; }
}

/** Network half. Every probe checks the deadline first, so a slow site yields a partial, honest result. */
export interface CrawlLinkData {
  broken: { url: string; status: number; found_on: string[] }[];
  orphans: string[];
  linksChecked: number;
}

/**
 * `crawl` is supplied when the audit runs on a stored full crawl: broken links and orphans then come from
 * the link graph (every link, not a sample), and only the cheap site-level probes run live.
 */
export async function gatherSiteHealth(origin: string, signals: PageSignals[], crawl?: CrawlLinkData): Promise<SiteHealth> {
  const health = emptySiteHealth(origin);
  const deadline = Date.now() + BUDGET_MS;
  const withinBudget = () => Date.now() < deadline;
  const probe = async (u: string): Promise<ProbeResult | null> => (withinBudget() ? await probeUrl(u, 5000) : null);

  let host: string;
  try { host = new URL(origin).hostname; } catch { return health; }

  // HTTPS + www/non-www: four cheap probes.
  const variantHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const [plain, main, variant] = await Promise.all([
    probe(`http://${host}/`),
    probe(`https://${host}/`),
    probe(`https://${variantHost}/`),
  ]);
  if (plain && !plain.error && plain.status > 0 && plain.status < 400) {
    health.http = { redirects_to_https: plain.final_url.startsWith("https://"), final_url: plain.final_url };
  }
  if (main && variant && !main.error && !variant.error && main.status === 200 && variant.status === 200) {
    health.hosts = { split: hostOf(main.final_url) !== hostOf(variant.final_url), main: hostOf(main.final_url), variant: hostOf(variant.final_url) };
  }

  // Sitemap: /sitemap.xml, else a Sitemap: line in robots.txt.
  let sitemapUrl: string | null = null;
  let sitemapBody = "";
  const direct = await fetchBody(`${origin}/sitemap.xml`);
  if (direct.ok && /<(urlset|sitemapindex)/i.test(direct.body)) { sitemapUrl = `${origin}/sitemap.xml`; sitemapBody = direct.body; }
  else {
    // Only a clear "no such file" (or a 200 that isn't a sitemap) counts as missing.
    health.sitemap.checked = direct.status === 404 || direct.status === 410 || (direct.ok && !!direct.body);
    const robots = await fetchBody(`${origin}/robots.txt`);
    const line = robots.body.split("\n").map((l) => l.trim()).find((l) => /^sitemap:/i.test(l));
    const u = line?.slice(line.indexOf(":") + 1).trim();
    if (u) {
      const alt = await fetchBody(u);
      if (alt.ok && /<(urlset|sitemapindex)/i.test(alt.body)) { sitemapUrl = u; sitemapBody = alt.body; }
      else if (!(alt.status === 404 || alt.status === 410)) health.sitemap.checked = false;
    }
  }
  if (sitemapUrl) {
    let urls: string[] = [];
    if (/<sitemapindex/i.test(sitemapBody)) {
      for (const child of locs(sitemapBody).slice(0, 3)) {
        if (!withinBudget()) break;
        urls.push(...locs((await fetchBody(child)).body));
      }
    } else urls = locs(sitemapBody);
    urls = [...new Set(urls)].slice(0, SITEMAP_MAX_URLS);
    health.sitemap.found = true;
    health.sitemap.checked = true;
    health.sitemap.url = sitemapUrl;
    health.sitemap.url_count = urls.length;

    const disallows = await getDisallows(origin);
    health.sitemap.blocked_by_robots = urls.filter((u) => {
      try { return !isAllowed(new URL(u).pathname, disallows); } catch { return false; }
    }).slice(0, 20);

    // Evenly spread sample so a long sitemap isn't judged by its first rows.
    const step = Math.max(1, Math.floor(urls.length / SITEMAP_SAMPLE));
    const sample = urls.filter((_, i) => i % step === 0).slice(0, SITEMAP_SAMPLE);
    const results = await mapLimit(sample, CONCURRENCY, async (u) => ({ u, r: await probe(u) }));
    for (const { u, r } of results) {
      if (!r || r.error) continue;
      health.sitemap.sampled++;
      if (isBroken(r.status)) health.sitemap.dead.push({ url: u, status: r.status });
      else if (r.hops > 0 && normalizeUrlKey(r.final_url) !== normalizeUrlKey(u)) health.sitemap.redirected.push({ url: u, to: r.final_url });
    }
  }

  if (crawl) {
    health.broken_links = crawl.broken;
    health.links_checked = crawl.linksChecked;
    health.orphan_pages = crawl.orphans;
    return health;
  }

  // Broken internal links: targets found on the crawled pages that we did not crawl ourselves.
  const audited = new Set(signals.map((s) => normalizeUrlKey(s.url)));
  const linkedFrom = new Map<string, Set<string>>();
  for (const s of signals) {
    if (!s.reachable) continue;
    for (const link of s.internal_link_urls ?? []) {
      const key = normalizeUrlKey(link);
      if (audited.has(key)) continue;
      if (!linkedFrom.has(link)) linkedFrom.set(link, new Set());
      linkedFrom.get(link)!.add(s.url);
    }
  }
  const targets = [...linkedFrom.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, LINK_SAMPLE);
  const checked = await mapLimit(targets, CONCURRENCY, async ([u, from]) => ({ u, from: [...from], r: await probe(u) }));
  for (const { u, from, r } of checked) {
    if (!r || r.error) continue;
    health.links_checked++;
    if (isBroken(r.status)) health.broken_links.push({ url: u, status: r.status, found_on: from.slice(0, 5) });
  }
  return health;
}

type SiteFinding = Omit<Finding, "id" | "status">;

const site = (f: Omit<Finding, "id" | "status">, pages: string[]): SiteFinding => ({ ...f, pages, scope: "site" });

const list = (items: string[], max = 5) =>
  items.slice(0, max).join(", ") + (items.length > max ? ` and ${items.length - max} more` : "");

/** Pure half. Duplicate title/meta come straight from page signals; the rest from SiteHealth. */
export function runSiteChecks(health: SiteHealth, signals: PageSignals[]): SiteFinding[] {
  const out: SiteFinding[] = [];
  const home = `${health.origin}/`;

  if (health.http.redirects_to_https === false) {
    out.push(site(mk(CHECKS.http_not_redirected, home,
      "Visitors who type the plain http:// address stay on an insecure version of the site. Browsers show a \"Not secure\" warning and Google prefers https.",
      `http://${hostOf(health.origin)}/ loaded without redirecting to https (ended at ${health.http.final_url}).`,
      { final_url: health.http.final_url }), [home]));
  }

  if (health.hosts.split === true) {
    out.push(site(mk(CHECKS.host_split, home,
      "The site loads at both the www and non-www address without one redirecting to the other. Google can treat them as two copies and split the ranking between them.",
      `${health.hosts.main} and ${health.hosts.variant} both return 200 and do not redirect to each other.`,
      { main: health.hosts.main, variant: health.hosts.variant }), [home]));
  }

  if (!health.sitemap.found && health.sitemap.checked) {
    out.push(site(mk(CHECKS.sitemap_missing, home,
      "No XML sitemap was found. A sitemap tells Google which pages exist, which matters most for new or deep pages.",
      "No /sitemap.xml and no Sitemap: line in robots.txt pointing to a valid sitemap.", { found: false }), [home]));
  } else if (health.sitemap.found) {
    const { dead, redirected, blocked_by_robots, sampled, url_count } = health.sitemap;
    if (dead.length || redirected.length || blocked_by_robots.length) {
      const parts: string[] = [];
      if (dead.length) parts.push(`${dead.length} return errors`);
      if (redirected.length) parts.push(`${redirected.length} redirect elsewhere`);
      if (blocked_by_robots.length) parts.push(`${blocked_by_robots.length} are blocked by robots.txt`);
      out.push(site(mk(CHECKS.sitemap_bad_urls, home,
        `The sitemap lists pages Google can't use: ${parts.join(", ")}. A clean sitemap should list only live pages you want found.`,
        `Checked ${sampled} of ${url_count} sitemap URLs. ${list([...dead.map((d) => `${d.url} (${d.status})`), ...redirected.map((r) => `${r.url} -> ${r.to}`), ...blocked_by_robots])}.`,
        { dead, redirected, blocked_by_robots }), [home]));
    }
  }

  if (health.broken_links.length) {
    const sources = [...new Set(health.broken_links.flatMap((b) => b.found_on))];
    out.push(site(mk(CHECKS.broken_internal_links, home,
      `${health.broken_links.length} link(s) on your pages lead to a page that no longer exists. Visitors hit a dead end, and Google wastes time on them.`,
      `Broken: ${list(health.broken_links.map((b) => `${b.url} (${b.status})`))}.`,
      { broken: health.broken_links, links_checked: health.links_checked }), sources.length ? sources : [home]));
  }

  if (health.orphan_pages.length) {
    out.push(site(mk(CHECKS.orphan_pages, home,
      `${health.orphan_pages.length} page${health.orphan_pages.length === 1 ? " is" : "s are"} listed in your sitemap but no other page on your site links to ${health.orphan_pages.length === 1 ? "it" : "them"}. Visitors and Google rarely find pages like this, and Google treats them as unimportant.`,
      `Orphan pages: ${list(health.orphan_pages)}.`,
      { orphans: health.orphan_pages.slice(0, 50), count: health.orphan_pages.length }), health.orphan_pages.slice(0, 25)));
  }

  // Duplicates: only across pages that were actually read.
  const dupes = (pick: (s: PageSignals) => string) => {
    const groups = new Map<string, string[]>();
    for (const s of signals) {
      if (!s.reachable || s.looks_like_empty_spa || s.noindex) continue;
      const v = pick(s).trim().toLowerCase().replace(/\s+/g, " ");
      if (!v) continue;
      groups.set(v, [...(groups.get(v) ?? []), s.url]);
    }
    return [...groups.entries()].filter(([, urls]) => urls.length > 1);
  };
  const dupTitles = dupes((s) => s.title);
  if (dupTitles.length) {
    const urls = dupTitles.flatMap(([, u]) => u);
    out.push(site(mk(CHECKS.duplicate_titles, urls[0],
      `${urls.length} pages share ${dupTitles.length === 1 ? "one title" : `${dupTitles.length} titles`}. Google can't tell them apart, so they compete with each other.`,
      dupTitles.map(([t, u]) => `"${t.slice(0, 70)}" on ${u.length} pages`).join("; ") + ".",
      { groups: dupTitles.map(([title, pages]) => ({ title, pages })) }), urls));
  }
  const dupMeta = dupes((s) => s.meta_description);
  if (dupMeta.length) {
    const urls = dupMeta.flatMap(([, u]) => u);
    out.push(site(mk(CHECKS.duplicate_meta, urls[0],
      `${urls.length} pages use the same search-result description, so they all look identical in Google.`,
      dupMeta.map(([t, u]) => `"${t.slice(0, 70)}..." on ${u.length} pages`).join("; ") + ".",
      { groups: dupMeta.map(([description, pages]) => ({ description, pages })) }), urls));
  }
  return out;
}
