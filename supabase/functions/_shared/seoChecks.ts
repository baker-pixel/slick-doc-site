// Deterministic page checks (architecture v2). Shared by the client SEO audit and the
// free website scan, so a "4" means the same thing in both and the free score is the same
// measurement a client sees. Pure functions over PageSignals: no network, no LLM.
import { CHECKS, type CheckDef, type SeoCategory, type Severity } from "./seoRubric.ts";
import { normalizeForCompare, type PageSignals } from "./seoSignals.ts";

export interface Finding {
  id: string;
  status: "open" | "queued" | "applied" | "verified" | "regressed" | "dismissed";
  check_id: string;
  category: SeoCategory;
  severity: Severity;
  title: string;
  pages: string[];
  plain_english: string;
  technical_detail: string;
  evidence: { source: string; value: unknown };
  /** "site" = whole-site finding (identity and scoring don't depend on a single page). */
  scope?: "site";
  impact: number;
  effort: number;
  wp_applyable: boolean;
  fix: { type: string; payload: Record<string, unknown>; expected_baseline: unknown } | null;
}

export function mk(check: CheckDef, page: string, plain: string, technical: string, evidence: unknown, fix: Finding["fix"] = null): Omit<Finding, "id" | "status"> {
  return {
    check_id: check.id, category: check.category, severity: check.severity, title: check.title,
    pages: [page], plain_english: plain, technical_detail: technical,
    evidence: { source: "on_page", value: evidence }, impact: check.impact, effort: check.effort,
    wp_applyable: check.wp_applyable, fix,
  };
}

// Deterministic checks over one page's signals. Each finding carries the raw
// signal that produced it (evidence) -- nothing is invented.
const IMPORTANT_TYPES = new Set(["home", "service", "product", "about", "contact", "location", "pricing", "faq"]);

export function runChecks(s: PageSignals): Array<Omit<Finding, "id" | "status">> {
  const out: Array<Omit<Finding, "id" | "status">> = [];
  const p = s.url;

  // Definitive HTTP errors only. 401/403/429 are usually bot protection, not a
  // broken page, so they fall through to the old "couldn't read it" handling.
  const http = s.probe_status ?? s.status_code;
  if (http === 404 || http === 410 || (http !== null && http >= 500 && http < 600)) {
    const gone = http === 404 || http === 410;
    out.push(mk(CHECKS.page_error, p,
      gone
        ? "This page shows a \"not found\" error. Visitors and Google can't see it, and any links or sitemap entries pointing here are wasted."
        : "This page returns a server error. Visitors and Google can't load it.",
      `HTTP ${http}.`, { status: http }));
    return out;
  }

  // A crawled page that is deliberately noindex (date archives, thank-you and landing pages) is not
  // meant to rank, so auditing its title or alt text would only add noise. Important page types,
  // and anything the sitemap lists, are different: noindex there is a real problem and falls through.
  if (s.noindex && s.page_type !== undefined && !IMPORTANT_TYPES.has(s.page_type) && !s.in_sitemap) return out;

  if (s.looks_like_empty_spa || (!s.reachable)) {
    out.push(mk(CHECKS.render_required, p,
      "This page needs JavaScript to show its content. Google and AI answer engines (ChatGPT, Claude, Perplexity) don't reliably run that JavaScript, so this page can be functionally invisible to both.",
      `Fetched via ${s.fetched_via}; body text was near-empty (likely an unrendered SPA shell).`,
      { fetched_via: s.fetched_via, reachable: s.reachable }));
    if (!s.reachable) return out; // nothing else meaningful to check
  }

  // <head> tags (title, meta description, canonical, schema, viewport, OG)
  // are typically present even when the <body> is client-rendered, so these
  // stay reliable regardless of looks_like_empty_spa.
  if (!s.title) out.push(mk(CHECKS.missing_title, p, "This page has no title — the headline Google shows in results.", "No <title> element found.", { title: s.title }, { type: "wp_meta_title", payload: {}, expected_baseline: "" }));
  else if (s.title.length < 30) out.push(mk(CHECKS.title_too_short, p, "The page title is very short and may not describe the page well.", `Title is ${s.title.length} chars (aim 50–60).`, { title: s.title, len: s.title.length }, { type: "wp_meta_title", payload: {}, expected_baseline: s.title }));
  else if (s.title.length > 60) out.push(mk(CHECKS.title_too_long, p, "The page title is long and Google may cut it off.", `Title is ${s.title.length} chars (aim under 60).`, { title: s.title, len: s.title.length }, { type: "wp_meta_title", payload: {}, expected_baseline: s.title }));

  if (!s.meta_description) out.push(mk(CHECKS.missing_meta_desc, p, "No meta description — the summary under your Google listing.", "No meta description tag found.", { meta: "" }, { type: "wp_meta_description", payload: {}, expected_baseline: "" }));
  else if (s.meta_description.length < 120 || s.meta_description.length > 160) out.push(mk(CHECKS.meta_desc_length, p, "The Google summary text is a bit off-length.", `Meta description is ${s.meta_description.length} chars (aim 150–160).`, { len: s.meta_description.length }, { type: "wp_meta_description", payload: {}, expected_baseline: s.meta_description }));

  if (!s.has_canonical) out.push(mk(CHECKS.missing_canonical, p, "No canonical tag, which can cause duplicate-content confusion.", "No rel=canonical link.", { has_canonical: false }, { type: "wp_canonical", payload: { value: s.url }, expected_baseline: null }));
  // Checks the actual @type, not just "any JSON-LD present" -- a page with
  // only e.g. BreadcrumbList schema still needs real entity markup.
  if (!s.has_entity_schema) out.push(mk(CHECKS.missing_schema, p, "Missing structured data that helps Google -- and AI answer engines like ChatGPT and Claude -- understand who you are.", "No Organization/LocalBusiness JSON-LD detected.", { has_entity_schema: false }, { type: "wp_schema_jsonld", payload: {}, expected_baseline: null }));
  if (!s.has_faq_schema && s.qa_pairs.length >= 2) out.push(mk(CHECKS.missing_faq_schema, p, "This page already answers real questions in its headings, but that's not marked up as FAQPage schema -- the exact format answer engines like ChatGPT and Perplexity look for to quote you directly.", `${s.qa_pairs.length} question-style heading(s) with answer text found, no FAQPage schema.`, { qa_count: s.qa_pairs.length }, { type: "wp_faq_jsonld", payload: {}, expected_baseline: null }));
  if (s.noindex) out.push(mk(CHECKS.noindex_page, p, "This page tells Google not to list it. It will not appear in search results at all, whatever else is fixed.", `noindex found in ${/noindex/i.test(s.x_robots_tag ?? "") ? "the X-Robots-Tag header" : "a robots meta tag"}.`, { noindex: true, x_robots_tag: s.x_robots_tag ?? "" }));

  if (s.canonical_href) {
    const here = normalizeForCompare(s.final_url ?? s.url);
    const there = normalizeForCompare(s.canonical_href, s.final_url ?? s.url);
    if (here && there && here !== there) out.push(mk(CHECKS.canonical_mismatch, p, "This page names a different page as the \"real\" version, so Google may drop this one from results.", `Canonical points to ${s.canonical_href}.`, { canonical: s.canonical_href, page: s.final_url ?? s.url }));
  }

  if (s.redirect_loop || (s.redirect_hops ?? 0) >= 2) out.push(mk(CHECKS.redirect_chain, p,
    s.redirect_loop ? "This address redirects in a loop and never loads." : "This address passes through several redirects before loading, which slows visitors and wastes Google's crawl.",
    s.redirect_loop ? "Redirect loop." : `${s.redirect_hops} redirect hops to ${s.final_url}.`, { hops: s.redirect_hops, final_url: s.final_url, loop: !!s.redirect_loop }));

  if ((s.mixed_content_count ?? 0) > 0) out.push(mk(CHECKS.mixed_content, p, `${s.mixed_content_count} file(s) on this secure page load over insecure http. Browsers may block them or show a warning.`, `${s.mixed_content_count} http:// subresource(s) on an https page.`, { count: s.mixed_content_count }));

  if (!s.has_viewport) out.push(mk(CHECKS.missing_viewport, p, "No mobile viewport tag — the page may not display well on phones.", "No viewport meta tag.", { has_viewport: false }));
  if (!s.has_open_graph) out.push(mk(CHECKS.missing_open_graph, p, "No Open Graph tags, so shared links look plain on social media.", "No og: tags.", { has_open_graph: false }));

  // <body>-dependent checks -- an unrendered SPA shell parsing as "no H1" or
  // "thin content" is a false positive from our own fetch limitation (we
  // don't execute JS), not a real content problem on the site. The
  // render_required finding above already tells the client/admin why these
  // couldn't be checked, so don't also contradict it with a confident
  // "missing H1" / "thin content" finding on the same page.
  if (!s.looks_like_empty_spa) {
    if (s.h1_count === 0) out.push(mk(CHECKS.missing_h1, p, "This page has no main heading (H1).", "No <h1> found.", { h1_count: 0 }));
    else if (s.h1_count > 1) out.push(mk(CHECKS.multiple_h1, p, "This page has several main headings; there should be one.", `${s.h1_count} <h1> elements.`, { h1_count: s.h1_count }));

    if (s.images_missing_alt > 0) out.push(mk(CHECKS.images_missing_alt, p, `${s.images_missing_alt} image(s) have no alt text, so search engines can't read them.`, `${s.images_missing_alt}/${s.image_count} images missing alt.`, { images_missing_alt: s.images_missing_alt, image_count: s.image_count }, { type: "wp_image_alt", payload: {}, expected_baseline: null }));

    if (s.word_count < 300) out.push(mk(CHECKS.thin_content, p, "This page has little text, which search engines may see as thin.", `~${s.word_count} words (aim 500+).`, { word_count: s.word_count }));
  }

  // Performance findings only where PageSpeed actually ran (sampled pages).
  // "Not measured" is emitted once at the site level by the caller, never
  // per-page -- so unsampled pages don't spam a coverage gap as findings.
  const ps = s.performance;
  if (ps) {
    if (ps.mobile_score < 50) out.push(mk(CHECKS.perf_poor, p, "This page is slow on mobile, which hurts rankings and visitors.", `Mobile performance ${ps.mobile_score}/100.`, { mobile_score: ps.mobile_score }));
    if (ps.lcp_ms !== null && ps.lcp_ms > 4000) out.push(mk(CHECKS.perf_lcp, p, "The main content takes too long to appear.", `LCP ${(ps.lcp_ms / 1000).toFixed(1)}s (target <2.5s).`, { lcp_ms: ps.lcp_ms }));
    if (ps.cls !== null && ps.cls > 0.25) out.push(mk(CHECKS.perf_cls, p, "The page jumps around as it loads.", `CLS ${ps.cls.toFixed(3)} (target <0.1).`, { cls: ps.cls }));
  }
  return out;
}
