import { motion } from "framer-motion";
import { getGradeBadge } from "./ReportConfig";

interface CoverSectionProps {
  clientDomain: string;
  reportDate: string;
  overallScore: number;
}

function CoverDial({ score }: { score: number }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-[120px] h-[120px] shrink-0">
      <svg viewBox="0 0 120 120" width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          stroke="#E8521A"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span style={{ fontFamily: "'DM Serif Display', serif" }} className="text-[36px] text-white leading-none">
          {score}
        </span>
        <span className="text-[11px] text-white/45 tracking-widest uppercase mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

export function CoverSection({ clientDomain, reportDate, overallScore }: CoverSectionProps) {
  const badge = getGradeBadge(overallScore);

  return (
    <section className="relative bg-[#1A1410] overflow-hidden px-10 pt-16 pb-14 md:px-14">
      {/* Decorative circles */}
      <div className="absolute top-[-80px] right-[-80px] w-[360px] h-[360px] rounded-full bg-[#E8521A] opacity-[0.12] pointer-events-none" />
      <div className="absolute bottom-[-40px] left-[200px] w-[200px] h-[200px] rounded-full bg-[#F2906B] opacity-[0.08] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-3xl"
      >
        {/* Eyebrow */}
        <p className="text-[#F2906B] text-[11px] tracking-[0.18em] uppercase font-medium mb-7">
          Confidential · Orange Door Digital Marketing
        </p>

        {/* Title */}
        <h1
          style={{ fontFamily: "'DM Serif Display', serif" }}
          className="text-[38px] text-white leading-[1.15] mb-2"
        >
          Marketing Gap Analysis
        </h1>

        {/* Domain */}
        <p className="text-white/50 text-base mb-14">{clientDomain}</p>

        {/* Score row */}
        <div className="flex items-end gap-10 flex-wrap">
          <CoverDial score={overallScore} />

          <div className="flex flex-col gap-1.5">
            <div>
              <strong className="text-white text-[15px] font-medium block">{badge}</strong>
              <span className="text-white/55 text-[13px]">Overall score</span>
            </div>
            <div className="mt-1">
              <strong className="text-white text-[15px] font-medium block">{reportDate}</strong>
              <span className="text-white/55 text-[13px]">Report date</span>
            </div>
            <span className="mt-3 inline-block bg-[#E8521A] text-white text-[12px] font-semibold tracking-[0.06em] px-4 py-1.5 rounded-full w-fit">
              Ready to improve
            </span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
