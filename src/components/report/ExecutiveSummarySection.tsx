import { motion } from "framer-motion";
import { addJargonExplanations } from "@/lib/jargonHelper";
import { usePrintMode } from "./PrintModeContext";

interface ExecutiveSummarySectionProps {
  summary: string;
  biggestOpportunity?: string;
  topGap?: string;
  topRecommendation?: string;
}

export function ExecutiveSummarySection({
  summary,
  biggestOpportunity,
  topGap,
  topRecommendation,
}: ExecutiveSummarySectionProps) {
  const opportunity = biggestOpportunity || topRecommendation || topGap;
  const printMode = usePrintMode();
  const reveal = printMode
    ? { animate: { opacity: 1, y: 0 } }
    : { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };

  return (
    <section className="bg-white px-10 py-12 md:px-14 border-b border-[rgba(0,0,0,0.06)]">
      <div className="max-w-3xl">
        <motion.div {...reveal}>
          <p className="text-[#0F6E56] text-[11px] tracking-[0.12em] uppercase font-semibold mb-2">
            Executive Summary
          </p>
          <h2
            style={{ fontFamily: "'DM Serif Display', serif" }}
            className="text-[26px] text-[#1A1D23] leading-[1.2] mb-5"
          >
            What this means for your business
          </h2>
          <p className="text-[14px] text-[#4A4F5C] leading-[1.7] max-w-[620px]">
            {addJargonExplanations(summary)}
          </p>

          {opportunity && (
            <div className="bg-[#E1F5EE] border-l-[3px] border-[#1D9E75] rounded-r-xl px-6 py-5 mt-8">
              <p className="text-[11px] tracking-[0.12em] uppercase text-[#0F6E56] font-semibold mb-1.5">
                Your biggest opportunity
              </p>
              <p
                style={{ fontFamily: "'DM Serif Display', serif" }}
                className="text-[19px] text-[#1A1D23] leading-snug"
              >
                {addJargonExplanations(opportunity)}
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
