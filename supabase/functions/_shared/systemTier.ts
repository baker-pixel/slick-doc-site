// The ONE rule mapping a SYSTEM score to the plan we'd recommend.
// Plan names match what is sold (SYSTEM Foundation / Growth / Transformation).
// Shared by analyze-website, send-prospect-report and the browser, so the scan
// result, the emailed report and the stored lead can never name different plans.
// Pure TypeScript: no Deno or DOM APIs.

export type RecommendedTier = "foundation" | "growth" | "transformation";

/** Lower score = bigger rebuild needed. */
export function recommendTier(score: number): RecommendedTier {
  if (score <= 39) return "transformation";
  if (score <= 64) return "growth";
  return "foundation";
}

export function tierLabel(tier: string): string {
  switch (tier) {
    case "transformation": return "Transformation";
    case "growth": return "Growth";
    case "foundation": return "Foundation";
    default: return tier;
  }
}

export function tierColor(tier: string): string {
  switch (tier) {
    case "transformation": return "text-red-600 bg-red-50 border-red-200";
    case "growth": return "text-amber-600 bg-amber-50 border-amber-200";
    case "foundation": return "text-green-600 bg-green-50 border-green-200";
    default: return "";
  }
}
