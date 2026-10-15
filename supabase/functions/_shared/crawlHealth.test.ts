import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { runChecks } from "./seoChecks.ts";
import { emptySiteHealth, isBroken, runSiteChecks } from "./crawlHealth.ts";
import { CHECKS, computeScores } from "./seoRubric.ts";
import { normalizeForCompare, parseCrawlHealth, type PageSignals } from "./seoSignals.ts";

const GOOD: PageSignals = {
  url: "https://a.test/", reachable: true, fetched_via: "plain", status_code: 200,
  title: "Acme Plumbing | Fast, Local Plumbers in Austin", meta_description: "x".repeat(150), h1_count: 1, word_count: 800,
  image_count: 4, images_missing_alt: 0, internal_links: 10, external_links: 2, has_viewport: true, has_canonical: true, has_schema: true,
  has_entity_schema: true, has_faq_schema: true, qa_pairs: [], has_open_graph: true, looks_like_empty_spa: false, text_sample: "", performance: null,
};
const page = (over: Partial<PageSignals> = {}, url = "https://a.test/"): PageSignals => ({ ...GOOD, ...over, url });
const ids = (s: PageSignals) => runChecks(s).map((f) => f.check_id);

Deno.test("a clean page with probe data raises no crawl-health findings", () => {
  assertEquals(ids(page({ probe_status: 200, final_url: "https://a.test/", redirect_hops: 0, noindex: false, canonical_href: "https://a.test", mixed_content_count: 0 })), []);
});

Deno.test("404/410/5xx are page errors and stop further checks; 403/429 are treated as bot blocks", () => {
  assertEquals(ids(page({ reachable: false, status_code: 404, probe_status: 404, title: "" })), ["page_error"]);
  assertEquals(ids(page({ reachable: true, probe_status: 503 })), ["page_error"]);
  assertEquals(ids(page({ reachable: false, status_code: 403, probe_status: 403 })).includes("page_error"), false);
  assertEquals(ids(page({ probe_status: 429 })).includes("page_error"), false);
});

Deno.test("noindex is critical and names where it was found", () => {
  const f = runChecks(page({ noindex: true, x_robots_tag: "noindex, nofollow" })).find((x) => x.check_id === "noindex_page")!;
  assertEquals(f.severity, "critical");
  assertEquals(f.technical_detail.includes("X-Robots-Tag"), true);
});

Deno.test("canonical: same page in different spelling is fine, a different page is flagged", () => {
  assertEquals(ids(page({ canonical_href: "http://www.a.test/" })).includes("canonical_mismatch"), false);
  assertEquals(ids(page({ url: "https://a.test/blog/", canonical_href: "/blog" }, "https://a.test/blog/")).includes("canonical_mismatch"), false);
  assertEquals(ids(page({ url: "https://a.test/blog/post", canonical_href: "https://a.test/" }, "https://a.test/blog/post")).includes("canonical_mismatch"), true);
  assertEquals(normalizeForCompare("https://WWW.A.test/x/?q=1#h"), "a.test/x");
});

Deno.test("redirect: one hop is fine, two hops or a loop is flagged", () => {
  assertEquals(ids(page({ redirect_hops: 1 })).includes("redirect_chain"), false);
  assertEquals(ids(page({ redirect_hops: 2, final_url: "https://a.test/z" })).includes("redirect_chain"), true);
  assertEquals(ids(page({ redirect_hops: 3, redirect_loop: true })).includes("redirect_chain"), true);
});

Deno.test("mixed content counts only on https pages", () => {
  assertEquals(ids(page({ mixed_content_count: 2 })).includes("mixed_content"), true);
  const p = parseCrawlHealth('<img src="http://x.test/a.png"><link rel="stylesheet" href="http://x.test/s.css"><script src="https://ok.test/a.js"></script>', "https://a.test/");
  assertEquals(p.mixed_content_count, 2);
  assertEquals(parseCrawlHealth('<img src="http://x.test/a.png">', "http://a.test/").mixed_content_count, 0);
});

Deno.test("parse: noindex meta, canonical, and internal links (assets, anchors, other hosts excluded)", () => {
  const html = `<meta name="robots" content="index, NOINDEX"><link rel="canonical" href="https://a.test/home">
    <a href="/about">a</a><a href="https://www.a.test/about#team">dup</a><a href="/logo.png">img</a><a href="#top">t</a>
    <a href="mailto:x@a.test">m</a><a href="https://other.test/x">o</a><a href="/services/">s</a>`;
  const p = parseCrawlHealth(html, "https://a.test/");
  assertEquals(p.noindex, true);
  assertEquals(p.canonical_href, "https://a.test/home");
  assertEquals(p.internal_link_urls, ["https://a.test/about", "https://www.a.test/about", "https://a.test/services/"]);
  assertEquals(parseCrawlHealth('<meta name="robots" content="index,follow">', "https://a.test/").noindex, false);
});

Deno.test("isBroken: only definitive failures, never timeouts or bot blocks", () => {
  assertEquals([404, 410, 500, 502].map(isBroken), [true, true, true, true]);
  assertEquals([0, 200, 301, 401, 403, 429].map(isBroken), [false, false, false, false, false, false]);
});

Deno.test("site health: unknown stays silent, a clean site has no findings", () => {
  const h = emptySiteHealth("https://a.test");
  assertEquals(runSiteChecks(h, [page()]).map((f) => f.check_id), []); // sitemap not "checked" => unknown, not missing
});

Deno.test("site health: each defect becomes one site-scoped finding", () => {
  const h = emptySiteHealth("https://a.test");
  h.http = { redirects_to_https: false, final_url: "http://a.test/" };
  h.hosts = { split: true, main: "a.test", variant: "www.a.test" };
  h.sitemap.checked = true; // definitive 404, nothing found
  h.broken_links = [{ url: "https://a.test/old", status: 404, found_on: ["https://a.test/"] }];
  const out = runSiteChecks(h, [page()]);
  assertEquals(out.map((f) => f.check_id).sort(), ["broken_internal_links", "host_split", "http_not_redirected", "sitemap_missing"]);
  assertEquals(out.every((f) => f.scope === "site"), true);
});

Deno.test("sitemap with dead, redirected and robots-blocked URLs is one finding with all three", () => {
  const h = emptySiteHealth("https://a.test");
  h.sitemap = { found: true, checked: true, url: "https://a.test/sitemap.xml", url_count: 40, sampled: 10,
    dead: [{ url: "https://a.test/gone", status: 404 }], redirected: [{ url: "https://a.test/a", to: "https://a.test/b" }], blocked_by_robots: ["https://a.test/private"] };
  const out = runSiteChecks(h, [page()]);
  assertEquals(out.length, 1);
  assertEquals(out[0].check_id, "sitemap_bad_urls");
  assertEquals(out[0].plain_english.includes("1 return errors, 1 redirect elsewhere, 1 are blocked by robots.txt"), true);
});

Deno.test("duplicate titles and meta are found across read pages; empty and unrendered pages are ignored", () => {
  const out = runSiteChecks(emptySiteHealth("https://a.test"), [
    page({ title: "Same Title" }, "https://a.test/1"), page({ title: "same  title" }, "https://a.test/2"),
    page({ title: "Other" }, "https://a.test/3"), page({ title: "", meta_description: "" }, "https://a.test/4"),
    page({ title: "Same Title", looks_like_empty_spa: true }, "https://a.test/5"),
  ]);
  const t = out.find((f) => f.check_id === "duplicate_titles")!;
  assertEquals(t.pages, ["https://a.test/1", "https://a.test/2"]);
  assertEquals(out.some((f) => f.check_id === "duplicate_meta"), true); // GOOD's meta repeats across pages
});

Deno.test("scoring: a site-wide finding deducts once, not diluted across pages", () => {
  const pages = ["https://a.test/", "https://a.test/b", "https://a.test/c", "https://a.test/d"];
  const f = { category: "technical" as const, severity: "critical" as const, check_id: "http_not_redirected", page: pages[0], site: true };
  const { subscores } = computeScores([f], { pages, performancePages: [] });
  assertEquals(subscores.technical, 78); // 100 - 22, not 100 - 22/4
  const perPage = computeScores([{ ...f, site: false }], { pages, performancePages: [] });
  assertEquals(perPage.subscores.technical, 95); // same finding scoped to one page is diluted (94.5 rounds up)
});

Deno.test("rubric v3 is registered and every site-scoped check is manual-fix", () => {
  const site = Object.values(CHECKS).filter((c) => c.scope === "site");
  assertEquals(site.length, 7);
  assertEquals(site.every((c) => !c.wp_applyable), true);
});
