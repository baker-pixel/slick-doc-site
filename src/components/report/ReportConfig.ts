// Report data config — swap this object for different clients
export interface ReportConfig {
  clientDomain: string;
  reportDate: string;
  overallScore: number;
  gradeBadge: string;
  executiveSummary: string;
  biggestOpportunity: string;
  categoryScores: {
    label: string;
    score: number;
    status: "Strong" | "Moderate" | "Weak" | "Critical";
  }[];
  strengths: string[];
  gaps: string[];
  actions: {
    title: string;
    description: string;
    tag: "Quick Win" | "Medium Term" | "Long Term";
  }[];
}

export function getGradeBadge(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Good Foundation";
  if (score >= 45) return "Needs Work";
  return "Critical";
}

export function getStatusColor(status: string): {
  text: string;
  bg: string;
  bar: string;
  badge: string;
} {
  switch (status) {
    case "Strong":
      return {
        text: "text-[#2D6A4F]",
        bg: "bg-[#2D6A4F]/10",
        bar: "bg-[#2D6A4F]",
        badge: "bg-[#2D6A4F]/15 text-[#2D6A4F] border-[#2D6A4F]/30",
      };
    case "Moderate":
      return {
        text: "text-[#B45309]",
        bg: "bg-[#B45309]/10",
        bar: "bg-[#B45309]",
        badge: "bg-[#B45309]/15 text-[#B45309] border-[#B45309]/30",
      };
    case "Weak":
      return {
        text: "text-[#E8521A]",
        bg: "bg-[#E8521A]/10",
        bar: "bg-[#E8521A]",
        badge: "bg-[#E8521A]/15 text-[#E8521A] border-[#E8521A]/30",
      };
    default:
      return {
        text: "text-red-600",
        bg: "bg-red-500/10",
        bar: "bg-red-500",
        badge: "bg-red-500/15 text-red-600 border-red-500/30",
      };
  }
}

export function scoreToStatus(score: number): "Strong" | "Moderate" | "Weak" | "Critical" {
  if (score >= 70) return "Strong";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "Weak";
  return "Critical";
}
