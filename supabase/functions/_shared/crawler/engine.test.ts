import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { crawlStep } from "./engine.ts";
import { MemoryStore } from "./memoryStore.ts";
import type { CrawlDeps, FetchResult } from "./types.ts";

// ── a fake website, and a virtual clock so back-off and crawl-delay cost no real time ──
interface FakePage { status?: number; html?: string; redirect?: string; contentType?: string; blocked?: string; netError?: boolean; flaky?: number }
const WORDS = "We help local businesses grow with clear plain-language marketing, honest reporting and steady work every single month. ".repeat(4);
const page = (title: string, links: string[] = [], extra = "") =>
  `<html><head><title>${title}</title><meta name="description" content="${title} description for the test site"></head><body><main><h1>${title}</h1><p>${WORDS}</p>${links.map((l) => `<a href="${l}">link</a>`).join(" ")}${extra}</main></body></html>`;
const urlset = (...locs: string[]) => `<urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join("")}</urlset>`;

function world(site: Record<string, FakePage | string>, opts: { start?: number } = {}) {
  let clock = opts.start ?? Date.parse("2026-10-15T10:00:00Z");
  const hits = new Map<string, number>();
  const renders: string[] = [];
  const get = (u: string) => site[u] as FakePage | string | undefined;

  const fetchPage = async (url: string): Promise<FetchResult> => {
    let cur = url, hops = 0;
    for (; hops < 6; hops++) {
      hits.set(cur, (hits.get(cur) ?? 0) + 1);
      const p = get(cur);
      const base: FetchResult = { ok: false, status: 0, finalUrl: cur, hops, contentType: "text/html", html: "", truncated: false, headers: { xRobotsTag: "" } };
      if (p === undefined) return { ...base, ok: false, status: 404 };
      const f: FakePage = typeof p === "string" ? { html: p } : p;
      if (f.blocked) return { ...base, blocked: f.blocked, error: f.blocked };
      if (f.netError) return { ...base, error: "connection reset" };
      if (f.flaky && (hits.get(cur) ?? 0) <= f.flaky) return { ...base, status: 503 };
      if (f.redirect) { cur = f.redirect; continue; }
      const status = f.status ?? 200;
      return { ...base, ok: status < 400, status, contentType: f.contentType ?? "text/html", html: status < 400 && (f.contentType ?? "text/html").includes("html") ? (f.html ?? "") : "" };
    }
    return { ok: false, status: 310, finalUrl: cur, hops, contentType: "", html: "", truncated: false, error: "too many redirects", headers: { xRobotsTag: "" } };
  };
  const fetchText = async (u: string) => { const p = get(u); return typeof p === "string" ? p : null; };
  const deps: CrawlDeps = {
    fetchPage, fetchText, now: () => clock, sleep: async (ms) => { clock += ms; },
    render: async (u) => { renders.push(u); const p = get(u + "#rendered"); return typeof p === "string" ? p : null; },
  };
  const advance = (ms: number) => { clock += ms; };
  return { deps, hits, renders, advance, now: () => clock };
}

async function runToEnd(store: MemoryStore, deps: CrawlDeps, id: string, now: () => number, advance: (ms: number) => void, tuning = {}, stepMs = 20_000, maxSteps = 200, gapMs = 2_000) {
  let last = await crawlStep(store, deps, id, { deadline: now() + stepMs, tuning });
  let steps = 1;
  while (last.status === "running" && steps < maxSteps) { advance(gapMs); last = await crawlStep(store, deps, id, { deadline: now() + stepMs, tuning }); steps++; }
  return { last, steps };
}

const crawledUrls = (s: MemoryStore) => s.pages.filter((p) => p.status === "done").map((p) => p.url).sort();

Deno.test("full crawl of a Yoast-style site: every real page is crawled, junk sitemaps skipped (the Innermetrix bug)", async () => {
  const w = world({
    "https://a.com/": page("Home", ["/assessments/", "/blog/post-1/"]),
    "https://a.com/robots.txt": "User-agent: *\nDisallow: /wp-admin/\nSitemap: https://a.com/sitemap_index.xml",
    "https://a.com/sitemap_index.xml": `<sitemapindex><sitemap><loc>https://a.com/post-sitemap.xml</loc></sitemap><sitemap><loc>https://a.com/page-sitemap.xml</loc></sitemap><sitemap><loc>https://a.com/author-sitemap.xml</loc></sitemap></sitemapindex>`,
    "https://a.com/post-sitemap.xml": urlset("https://a.com/blog/post-1/", "https://a.com/blog/post-2/"),
    "https://a.com/page-sitemap.xml": urlset("https://a.com/", "https://a.com/assessments/", "https://a.com/about/", "https://a.com/contact/", "https://a.com/disc/"),
    "https://a.com/author-sitemap.xml": urlset("https://a.com/author/jay/"),
    "https://a.com/assessments/": page("Assessments", ["/disc/"]), "https://a.com/about/": page("About"), "https://a.com/contact/": page("Contact"),
    "https://a.com/disc/": page("DISC"), "https://a.com/blog/post-1/": page("Post 1"), "https://a.com/blog/post-2/": page("Post 2"),
    "https://a.com/author/jay/": page("Author"),
  });
  const store = new MemoryStore(w.now);
  store.addCrawl({ id: "c1", origin: "https://a.com" });
  const { last } = await runToEnd(store, w.deps, "c1", w.now, w.advance);
  assertEquals(last.status, "complete");
  assertEquals(crawledUrls(store), ["https://a.com/", "https://a.com/about/", "https://a.com/assessments/", "https://a.com/blog/post-1/", "https://a.com/blog/post-2/", "https://a.com/contact/", "https://a.com/disc/"]);
  assertEquals(w.hits.get("https://a.com/author/jay/"), undefined); // junk sitemap never read
  const c = await store.loadCrawl("c1");
  assertEquals([c.status, c.phase, c.pages_crawled, c.pages_failed, c.pages_discovered], ["complete", "done", 7, 0, 7]);
  assertEquals(c.config.sitemapsSkipped?.includes("https://a.com/author-sitemap.xml"), true);
});

Deno.test("pages are fetched in priority order: home, contact and services before blog posts", async () => {
  const w = world({
    "https://a.com/": page("Home"),
    "https://a.com/sitemap.xml": urlset("https://a.com/blog/1/", "https://a.com/blog/2/", "https://a.com/services/", "https://a.com/contact/", "https://a.com/privacy-policy/"),
    "https://a.com/blog/1/": page("B1"), "https://a.com/blog/2/": page("B2"), "https://a.com/services/": page("S"), "https://a.com/contact/": page("C"), "https://a.com/privacy-policy/": page("P"),
  });
  const store = new MemoryStore(w.now);
  store.addCrawl({ id: "c1", origin: "https://a.com" });
  const order: string[] = [];
  const deps = { ...w.deps, fetchPage: async (u: string) => { if (!u.endsWith("robots.txt")) order.push(u); return w.deps.fetchPage(u); } };
  await runToEnd(store, deps, "c1", w.now, w.advance, { concurrency: 1 });
  assertEquals(order[0], "https://a.com/"); // the seed probe of the homepage comes first
  const rows = store.pages.slice().sort((a, b) => a.priority - b.priority).map((p) => p.url);
  assertEquals(rows, ["https://a.com/", "https://a.com/contact/", "https://a.com/services/", "https://a.com/blog/1/", "https://a.com/blog/2/", "https://a.com/privacy-policy/"]);
});

Deno.test("resumable: many short steps finish the crawl and no page is fetched twice", async () => {
  const links = Array.from({ length: 30 }, (_, i) => `/p${i}/`);
  const site: Record<string, FakePage | string> = { "https://a.com/": page("Home", links) };
  for (const l of links) site["https://a.com" + l] = page("P " + l);
  const w = world(site);
  const store = new MemoryStore(w.now);
  store.addCrawl({ id: "c1", origin: "https://a.com" });
  const { last, steps } = await runToEnd(store, w.deps, "c1", w.now, w.advance, { concurrency: 2, batchSize: 5 }, 1_500);
  assertEquals(last.status, "complete");
  assertEquals(steps > 3, true);
  assertEquals((await store.counts("c1")).done, 31);
  for (const [url, n] of w.hits) if (url !== "https://a.com/") assertEquals(n, 1, url);
});

Deno.test("redirects: the old URL is recorded and the target crawled once; www/non-www is normalised", async () => {
  const w = world({
    "https://a.com/": { redirect: "https://www.a.com/" },
    "https://www.a.com/": page("Home", ["/old/", "https://a.com/new/", "/new"]),
    "https://www.a.com/old/": { redirect: "https://www.a.com/new/" },
    "https://www.a.com/new/": page("New"), "https://a.com/new/": { redirect: "https://www.a.com/new/" },
  });
  const store = new MemoryStore(w.now);
  store.addCrawl({ id: "c1", origin: "https://a.com" });
  const { last } = await runToEnd(store, w.deps, "c1", w.now, w.advance);
  assertEquals(last.status, "complete");
  assertEquals((await store.loadCrawl("c1")).origin, "https://www.a.com");
  assertEquals(store.pages.filter((p) => p.final_url?.endsWith("/new/") && p.signals && !("redirected_to" in p.signals)).length, 1);
  assertEquals((w.hits.get("https://www.a.com/new/") ?? 0) >= 1, true);
  assertEquals(new Set(store.pages.map((p) => p.url_key)).size, store.pages.length);
});

Deno.test("errors: 404 is a recorded result, a flaky 503 is retried with back-off, a dead page fails after 3 attempts", async () => {
  const w = world({
    "https://a.com/": page("Home", ["/gone/", "/flaky/", "/dead/"]),
    "https://a.com/gone/": { status: 404 }, "https://a.com/flaky/": { html: page("Flaky"), flaky: 2 }, "https://a.com/dead/": { netError: true },
  });
  const store = new MemoryStore(w.now);
  store.addCrawl({ id: "c1", origin: "https://a.com" });
  const { last } = await runToEnd(store, w.deps, "c1", w.now, w.advance, {}, 20_000, 60, 30_000);
  assertEquals(last.status, "complete");
  const by = (u: string) => store.pages.find((p) => p.url === u)!;
  assertEquals([by("https://a.com/gone/").status, by("https://a.com/gone/").http_status], ["done", 404]);
  assertEquals([by("https://a.com/flaky/").status, by("https://a.com/flaky/").attempts], ["done", 3]);
  assertEquals([by("https://a.com/dead/").status, by("https://a.com/dead/").attempts], ["failed", 3]);
  assertEquals((await store.loadCrawl("c1")).pages_failed, 1);
});

Deno.test("robots.txt: disallowed paths are never fetched; Disallow: / stops the crawl with a clear reason", async () => {
  const w = world({
    "https://a.com/": page("Home", ["/private/x/", "/public/"]), "https://a.com/robots.txt": "User-agent: *\nDisallow: /private/",
    "https://a.com/private/x/": page("Secret"), "https://a.com/public/": page("Public"),
  });
  const store = new MemoryStore(w.now);
  store.addCrawl({ id: "c1", origin: "https://a.com" });
  await runToEnd(store, w.deps, "c1", w.now, w.advance);
  assertEquals(w.hits.get("https://a.com/private/x/"), undefined);
  assertEquals(w.hits.get("https://a.com/public/"), 1);

  const w2 = world({ "https://b.com/": page("Home"), "https://b.com/robots.txt": "User-agent: *\nDisallow: /" });
  const s2 = new MemoryStore(w2.now);
  s2.addCrawl({ id: "c2", origin: "https://b.com" });
  const r = await crawlStep(s2, w2.deps, "c2", { deadline: w2.now() + 20_000 });
  assertEquals(r.status, "failed");
  assertStringIncludes((await s2.loadCrawl("c2")).error ?? "", "robots.txt");
});

Deno.test("Crawl-delay is honoured (virtual time advances by the delay per request)", async () => {
  const w = world({ "https://a.com/": page("Home", ["/a/", "/b/", "/c/"]), "https://a.com/robots.txt": "User-agent: *\nCrawl-delay: 5", "https://a.com/a/": page("A"), "https://a.com/b/": page("B"), "https://a.com/c/": page("C") });
  const store = new MemoryStore(w.now);
  store.addCrawl({ id: "c1", origin: "https://a.com" });
  const t0 = w.now();
  await runToEnd(store, w.deps, "c1", w.now, w.advance, { concurrency: 1 }, 600_000);
  assertEquals(w.now() - t0 >= 3 * 5000, true);
});

Deno.test("page cap: a capped crawl keeps the important pages, not whatever came first", async () => {
  const blog = Array.from({ length: 20 }, (_, i) => `https://a.com/blog/post-${i}/`);
  const site: Record<string, FakePage | string> = {
    "https://a.com/": page("Home"), "https://a.com/sitemap.xml": urlset(...blog, "https://a.com/services/", "https://a.com/contact/", "https://a.com/about/"),
    "https://a.com/services/": page("S"), "https://a.com/contact/": page("C"), "https://a.com/about/": page("A"),
  };
  for (const b of blog) site[b] = page("B");
  const w = world(site);
  const store = new MemoryStore(w.now);
  store.addCrawl({ id: "c1", origin: "https://a.com", max_pages: 6 });
  await runToEnd(store, w.deps, "c1", w.now, w.advance);
  const urls = crawledUrls(store);
  assertEquals(urls.length, 6);
  for (const must of ["https://a.com/", "https://a.com/services/", "https://a.com/contact/", "https://a.com/about/"]) assertEquals(urls.includes(must), true, must);
});

Deno.test("traps: faceted ?param variants are capped and calendar/deep-archive URLs are never followed", async () => {
  const links = [...Array.from({ length: 40 }, (_, i) => `/shop/?page=${i}&sort=p${i}`), "/blog/page/900/", "/events/2040-01-05/", "/a/b/a/b/a/b/a/b/"];
  const w = world({ "https://a.com/": page("Home", links), "https://a.com/shop/": page("Shop") });
  for (const l of links) (w as unknown as { _: 0 })._ = 0;
  const store = new MemoryStore(w.now);
  store.addCrawl({ id: "c1", origin: "https://a.com" });
  await runToEnd(store, w.deps, "c1", w.now, w.advance);
  const shopVariants = store.pages.filter((p) => p.path_key.endsWith("/shop"));
  assertEquals(shopVariants.length <= 4, true);
  assertEquals(store.pages.some((p) => /\/page\/900|2040-01-05|\/a\/b\/a\/b/.test(p.url)), false);
});

Deno.test("JavaScript-only pages are rendered (when a renderer exists) and their links followed", async () => {
  const spa = `<html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
  const w = world({ "https://a.com/": spa, "https://a.com/#rendered": page("Home", ["/pricing/"]), "https://a.com/pricing/": page("Pricing") });
  const store = new MemoryStore(w.now);
  store.addCrawl({ id: "c1", origin: "https://a.com" });
  await runToEnd(store, w.deps, "c1", w.now, w.advance);
  assertEquals(w.renders.length >= 1, true);
  assertEquals(store.pages.find((p) => p.url === "https://a.com/")!.fetched_via, "render");
  assertEquals(store.pages.some((p) => p.url === "https://a.com/pricing/" && p.status === "done"), true);

  // No renderer: the page is kept as a plain, empty-looking page, and the crawl still completes.
  const w2 = world({ "https://b.com/": spa });
  const s2 = new MemoryStore(w2.now);
  s2.addCrawl({ id: "c2", origin: "https://b.com" });
  const deps2 = { ...w2.deps, render: undefined };
  const r = await runToEnd(s2, deps2, "c2", w2.now, w2.advance);
  assertEquals(r.last.status, "complete");
  assertEquals(s2.pages[0].fetched_via, "plain");
  assertEquals(s2.pages[0].signals?.looks_like_empty_spa, true);
});

Deno.test("cancelling stops the crawl at the next batch", async () => {
  const links = Array.from({ length: 20 }, (_, i) => `/p${i}/`);
  const site: Record<string, FakePage | string> = { "https://a.com/": page("Home", links) };
  for (const l of links) site["https://a.com" + l] = page("P");
  const w = world(site);
  const store = new MemoryStore(w.now);
  store.addCrawl({ id: "c1", origin: "https://a.com" });
  let first = true;
  const deps = { ...w.deps, fetchPage: async (u: string) => { const r = await w.deps.fetchPage(u); if (!first && store.crawls.get("c1")!.status !== "cancelled") store.crawls.get("c1")!.status = "cancelled"; first = false; return r; } };
  const r = await crawlStep(store, deps, "c1", { deadline: w.now() + 60_000, tuning: { batchSize: 3, concurrency: 1 } });
  assertEquals(r.status, "cancelled");
  assertEquals((await store.counts("c1")).pending > 5, true);
});

Deno.test("unreachable, cross-domain and blocked sites fail fast with a plain-English reason", async () => {
  const cases: [Record<string, FakePage | string>, string][] = [
    [{ "https://a.com/": { netError: true } }, "could not be reached"],
    [{ "https://a.com/": { redirect: "https://other.com/" }, "https://other.com/": page("X") }, "different domain"],
    [{ "https://a.com/": { blocked: "private or reserved IP addresses are not allowed" } }, "can't be crawled"],
    [{ "https://a.com/": { status: 403 } }, "refused our crawler"],
  ];
  for (const [site, expect] of cases) {
    const w = world(site);
    const s = new MemoryStore(w.now);
    s.addCrawl({ id: "c", origin: "https://a.com" });
    const r = await crawlStep(s, w.deps, "c", { deadline: w.now() + 30_000 });
    assertEquals(r.status, "failed");
    assertStringIncludes((await s.loadCrawl("c")).error ?? "", expect);
  }
});

Deno.test("a crawl that outlives its time limit is failed, not left running forever; finished crawls are left alone", async () => {
  const w = world({ "https://a.com/": page("Home") });
  const s = new MemoryStore(w.now);
  s.addCrawl({ id: "c", origin: "https://a.com", status: "running", started_at: new Date(w.now() - 13 * 3600_000).toISOString() });
  assertEquals((await crawlStep(s, w.deps, "c", { deadline: w.now() + 10_000 })).status, "failed");
  assertEquals((await crawlStep(s, w.deps, "c", { deadline: w.now() + 10_000 })).note, "already finished");
});

Deno.test("duplicate spellings of a URL are fetched once; non-HTML responses are recorded, not parsed", async () => {
  const w = world({
    "https://a.com/": page("Home", ["/about", "/about/", "/about?utm_source=x", "https://a.com/about#team", "/report"]),
    "https://a.com/about": page("About"), "https://a.com/about/": page("About"), "https://a.com/report": { contentType: "application/pdf", html: "%PDF" },
  });
  const s = new MemoryStore(w.now);
  s.addCrawl({ id: "c", origin: "https://a.com" });
  await runToEnd(s, w.deps, "c", w.now, w.advance);
  assertEquals(s.pages.filter((p) => p.url_key === "a.com/about").length, 1);
  assertEquals(s.pages.find((p) => p.url.endsWith("/report"))!.signals, null);
  assertEquals(s.pages.find((p) => p.url.endsWith("/report"))!.status, "done");
});
