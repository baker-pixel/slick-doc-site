// Search keywords on a client's ICP (client_accounts.icp.search_keywords): the company-type tags
// Apollo is searched with. By default the AI derives them from the ICP and they are cached, so an
// edit to the ICP drops them to be re-derived. Keywords a person typed in are different: they are
// flagged "manual" and kept, so a later edit to the summary doesn't silently undo them.

export const MIN_KEYWORD_LEN = 3;
export const MAX_KEYWORD_LEN = 60;
/** The AI derives up to 6; people may add a couple more, but a long list dilutes the search. */
export const MAX_KEYWORDS = 8;

export type KeywordSource = "ai" | "manual";

export interface WithKeywords {
  search_keywords?: string[];
  search_keywords_source?: KeywordSource;
}

/** Trim, drop too-short/too-long entries, de-duplicate ignoring case, cap the count. */
export function normalizeKeywords(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const k = raw.trim().replace(/\s+/g, " ");
    if (k.length < MIN_KEYWORD_LEN || k.length > MAX_KEYWORD_LEN) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out.slice(0, MAX_KEYWORDS);
}

/** Why a typed keyword would be rejected, or null if it is fine. Used for inline feedback. */
export function keywordProblem(raw: string): string | null {
  const k = raw.trim();
  if (k.length < MIN_KEYWORD_LEN) return `Use at least ${MIN_KEYWORD_LEN} characters.`;
  if (k.length > MAX_KEYWORD_LEN) return `Keep it under ${MAX_KEYWORD_LEN} characters.`;
  return null;
}

/**
 * The ICP object to store when the card is saved.
 *  - keywords edited, non-empty -> store them, flagged manual
 *  - keywords edited, emptied   -> drop both, so the AI derives fresh ones on the next run
 *  - keywords not touched:
 *      manual keywords          -> kept, whatever else changed
 *      AI keywords              -> dropped, they were derived from the ICP that just changed
 */
export function icpForSave<T extends WithKeywords>(icp: T, keywordsEdited: boolean): T & WithKeywords {
  const { search_keywords, search_keywords_source, ...rest } = icp;
  const current = normalizeKeywords(search_keywords);

  if (keywordsEdited) {
    return current.length > 0
      ? ({ ...rest, search_keywords: current, search_keywords_source: "manual" } as unknown as T & WithKeywords)
      : (rest as unknown as T & WithKeywords);
  }
  if (search_keywords_source === "manual" && current.length > 0) {
    return { ...rest, search_keywords: current, search_keywords_source: "manual" } as unknown as T & WithKeywords;
  }
  return rest as unknown as T & WithKeywords;
}
