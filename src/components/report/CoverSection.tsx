import { motion } from "framer-motion";
import { getGradeBadge } from "./ReportConfig";

interface CoverSectionProps {
  businessName?: string;
  clientDomain: string;
  reportDate: string;
  overallScore: number;
}

function gradeRingColor(score: number): { stroke: string; track: string; label: string } {
  if (score >= 80) return { stroke: "#1D9E75", track: "#E1F5EE", label: "text-[#0F6E56]" };
  if (score >= 60) return { stroke: "#EF9F27", track: "#FAEEDA", label: "text-[#854F0B]" };
  if (score >= 40) return { stroke: "#378ADD", track: "#E6F1FB", label: "text-[#185FA5]" };
  return { stroke: "#E24B4A", track: "#FDEAEA", label: "text-[#A32D2D]" };
}

function gradeHeadline(score: number): string {
  if (score >= 80) return "Your Marketing Foundation Is Solid";
  if (score >= 60) return "Good Foundation With Room to Grow";
  if (score >= 40) return "Meaningful Gaps Worth Addressing";
  return "Significant Opportunities to Unlock";
}

function gradeSubline(score: number, name: string): string {
  if (score >= 80)
    return `${name} scores in the top tier for marketing health. A few targeted fixes can push you into the 90s.`;
  if (score >= 60)
    return `${name} has solid fundamentals. Closing the gaps below will meaningfully improve performance.`;
  return `${name} has clear opportunities. Prioritise the action items below for the fastest gains.`;
}

function RingDial({ score }: { score: number }) {
  const r = 58;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const { stroke, track } = gradeRingColor(score);

  return (
    <div className="relative w-[140px] h-[140px] shrink-0">
      <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke={track} strokeWidth="11" />
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-[1s] ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          style={{ fontFamily: "'DM Serif Display', serif" }}
          className="text-[36px] leading-none text-[#1A1D23]"
        >
          {score}
        </span>
        <span className="text-[12px] text-[#8A8F9B] mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

export function CoverSection({ businessName, clientDomain, reportDate, overallScore }: CoverSectionProps) {
  const badge = getGradeBadge(overallScore);
  const { label: labelCls } = gradeRingColor(overallScore);
  const displayName = clientDomain || businessName || "";

  return (
    <section className="bg-white">
      {/* Page header */}
      <div className="px-10 py-4 border-b border-[rgba(0,0,0,0.07)] flex items-center justify-between flex-wrap gap-3 md:px-14">
        <span
          style={{ fontFamily: "'DM Serif Display', serif" }}
          className="text-[20px] text-[#1A1D23] leading-none"
        >
          {displayName}
        </span>
        <div className="text-right">
          <div className="text-[13px] text-[#8A8F9B]">{reportDate}</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A8F9B]">
            Confidential
          </div>
        </div>
      </div>

      {/* Hero card */}
      <div className="px-10 py-8 md:px-14">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-8 flex flex-col sm:flex-row gap-8 items-center sm:items-start"
        >
          <RingDial score={overallScore} />

          <div className="text-center sm:text-left">
            <span className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${labelCls}`}>
              {badge}
            </span>
            <h1
              style={{ fontFamily: "'DM Serif Display', serif" }}
              className="text-[26px] md:text-[28px] text-[#1A1D23] leading-[1.2] mt-2 mb-3"
            >
              {gradeHeadline(overallScore)}
            </h1>
            <p className="text-[13px] text-[#4A4F5C] leading-[1.65] max-w-[420px]">
              {gradeSubline(overallScore, businessName || displayName)}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
