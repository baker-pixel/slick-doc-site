import { motion } from "framer-motion";
import { addJargonExplanations } from "@/lib/jargonHelper";

interface ExecutiveSummarySectionProps {
  summary: string;
  biggestOpportunity?: string;
}

export function ExecutiveSummarySection({ summary, biggestOpportunity }: ExecutiveSummarySectionProps) {
  return (
    <section className="bg-white px-10 py-12 md:px-14 border-b border-[#F0EBE2]">
      <div className="max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-[#E8521A] text-[10px] tracking-[0.2em] uppercase font-semibold mb-2">
            Executive Summary
          </p>
          <h2
            style={{ fontFamily: "'DM Serif Display', serif" }}
            className="text-[26px] text-[#1A1410] leading-[1.2] mb-4"
          >
            What this means for your business
          </h2>
          <p className="text-[14.5px] text-[#7A6355] leading-[1.75] max-w-[600px]">
            {addJargonExplanations(summary)}
          </p>

          {biggestOpportunity && (
            <div className="bg-[#FBE8DF] border-l-[3px] border-[#E8521A] rounded-r-xl px-6 py-5 mt-7">
              <p className="text-[10px] tracking-[0.18em] uppercase text-[#E8521A] font-semibold mb-1">
                Your biggest opportunity
              </p>
              <p
                style={{ fontFamily: "'DM Serif Display', serif" }}
                className="text-[20px] text-[#1A1410] leading-snug"
              >
                {addJargonExplanations(biggestOpportunity)}
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
