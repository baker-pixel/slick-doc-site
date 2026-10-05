import { scoreToStatus, mapPriority, type ReportData } from "@/components/report/ReportConfig";

// One definition of how a Quick Analysis scan becomes a report, shared by the
// on-screen result (QuickAnalysis.tsx) and the shareable online report
// (QuickReport.tsx) so the two can never show different numbers for one scan.
// Keep in sync with send-prospect-report's server-side PDF mapping.

export interface QuickWin {
  title: string;
  description: string;
  impact: "high" | "medium";
  effort: "low" | "medium";
}

export interface ActionPlan {
  week1: { title: string; tasks: string[] };
  week2to4: { title: string; tasks: string[] };
  month2to3: { title: string; tasks: string[] };
}

export interface ScoredCategory { score: number; findings: string[]; recommendations: string[]; }

export interface AnalysisResult {
  overallScore: number;
  seo: ScoredCategory;
  conversion: ScoredCategory;
  technical: ScoredCategory;
  // Ground-truth detected (not LLM-guessed) -- see systemSignals.ts. Optional
  // only for backward compat with any cached analysis rows from before these
  // existed; every fresh analysis has them.
  engagement?: ScoredCategory;
  metrics?: ScoredCategory;
  quickWins?: QuickWin[];
  actionPlan?: ActionPlan;
  summary: string;
  /** Ground-truth (parsed, not LLM-guessed) present/missing tags — use these for strengths/gaps, never raw findings. */
  detectedStrengths?: string[];
  detectedGaps?: string[];
}

// The two SYSTEM categories a URL-only scan can't honestly assess (no page
// fetch reveals CRM setup, follow-up cadence, or sales close rate) -- shown
// locked rather than guessed, so this report never looks like it's
// inventing a number the full Gap Analysis form actually earns for real.
export const LOCKED_SYSTEM_CATEGORIES: { label: string; reason: string }[] = [
  { label: "Sequence & Nurture", reason: "Needs the full Gap Analysis — email/SMS follow-up setup isn't visible from a website scan." },
  { label: "Transaction Activation", reason: "Needs the full Gap Analysis — sales response time and close rate aren't visible from a website scan." },
];

export function getTier(score: number): "transformation" | "growth" | "optimization" {
  if (score <= 39) return "transformation";
  if (score <= 64) return "growth";
  return "optimization";
}

export function getTierLabel(tier: string) {
  switch (tier) {
    case "transformation": return "Transformation";
    case "growth": return "Growth";
    case "optimization": return "Optimization";
    default: return tier;
  }
}

export function getTierColor(tier: string) {
  switch (tier) {
    case "transformation": return "text-red-600 bg-red-50 border-red-200";
    case "growth": return "text-amber-600 bg-amber-50 border-amber-200";
    case "optimization": return "text-green-600 bg-green-50 border-green-200";
    default: return "";
  }
}

export const buildStrengths = (r: AnalysisResult): string[] =>
  (r.detectedStrengths?.length ? r.detectedStrengths : r.seo.findings).slice(0, 4);

export const buildGaps = (r: AnalysisResult): string[] =>
  (r.detectedGaps?.length
    ? r.detectedGaps
    : [
        ...r.seo.recommendations.slice(0, 1),
        ...r.conversion.recommendations.slice(0, 1),
        ...r.technical.recommendations.slice(0, 1),
        ...(r.engagement?.recommendations.slice(0, 1) ?? []),
        ...(r.metrics?.recommendations.slice(0, 1) ?? []),
      ]
  ).slice(0, 4);

export const buildActions = (r: AnalysisResult) => {
  const items: { title: string; description: string; tag: "Quick Win" | "Medium Term" | "Long Term" }[] = [
    ...(r.quickWins?.map((w) => ({ title: w.title, description: w.description, tag: "Quick Win" as const })) || []),
    ...(r.actionPlan?.week1.tasks.map((t) => ({ title: t, description: "", tag: "Quick Win" as const })) || []),
    ...(r.actionPlan?.week2to4.tasks.map((t) => ({ title: t, description: "", tag: "Medium Term" as const })) || []),
    ...(r.actionPlan?.month2to3.tasks.map((t) => ({ title: t, description: "", tag: "Long Term" as const })) || []),
  ];
  if (items.length > 0) return items;
  // No structured quick-wins/action-plan came back -- fall back to the raw recommendations.
  return [...r.seo.recommendations, ...r.conversion.recommendations, ...r.technical.recommendations]
    .map((rec, i) => ({ title: rec, description: "", tag: mapPriority("", i) }));
};

// Mirrors the full Gap Analysis form's 6 SYSTEM categories -- but only
// scores the 4 a website scan can honestly speak to (Search & Visibility
// merges the on-page SEO + technical findings; Yield Optimization is the
// conversion score; Engagement/Metrics come from ground-truth signals in
// systemSignals.ts). Sequence & Nurture and Transaction Activation stay
// locked -- they describe internal business operations no page fetch can see.
export const buildCategoryScores = (r: AnalysisResult) => {
  const searchVisibilityScore = Math.round((r.seo.score + r.technical.score) / 2);
  const scored = [
    { label: "Search & Visibility", score: searchVisibilityScore, status: scoreToStatus(searchVisibilityScore) },
    { label: "Yield Optimization", score: r.conversion.score, status: scoreToStatus(r.conversion.score) },
    ...(r.engagement ? [{ label: "Engagement & Retention", score: r.engagement.score, status: scoreToStatus(r.engagement.score) }] : []),
    ...(r.metrics ? [{ label: "Metrics & Improvement", score: r.metrics.score, status: scoreToStatus(r.metrics.score) }] : []),
  ];
  const locked = LOCKED_SYSTEM_CATEGORIES.map((c) => ({
    label: c.label, score: 0, status: "Critical" as const, locked: true, lockedReason: c.reason,
  }));
  return { scored, all: [...scored, ...locked] };
};

// Headline score reflects only what was actually assessed (avoids a
// number that can't be reconciled against the visible category cards).
export const computeOverallScore = (scored: { score: number }[]) =>
  scored.length > 0 ? Math.round(scored.reduce((sum, c) => sum + c.score, 0) / scored.length) : 0;

export function buildReportData(
  r: AnalysisResult,
  meta: { businessName: string; domain: string; reportDate: string; aiReadinessScore?: number },
): ReportData {
  const categories = buildCategoryScores(r);
  return {
    businessName: meta.businessName,
    clientDomain: meta.domain,
    reportDate: meta.reportDate,
    overallScore: computeOverallScore(categories.scored),
    aiReadinessScore: meta.aiReadinessScore,
    executiveSummary: r.summary,
    categoryScores: categories.all,
    strengths: buildStrengths(r),
    gaps: buildGaps(r),
    actions: buildActions(r),
  };
}
