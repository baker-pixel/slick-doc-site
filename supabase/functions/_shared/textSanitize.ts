// Model output cleanup. The content models (gpt-oss via Groq/OpenAI fallback)
// occasionally emit invisible characters mid-word and mangle rare proper nouns
// -- e.g. "Innermetrix" came out as "Innermetra<ZWSP>x" and "Innermre<ZWSP>x" in
// posts that were client-approved and published. Nothing cleaned model output
// before it reached a client's page, so we do it here.

// zero-width space/non-joiner/joiner, word joiner, BOM, soft hyphen
const INVISIBLE = /\u200B|\u200C|\u200D|\u2060|\uFEFF|\u00AD/g;

/** Strip invisible characters and turn U+2011 (non-breaking hyphen, which breaks copy/paste and search) into "-". */
export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, "").replace(/\u2011/g, "-");
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * Repairs near-miss spellings of a single-word brand name ("Innermetrax", "Innermrex").
 * Conservative: token must share the brand's first 4 letters, be within N edits
 * (2, or 3 for brands of 9+ letters) and within 3 chars of its length, so
 * ordinary words are never touched.
 * Multi-word brand names are left alone.
 */
export function fixBrandName(text: string, brandName: string | null | undefined): string {
  const brand = (brandName ?? "").trim();
  if (brand.length < 6 || /\s/.test(brand)) return text;
  const lower = brand.toLowerCase();
  const maxEdits = brand.length >= 9 ? 3 : 2;
  return text.replace(/[A-Za-z]{5,}/g, (word) => {
    const w = word.toLowerCase();
    if (w === lower) return word;
    if (w.slice(0, 4) !== lower.slice(0, 4)) return word;
    if (Math.abs(w.length - lower.length) > 3) return word;
    return levenshtein(w, lower) <= maxEdits ? brand : word;
  });
}

export function cleanGeneratedText(text: string, brandName?: string | null): string {
  return fixBrandName(stripInvisible(text), brandName);
}
