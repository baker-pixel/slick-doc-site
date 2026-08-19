// Single data contract both the web report and the PDF render from --
// whichever surface builds this object, <ReportView> renders it identically.
export interface ReportData {
  businessName?: string;
  clientDomain: string;
  reportDate: string;
  overallScore: number;
  /** Free-tier heuristic score from ai_readiness_scores.total_score -- undefined while still loading, not yet computed. */
  aiReadinessScore?: number;
  executiveSummary?: string;
  biggestOpportunity?: string;
  categoryScores: {
    label: string;
    score: number;
    status: "Strong" | "Moderate" | "Weak" | "Critical";
    /** Category wasn't assessed (e.g. Quick Analysis can't see internal
     *  business-ops categories from a URL scan alone) -- render as locked
     *  instead of a fabricated score. */
    locked?: boolean;
    lockedReason?: string;
  }[];
  strengths: string[];
  gaps: string[];
  actions: {
    title: string;
    description: string;
    tag: "Quick Win" | "Medium Term" | "Long Term";
  }[];
}

// Kept as an alias -- ReportConfig was the old name, still referenced by its
// original call sites.
export type ReportConfig = ReportData;

export function getGradeBadge(score: number): string {
  if (score >= 80) return "Strong Performance";
  if (score >= 60) return "Good Foundation";
  if (score >= 40) return "Needs Work";
  return "Needs Urgent Attention";
}

export function getStatusColor(status: string): {
  text: string;
  bg: string;
  bar: string;
  badge: string;
  hex: string;
  hexBg: string;
} {
  switch (status) {
    case "Strong":
      return {
        text: "text-[#0F6E56]",
        bg: "bg-[#E1F5EE]",
        bar: "bg-[#1D9E75]",
        badge: "bg-[#E1F5EE] text-[#0F6E56] border border-[#1D9E75]/25",
        hex: "#1D9E75",
        hexBg: "#E1F5EE",
      };
    case "Moderate":
      return {
        text: "text-[#854F0B]",
        bg: "bg-[#FAEEDA]",
        bar: "bg-[#EF9F27]",
        badge: "bg-[#FAEEDA] text-[#854F0B] border border-[#EF9F27]/25",
        hex: "#EF9F27",
        hexBg: "#FAEEDA",
      };
    case "Weak":
      return {
        text: "text-[#185FA5]",
        bg: "bg-[#E6F1FB]",
        bar: "bg-[#378ADD]",
        badge: "bg-[#E6F1FB] text-[#185FA5] border border-[#378ADD]/25",
        hex: "#378ADD",
        hexBg: "#E6F1FB",
      };
    default: // Critical
      return {
        text: "text-[#A32D2D]",
        bg: "bg-[#FDEAEA]",
        bar: "bg-[#E24B4A]",
        badge: "bg-[#FDEAEA] text-[#A32D2D] border border-[#E24B4A]/25",
        hex: "#E24B4A",
        hexBg: "#FDEAEA",
      };
  }
}

export function scoreToStatus(score: number): "Strong" | "Moderate" | "Weak" | "Critical" {
  if (score >= 70) return "Strong";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "Weak";
  return "Critical";
}

/** Shared priority-tag mapping -- was duplicated across Report.tsx, QuickAnalysis.tsx, and generateGapReportPDF.ts. */
export function mapPriority(priority: string, index: number): "Quick Win" | "Medium Term" | "Long Term" {
  const p = (priority || "").toLowerCase();
  if (p.includes("high") || p.includes("quick") || p.includes("immediate") || p.includes("urgent")) return "Quick Win";
  if (p.includes("low") || p.includes("long")) return "Long Term";
  if (p.includes("medium") || p.includes("mid")) return "Medium Term";
  return index < 3 ? "Quick Win" : index < 6 ? "Medium Term" : "Long Term";
}
