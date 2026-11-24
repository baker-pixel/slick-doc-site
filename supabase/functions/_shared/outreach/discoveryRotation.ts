// Discovery variety. Apollo search with the same keyword set returns the same
// top-ranked companies every day, so after a few weeks every result is already
// in the client's pipeline ("seen") and runs return 0 new leads. These helpers
// make each run look somewhere new: rotate which keyword leads, and when a whole
// pass finds nothing, widen (new keywords, then a broader geography).

export const MAX_KEYWORDS = 18;

/** One plan per keyword (deep, focused results), then every keyword together. */
export function buildSearchPlans(keywords: string[]): string[][] {
  const unique = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];
  if (unique.length <= 1) return unique.length ? [unique] : [];
  return [...unique.map((k) => [k]), unique];
}

/** The plans in the order this run should try them: today's first, then the rest in rotation. */
export function rotatePlans<T>(plans: T[], runCount: number): T[] {
  if (plans.length === 0) return [];
  const start = ((runCount % plans.length) + plans.length) % plans.length;
  return [...plans.slice(start), ...plans.slice(0, start)];
}

/**
 * Next-broader geography, or null when there is nothing broader to try.
 * "Knoxville, TN metro" -> "TN"; "United States" / "Global" / a single term -> null.
 */
export function widenGeography(geography: string): string | null {
  const g = geography.replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (!g || /global|worldwide|united states|usa|\bus\b/i.test(g)) return null;
  const parts = g.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const broader = parts[parts.length - 1].replace(/\s*(metro area|metro|region)\s*$/i, "").trim();
  return broader && broader.toLowerCase() !== g.toLowerCase() ? broader : null;
}

/**
 * Location term Apollo's organization/people search can match. Its docs list
 * cities, US states, countries and postal codes ("texas", "tokyo", "spain"); the
 * ICP's geography is LLM-written prose, e.g. "United States (focus on urban and
 * suburban markets)", which matches nothing and silently returns zero companies.
 * Drops parenthetical asides, trailing clauses and "metro"/"region" suffixes, and
 * maps the common spellings of the US to "united states". Returns "" when nothing
 * usable is left, so the caller omits the filter instead of sending junk.
 */
export function normalizeGeographyForApollo(geography: string): string {
  let g = (geography ?? "").replace(/\s*\(.*?\)\s*/g, " ");
  g = g.split(/\s[-\u2013\u2014:]\s|;/)[0];
  g = g.replace(/\s*(metro area|metro|region)\s*$/i, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (/^(the )?(united states( of america)?|usa|u\.s\.a?\.?|us)$/.test(g)) return "united states";
  return g;
}

/** Append new keywords to the cached list, case-insensitively de-duplicated and capped. */
export function mergeKeywords(existing: string[], fresh: string[], cap = MAX_KEYWORDS): string[] {
  const seen = new Set(existing.map((k) => k.toLowerCase()));
  const out = [...existing];
  for (const k of fresh) {
    const t = k.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, cap);
}
