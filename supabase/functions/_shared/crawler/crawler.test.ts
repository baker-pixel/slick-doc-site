import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { crawlPriority, fetchableUrl, isTrap, pageTypeOf, urlKey } from "./urlRules.ts";
import { parseRobots, robotsAllows, robotsBlocksEverything } from "./robots.ts";
import { isJunkSitemap, parseSitemap, walkSitemaps } from "./sitemaps.ts";
import { checkResolvedSafe, checkUrlSafe, isPrivateIp } from "./ssrf.ts";

// ── urlRules ────────────────────────────────────────────────────────────────
Deno.test("urlKey: spellings of one page collapse to one key", () => {
  const keys = [
    "https://Example.com/about/", "http://www.example.com/about", "https://example.com/about#team",
    "https://example.com/about?utm_source=x&gclid=1", "https://example.com//about", "https://example.com:443/about",
  ].map((u) => urlKey(u));
  assertEquals(new Set(keys).size, 1);
  assertEquals(keys[0], "example.com/about");
  assertEquals(urlKey("https://example.com/index.html"), "example.com/");
  assertEquals(urlKey("https://example.com/shop?b=2&a=1"), urlKey("https://example.com/shop?a=1&b=2"));
  assertEquals(urlKey("/contact", "https://example.com/about/"), "example.com/contact");
});

Deno.test("urlKey: assets, system paths and non-web URLs are never crawled", () => {
  for (const u of ["https://a.com/logo.png", "https://a.com/f.pdf", "https://a.com/wp-admin/", "https://a.com/wp-json/wp/v2/posts", "https://a.com/feed/", "https://a.com/cart", "mailto:a@b.com", "javascript:void(0)", "https://u:p@a.com/", "ftp://a.com/x"]) {
    assertEquals(urlKey(u), null, u);
  }
  assertEquals(urlKey("https://a.com/blog/post-1") !== null, true);
});

Deno.test("fetchableUrl keeps the original scheme/host but drops tracking and fragments", () => {
  assertEquals(fetchableUrl("https://www.a.com/x/?utm_source=n&id=4#top"), "https://www.a.com/x/?id=4");
});

Deno.test("isTrap catches infinite spaces but not normal pages", () => {
  assertEquals(isTrap("https://a.com/shop?color=r&size=m&sort=p&page=2"), true);
  assertEquals(isTrap("https://a.com/blog/page/450/"), true);
  assertEquals(isTrap("https://a.com/a/b/a/b/a/b/a/b/"), true);
  assertEquals(isTrap("https://a.com/events/2031-04-12/"), true);
  assertEquals(isTrap("https://a.com/blog/page/2/"), false);
  assertEquals(isTrap("https://a.com/services/plumbing?ref=nav"), false);
});

Deno.test("pageTypeOf and crawlPriority put the important pages first", () => {
  assertEquals(pageTypeOf("https://a.com/"), "home");
  assertEquals(pageTypeOf("https://a.com/assessments/"), "service");
  assertEquals(pageTypeOf("https://a.com/contact-us"), "contact");
  assertEquals(pageTypeOf("https://a.com/our-team"), "about");
  assertEquals(pageTypeOf("https://a.com/2024/05/a-post"), "blog");
  assertEquals(pageTypeOf("https://a.com/privacy-policy"), "legal");
  const order = [["blog", 1, "sitemap"], ["service", 1, "link"], ["home", 0, "seed"], ["legal", 1, "link"], ["contact", 1, "sitemap"]] as const;
  const sorted = [...order].sort((a, b) => crawlPriority(a[0], a[1], a[2]) - crawlPriority(b[0], b[1], b[2])).map((o) => o[0]);
  assertEquals(sorted, ["home", "contact", "service", "blog", "legal"]);
});

// ── robots ──────────────────────────────────────────────────────────────────
Deno.test("robots: longest match wins, Allow beats Disallow on a tie, wildcards and $", () => {
  const r = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\nDisallow: /search?*\nCrawl-delay: 2\nSitemap: https://a.com/sm.xml");
  assertEquals(robotsAllows(r, "/private/x"), false);
  assertEquals(robotsAllows(r, "/private/public/doc"), true);
  assertEquals(robotsAllows(r, "/files/a.pdf"), false);
  assertEquals(robotsAllows(r, "/files/a.pdf?x=1"), true);
  assertEquals(robotsAllows(r, "/search?q=1"), false);
  assertEquals(robotsAllows(r, "/about"), true);
  assertEquals(r.crawlDelaySeconds, 2);
  assertEquals(r.sitemaps, ["https://a.com/sm.xml"]);
});

Deno.test("robots: our own group beats *, an empty Disallow allows everything, comments are ignored", () => {
  const r = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: OrangeDoorSEOBot\nDisallow: /admin # keep out\nDisallow:\n");
  assertEquals(robotsAllows(r, "/about"), true);
  assertEquals(robotsAllows(r, "/admin/x"), false);
  assertEquals(robotsBlocksEverything(parseRobots("User-agent: *\nDisallow: /")), true);
  assertEquals(robotsBlocksEverything(parseRobots("User-agent: *\nDisallow: /\nAllow: /public")), false);
});

Deno.test("robots: an HTML error page or empty file is treated as no rules, never as 'blocked'", () => {
  assertEquals(robotsAllows(parseRobots("<!DOCTYPE html><html><body>404</body></html>"), "/x"), true);
  assertEquals(parseRobots("<html>").unparseable, true);
  assertEquals(robotsAllows(parseRobots(""), "/x"), true);
  assertEquals(robotsAllows(null, "/x"), true);
});

// ── sitemaps ────────────────────────────────────────────────────────────────
const INDEX = `<?xml version="1.0"?><sitemapindex>
 <sitemap><loc>https://a.com/post-sitemap.xml</loc></sitemap>
 <sitemap><loc>https://a.com/page-sitemap.xml</loc></sitemap>
 <sitemap><loc>https://a.com/divi_overlay-sitemap.xml</loc></sitemap>
 <sitemap><loc>https://a.com/author-sitemap.xml</loc></sitemap></sitemapindex>`;
const urlset = (...locs: string[]) => `<urlset>${locs.map((l) => `<url><loc>${l}</loc><lastmod>2026-01-02</lastmod></url>`).join("")}</urlset>`;

Deno.test("parseSitemap: urlset, index, CDATA, entities, unknown", () => {
  const u = parseSitemap(`<urlset><url><loc><![CDATA[https://a.com/x?a=1&amp;b=2]]></loc><lastmod>2026-03-04</lastmod></url><url><loc>https://a.com/y</loc></url></urlset>`);
  assertEquals(u.kind, "urlset");
  assertEquals(u.entries, [{ loc: "https://a.com/x?a=1&b=2", lastmod: "2026-03-04" }, { loc: "https://a.com/y", lastmod: null }]);
  assertEquals(parseSitemap(INDEX).kind, "index");
  assertEquals(parseSitemap("<html>nope</html>"), { kind: "unknown", entries: [] });
});

Deno.test("walkSitemaps reads EVERY child (the Innermetrix bug: only the first was read), skips junk", async () => {
  const files: Record<string, string> = {
    "https://a.com/sitemap_index.xml": INDEX,
    "https://a.com/post-sitemap.xml": urlset("https://a.com/blog/1", "https://a.com/blog/2"),
    "https://a.com/page-sitemap.xml": urlset("https://a.com/", "https://a.com/assessments/", "https://a.com/about/"),
    "https://a.com/divi_overlay-sitemap.xml": urlset("https://a.com/overlay/1"),
    "https://a.com/author-sitemap.xml": urlset("https://a.com/author/jay"),
  };
  const walk = await walkSitemaps(["https://a.com/sitemap_index.xml"], { fetchText: async (u) => files[u] ?? null });
  assertEquals(walk.entries.map((e) => e.loc).sort(), ["https://a.com/", "https://a.com/about/", "https://a.com/assessments/", "https://a.com/blog/1", "https://a.com/blog/2"]);
  assertEquals(walk.sitemapsSkipped.length, 2);
  assertEquals(isJunkSitemap("https://a.com/author-sitemap.xml"), true);
  assertEquals(isJunkSitemap("https://a.com/page-sitemap.xml"), false);
});

Deno.test("walkSitemaps: dedupes, survives a missing child and a cycle, and honours the URL cap", async () => {
  const files: Record<string, string> = {
    "https://a.com/i.xml": `<sitemapindex><sitemap><loc>https://a.com/i.xml</loc></sitemap><sitemap><loc>https://a.com/gone.xml</loc></sitemap><sitemap><loc>https://a.com/s.xml</loc></sitemap></sitemapindex>`,
    "https://a.com/s.xml": urlset("https://a.com/1", "https://a.com/1", "https://a.com/2", "https://a.com/3"),
  };
  const walk = await walkSitemaps(["https://a.com/i.xml"], { fetchText: async (u) => files[u] ?? null, maxUrls: 2 });
  assertEquals(walk.entries.length, 2);
  assertEquals(walk.truncated, true);
  const all = await walkSitemaps(["https://a.com/i.xml"], { fetchText: async (u) => files[u] ?? null });
  assertEquals(all.entries.length, 3);
});

// ── ssrf ────────────────────────────────────────────────────────────────────
Deno.test("ssrf: internal and metadata addresses are refused, public sites allowed", () => {
  for (const u of ["http://localhost/", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/", "http://192.168.1.1/", "http://172.20.0.1/", "http://[::1]/", "http://2130706433/", "http://0x7f000001/", "http://intranet/", "http://db.internal/", "https://a.com:8080/", "file:///etc/passwd", "https://u:p@a.com/", "http://[fd00::1]/", "http://[::ffff:10.0.0.1]/"]) {
    assertEquals(checkUrlSafe(u).ok, false, u);
  }
  for (const u of ["https://innermetrix.com/", "http://www.example.co.uk/a", "https://personality.getresonant.io/"]) assertEquals(checkUrlSafe(u).ok, true, u);
  assertEquals(isPrivateIp("172.32.0.1"), false);
  assertEquals(isPrivateIp("172.31.255.255"), true);
});

Deno.test("ssrf: a public-looking name that RESOLVES to a private IP is refused", () => {
  assertEquals(checkResolvedSafe(["93.184.216.34"]).ok, true);
  assertEquals(checkResolvedSafe(["93.184.216.34", "10.1.2.3"]).ok, false);
  assertEquals(checkResolvedSafe([]).ok, false);
});

// ── status shaping ──────────────────────────────────────────────────────────
import { shapeStatus } from "./status.ts";
import type { CrawlRow } from "./types.ts";
const row = (over: Partial<CrawlRow>): CrawlRow => ({
  id: "c", client_account_id: "x", origin: "https://a.com", max_pages: 100, status: "running", phase: "crawl", trigger: "manual",
  pages_discovered: 100, pages_crawled: 25, pages_failed: 0, error: null, config: {}, created_at: "2026-10-15T10:00:00Z",
  started_at: "2026-10-15T10:00:00Z", finished_at: null, last_step_at: null, ...over,
});

Deno.test("status: percent, ETA from the observed rate, and never 100% until complete", () => {
  const t = Date.parse("2026-10-15T10:05:00Z"); // 300s for 25 pages = 12s/page; 75 left => 900s
  const s = shapeStatus(row({}), t);
  assertEquals([s.percent, s.eta_seconds], [25, 900]);
  assertEquals(shapeStatus(row({ pages_crawled: 99, pages_failed: 1 }), t).percent, 99);
  assertEquals(shapeStatus(row({ status: "complete", pages_crawled: 98, pages_failed: 2 })).percent, 100);
  assertEquals(shapeStatus(row({ pages_crawled: 2 }), t).eta_seconds, null); // too early to guess
  assertStringIncludes(shapeStatus(row({ status: "queued", phase: "seed" })).message, "Starting");
  assertStringIncludes(shapeStatus(row({ status: "failed", error: "robots.txt tells crawlers" })).message, "robots.txt");
  assertEquals(shapeStatus(null).percent, 0);
});
