import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { scoreConversion, scoreSearchAndTechnical, SCAN_SCORE_VERSION } from "./scanScore.ts";
import type { PageSignals } from "./seoSignals.ts";

const GOOD: PageSignals = {
  url: "https://a.test/", reachable: true, fetched_via: "plain", status_code: 200,
  title: "Acme Plumbing | Fast, Local Plumbers in Austin", meta_description: "x".repeat(150), h1_count: 1, word_count: 800,
  image_count: 4, images_missing_alt: 0, internal_links: 10, external_links: 2, has_viewport: true, has_canonical: true, has_schema: true,
  has_entity_schema: true, has_faq_schema: true, qa_pairs: [], has_open_graph: true, looks_like_empty_spa: false, text_sample: "", performance: null,
};
const page = (over: Partial<PageSignals> = {}, url = "https://a.test/"): PageSignals => ({ ...GOOD, ...over, url });

Deno.test("a clean site scores 100 on SEO and technical, with nothing flagged", () => {
  const r = scoreSearchAndTechnical([page(), page({}, "https://a.test/about")]);
  assertEquals([r.seo, r.technical, r.pagesChecked, r.checks.length], [100, 100, 2, 0]);
});

Deno.test("more problems means a lower score, and each problem is named with its evidence", () => {
  const one = scoreSearchAndTechnical([page({ meta_description: "" })]);
  const many = scoreSearchAndTechnical([page({ meta_description: "", title: "", h1_count: 0, has_viewport: false, has_entity_schema: false })]);
  assertEquals(many.seo < one.seo, true);
  assertEquals(many.technical < 100, true);
  assertEquals(one.checks.map((c) => c.check_id), ["missing_meta_desc"]);
  assertEquals(many.checks.some((c) => c.check_id === "missing_viewport" && c.severity === "critical"), true);
});

Deno.test("scores are averaged per page, so one bad page doesn't zero a site", () => {
  const bad = page({ title: "", meta_description: "", h1_count: 0 }, "https://a.test/bad");
  const r = scoreSearchAndTechnical([page(), page({}, "https://a.test/b"), page({}, "https://a.test/c"), bad]);
  assertEquals(r.seo > 70, true);
  assertEquals(r.checks.find((c) => c.check_id === "missing_title")?.pages, 1);
});

Deno.test("unreachable pages are ignored, not scored as failures", () => {
  const down = page({ reachable: false }, "https://a.test/gone");
  assertEquals(scoreSearchAndTechnical([page(), down]).pagesChecked, 1);
});

Deno.test("an un-rendered JavaScript shell is flagged as limited instead of scored as thin or missing H1", () => {
  const r = scoreSearchAndTechnical([page({ looks_like_empty_spa: true, h1_count: 0, word_count: 3 })]);
  assertEquals(r.limited, true);
  assertEquals(r.checks.some((c) => c.check_id === "missing_h1" || c.check_id === "thin_content"), false);
});

Deno.test("same input, same output, with a versioned rubric", () => {
  const input = [page({ meta_description: "" }), page({ title: "" }, "https://a.test/x")];
  assertEquals(scoreSearchAndTechnical(input), scoreSearchAndTechnical(input));
  assertEquals(SCAN_SCORE_VERSION.startsWith("scan-score.v1+seo-rubric."), true);
});

const FULL = `<html><body><a href="tel:+15125550100">Call</a><a href="/book">Book now</a><a href="/q">Get a free quote</a><button>Contact us</button>
<form action="/send"><input name="email"></form><p>Licensed and insured. Free estimate, no obligation. Since 2004.</p></body></html>`;

Deno.test("conversion: every point traces to something on the page", () => {
  const r = scoreConversion(FULL);
  assertEquals(r.score, 20 + 15 + 25 + 15 + 10 + 15); // form, tel, 3+ buttons, /book, trust, offer
  assertEquals(r.signals.every((s) => s.found), true);
  assertEquals(r.recommendations.length <= 4, true);
});

Deno.test("conversion: an empty brochure page scores 0 and says exactly what is missing", () => {
  const r = scoreConversion("<html><body><h1>Welcome</h1><p>We do things.</p></body></html>");
  assertEquals(r.score, 0);
  assertEquals(r.findings.some((f) => f.includes("No contact or lead form")), true);
  assertEquals(r.findings.some((f) => f.includes("No phone number")), true);
});

Deno.test("conversion: a printed phone number earns less than a tap-to-call one; scripts don't count as text", () => {
  const printed = scoreConversion("<body><p>Call us at (512) 555-0100</p></body>");
  assertEquals(printed.signals[1].points, 8);
  const inScript = scoreConversion("<body><script>var t='free quote $99 licensed'</script></body>");
  assertEquals(inScript.score, 0);
});

Deno.test("conversion: a lone nav 'Contact' link and an app-download button count as an action", () => {
  assertEquals(scoreConversion('<nav><a href="/contact">Contact</a></nav>').signals[2].points, 15);
  assertEquals(scoreConversion('<a href="/app">Get the iOS app</a>').signals[2].points, 15);
});
