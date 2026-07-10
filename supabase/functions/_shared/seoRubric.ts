// SEO scoring rubric (architecture v2, §04/§05).
//
// Impact and effort are FIXED per check, not eyeballed by an LLM -- so a "4"
// in one audit means the same as a "4" in another, and the impact/effort
// ranking is reproducible and debuggable. Bump RUBRIC_VERSION whenever these
// anchors change; scores are only comparable within one version.

export const RUBRIC_VERSION = "seo-rubric.v1";

export type SeoCategory = "technical" | "on_page" | "performance" | "content" | "off_page";
export type Severity = "critical" | "warning" | "good";

export interface CheckDef {
  id: string;
  category: SeoCategory;
  title: string;
  severity: Severity;
  impact: 1 | 2 | 3 | 4 | 5;   // how much fixing it moves the needle
  effort: 1 | 2 | 3 | 4 | 5;   // how hard the fix is (1 = trivial)
  wp_applyable: boolean;        // can the WordPress plugin apply it?
  /** Maps to apply-fix-to-wordpress field types when wp_applyable. */
  fixType?: string;
}

// The catalog. Objective, signal-driven checks -- each fires deterministically
// from a raw signal, so every finding carries the evidence that produced it.
export const CHECKS: Record<string, CheckDef> = {
  missing_title:        { id: "missing_title", category: "on_page", title: "Missing page title", severity: "critical", impact: 5, effort: 1, wp_applyable: true, fixType: "wp_meta_title" },
  title_too_short:      { id: "title_too_short", category: "on_page", title: "Title tag too short", severity: "warning", impact: 3, effort: 1, wp_applyable: true, fixType: "wp_meta_title" },
  title_too_long:       { id: "title_too_long", category: "on_page", title: "Title tag too long", severity: "warning", impact: 2, effort: 1, wp_applyable: true, fixType: "wp_meta_title" },
  missing_meta_desc:    { id: "missing_meta_desc", category: "on_page", title: "Missing meta description", severity: "critical", impact: 4, effort: 1, wp_applyable: true, fixType: "wp_meta_description" },
  meta_desc_length:     { id: "meta_desc_length", category: "on_page", title: "Meta description length off", severity: "warning", impact: 2, effort: 1, wp_applyable: true, fixType: "wp_meta_description" },
  missing_h1:           { id: "missing_h1", category: "on_page", title: "Missing H1 heading", severity: "critical", impact: 4, effort: 2, wp_applyable: false },
  multiple_h1:          { id: "multiple_h1", category: "on_page", title: "Multiple H1 headings", severity: "warning", impact: 2, effort: 2, wp_applyable: false },
  images_missing_alt:   { id: "images_missing_alt", category: "on_page", title: "Images missing alt text", severity: "warning", impact: 3, effort: 2, wp_applyable: true, fixType: "wp_image_alt" },
  missing_canonical:    { id: "missing_canonical", category: "technical", title: "Missing canonical tag", severity: "warning", impact: 3, effort: 1, wp_applyable: true, fixType: "wp_canonical" },
  missing_schema:       { id: "missing_schema", category: "technical", title: "No structured data (schema.org)", severity: "warning", impact: 3, effort: 3, wp_applyable: false },
  missing_viewport:     { id: "missing_viewport", category: "technical", title: "Missing mobile viewport tag", severity: "critical", impact: 4, effort: 1, wp_applyable: false },
  missing_open_graph:   { id: "missing_open_graph", category: "technical", title: "Missing Open Graph tags", severity: "warning", impact: 2, effort: 2, wp_applyable: false },
  thin_content:         { id: "thin_content", category: "content", title: "Thin content", severity: "warning", impact: 3, effort: 4, wp_applyable: false },
  perf_poor:            { id: "perf_poor", category: "performance", title: "Poor page performance", severity: "critical", impact: 5, effort: 4, wp_applyable: false },
  perf_lcp:             { id: "perf_lcp", category: "performance", title: "Slow largest contentful paint (LCP)", severity: "critical", impact: 4, effort: 4, wp_applyable: false },
  perf_cls:             { id: "perf_cls", category: "performance", title: "High layout shift (CLS)", severity: "warning", impact: 3, effort: 3, wp_applyable: false },
  perf_not_measured:    { id: "perf_not_measured", category: "performance", title: "Performance not measured", severity: "warning", impact: 1, effort: 1, wp_applyable: false },
  render_required:      { id: "render_required", category: "technical", title: "Page needs JavaScript to render", severity: "warning", impact: 3, effort: 3, wp_applyable: false },
};

// Subscore = 100 minus severity deductions within a category, scored PER PAGE
// then averaged across pages -- so the same issue on every page of a 12-page
// site doesn't sum to zero; it reflects average page health.
const SEVERITY_DEDUCTION: Record<Severity, number> = { critical: 22, warning: 10, good: 0 };
const CATEGORY_WEIGHT: Record<SeoCategory, number> = {
  technical: 0.25, on_page: 0.25, performance: 0.25, content: 0.15, off_page: 0.10,
};
// Informational findings never deduct -- "not measured" / "needs JS" describe
// a coverage gap, not a defect. They surface as findings, not as a low score.
const INFORMATIONAL = new Set(["perf_not_measured", "render_required"]);

export interface ScorableFinding { category: SeoCategory; severity: Severity; check_id: string; page: string; }

export function computeScores(
  findings: ScorableFinding[],
  opts: { pages: string[]; performancePages: string[] },
): { overall_score: number; subscores: Record<SeoCategory, number | null> } {
  const cats = Object.keys(CATEGORY_WEIGHT) as SeoCategory[];
  const pages = opts.pages.length ? opts.pages : [...new Set(findings.map((f) => f.page))];

  const subscores = {} as Record<SeoCategory, number | null>;
  for (const cat of cats) {
    // Performance is sampled, not run on every page -- average it ONLY over
    // the pages actually measured, so a genuinely slow site isn't diluted by
    // pages we never tested. No measured pages = "not measured" (null).
    const scope = cat === "performance" ? opts.performancePages : pages;
    if (scope.length === 0) { subscores[cat] = null; continue; }
    let total = 0;
    for (const page of scope) {
      const deduction = findings
        .filter((f) => f.category === cat && f.page === page && !INFORMATIONAL.has(f.check_id))
        .reduce((sum, f) => sum + SEVERITY_DEDUCTION[f.severity], 0);
      total += Math.max(0, 100 - deduction);
    }
    subscores[cat] = Math.round(total / scope.length);
  }

  // Overall = weighted blend over MEASURED categories only, renormalized so a
  // missing dimension doesn't drag the total toward zero.
  let weighted = 0, weightSum = 0;
  for (const cat of cats) {
    const s = subscores[cat];
    if (s === null) continue;
    weighted += s * CATEGORY_WEIGHT[cat];
    weightSum += CATEGORY_WEIGHT[cat];
  }
  const overall = weightSum > 0 ? Math.round(weighted / weightSum) : 0;
  return { overall_score: overall, subscores };
}
