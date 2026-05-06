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
