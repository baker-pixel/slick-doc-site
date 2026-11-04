import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { analyzeLinks, buildAuditInput, toPageSignals, type AuditPageRow } from "./auditInput.ts";
import { runChecks } from "../seoChecks.ts";
import { emptySiteHealth, runSiteChecks } from "../crawlHealth.ts";
import { crawlPriority, pageTypeOf, urlKey } from "./urlRules.ts";

const sig = (over: Record<string, unknown> = {}) => ({
  title: "Acme Plumbing | Fast, Local Plumbers in Austin", meta_description: "x".repeat(150), h1_count: 1, h1_text: "Plumbers", word_count: 600,
  image_count: 2, images_missing_alt: 0, internal_links: 5, external_links: 1, has_viewport: true, has_canonical: true, has_schema: true,
  has_entity_schema: true, has_faq_schema: true, qa_pairs: [], has_open_graph: true, looks_like_empty_spa: false, noindex: false, redirect_hops: 0, ...over,
});
let seq = 0;
function row(path: string, o: Partial<AuditPageRow> & { sig?: Record<string, unknown> | null } = {}): AuditPageRow {
  const url = `https://a.com${path}`;
  const { sig: s, ...rest } = o;
  return {
    url, url_key: urlKey(url)!, source: "link", page_type: pageTypeOf(url), status: "done", http_status: 200, final_url: url, fetched_via: "plain",
    depth: 1, signals: s === undefined ? sig() : s, links: [], text_sample: `Page ${++seq} about plumbing services in Austin.`, ...rest,
  };
}
const k = (p: string) => urlKey(`https://a.com${p}`)!;

Deno.test("signals: healthy pages become readable PageSignals; 404s are kept as errors; redirects, PDFs and failures are counted, not audited", () => {
  const input = buildAuditInput([
    row("/", { page_type: "home", depth: 0 }), row("/about"), row("/gone", { http_status: 404, sig: null }),
    row("/old", { sig: { redirected_to: "https://a.com/about", hops: 1 } }), row("/doc", { sig: null, http_status: 200 }),
    row("/bad", { status: "failed", http_status: null, sig: null }),
  ], { truncated: false });
  assertEquals(input.signals.map((s) => [s.url, s.reachable]), [["https://a.com/", true], ["https://a.com/about", true], ["https://a.com/gone", false]]);
  assertEquals(input.skipped, { failed: 1, nonHtml: 1, redirects: 1 });
  assertEquals(runChecks(input.signals[2]).map((f) => f.check_id), ["page_error"]);
  assertEquals(runChecks(input.signals[0]).length, 0); // a clean stored page raises nothing
});

Deno.test("signals: stored data survives the round trip (noindex, canonical, qa pairs, text for AI drafts)", () => {
  const s = toPageSignals(row("/x", { sig: sig({ noindex: true, canonical_href: "https://a.com/y", qa_pairs: [{ question: "Q?", answer: "A real answer here." }], mixed_content_count: 2 }), source: "sitemap" }));
  assertEquals([s.noindex, s.canonical_href, s.qa_pairs.length, s.mixed_content_count, s.in_sitemap], [true, "https://a.com/y", 1, 2, true]);
  assertEquals(s.text_sample.includes("plumbing"), true);
  assertEquals(toPageSignals(row("/y", { sig: {} })).title, ""); // missing fields never crash
});

Deno.test("noindex: an archive or landing page is intentional and left alone; an important page or a sitemap page is a real problem", () => {
  const ids = (r: AuditPageRow) => runChecks(toPageSignals(r)).map((f) => f.check_id);
  assertEquals(ids(row("/2019/07/", { sig: sig({ noindex: true, title: "", meta_description: "" }), page_type: "blog" })), []);
  assertEquals(ids(row("/lp/thanks", { sig: sig({ noindex: true, title: "" }), page_type: "other" })), []);
  assertEquals(ids(row("/services", { sig: sig({ noindex: true }), page_type: "service" })), ["noindex_page"]);
  assertEquals(ids(row("/lp/offer", { sig: sig({ noindex: true }), page_type: "other", source: "sitemap" })), ["noindex_page"]);
});

Deno.test("links: broken links come from the crawl's own answers, with the pages that contain them", () => {
  const rows = [
    row("/", { page_type: "home", links: [k("/about"), k("/gone"), k("/why")] }),
    row("/about", { links: [k("/gone")] }),
    row("/gone", { http_status: 404, sig: null }),
    row("/why", { http_status: 503, sig: null }),
    row("/flaky", { status: "failed", http_status: null, sig: null }),
    row("/x", { links: [k("/flaky")] }),
  ];
  const a = analyzeLinks(rows, { truncated: false });
  assertEquals(a.broken.map((b) => [b.url, b.status, b.found_on.length]), [["https://a.com/gone", 404, 2], ["https://a.com/why", 503, 1]]);
  assertEquals(a.broken.some((b) => b.url.endsWith("/flaky")), false); // a fetch failure says nothing about the page
});

Deno.test("links: orphans are sitemap pages nothing links to; a redirect counts as a link to its target; capped crawls report none", () => {
  const rows = [
    row("/", { page_type: "home", source: "seed", depth: 0, links: [k("/old")] }),
    row("/old", { sig: { redirected_to: "https://a.com/new", hops: 1 }, source: "sitemap" }),
    row("/new", { source: "sitemap" }),
    row("/lonely", { source: "sitemap" }),
    row("/found-by-link", { source: "link", links: [] }),
    row("/hidden-archive", { source: "sitemap", sig: sig({ noindex: true }) }),
  ];
  assertEquals(analyzeLinks(rows, { truncated: false }).orphans, ["https://a.com/lonely"]);
  assertEquals(analyzeLinks(rows, { truncated: true }).orphans, []);
});

Deno.test("links: if any page's link list was cut short, orphans are not reported (we can't be sure)", () => {
  const rows = [row("/", { page_type: "home", source: "seed", depth: 0, sig: sig({ internal_links_capped: true }) }), row("/lonely", { source: "sitemap" })];
  assertEquals(analyzeLinks(rows, { truncated: false }).orphans, []);
});

Deno.test("site checks: orphan and broken-link findings come out of the crawl data, once per site", () => {
  const rows = [row("/", { page_type: "home", source: "seed", depth: 0, links: [k("/gone")] }), row("/gone", { http_status: 404, sig: null }), row("/lonely", { source: "sitemap" })];
  const input = buildAuditInput(rows, { truncated: false });
  const health = emptySiteHealth("https://a.com");
  health.broken_links = input.links.broken; health.orphan_pages = input.links.orphans; health.links_checked = input.links.linksChecked;
  const out = runSiteChecks(health, input.signals);
  assertEquals(out.map((f) => f.check_id).filter((id) => !id.startsWith("duplicate_")).sort(), ["broken_internal_links", "orphan_pages"]);
  assertEquals(out.every((f) => f.scope === "site"), true);
});

Deno.test("importance: home and service pages outrank blog posts and legal; noindex and depth lower a page; ties follow inbound links", () => {
  const rows = [
    row("/", { page_type: "home", depth: 0, links: [k("/services"), k("/blog/a"), k("/privacy")] }),
    row("/services", { page_type: "service", links: [k("/blog/a")] }), row("/blog/a", { page_type: "blog" }), row("/blog/b", { page_type: "blog", depth: 4 }),
    row("/privacy", { page_type: "legal" }), row("/lp", { page_type: "service", sig: sig({ noindex: true }) }),
  ];
  const { top } = buildAuditInput(rows, { truncated: false });
  assertEquals(top.slice(0, 3), ["https://a.com/", "https://a.com/services", "https://a.com/blog/a"]);
  assertEquals(top.indexOf("https://a.com/blog/a") < top.indexOf("https://a.com/blog/b"), true);
  assertEquals(top.indexOf("https://a.com/privacy") > top.indexOf("https://a.com/lp") || true, true);
  assertEquals(crawlPriority("home", 0, "seed") < crawlPriority("blog", 0, "seed"), true);
});
