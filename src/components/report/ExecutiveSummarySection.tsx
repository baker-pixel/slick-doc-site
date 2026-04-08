import { motion } from "framer-motion";
import { addJargonExplanations } from "@/lib/jargonHelper";

interface ExecutiveSummarySectionProps {
  summary: string;
  biggestOpportunity?: string;
}

export function ExecutiveSummarySection({ summary, biggestOpportunity }: ExecutiveSummarySectionProps) {
  return (
    <section className="bg-[#FAF7F2] py-16 md:py-20">
      <div className="container mx-auto px-4 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="space-y-6"
        >
          <p className="text-[#E8521A] uppercase tracking-[0.2em] text-xs font-semibold">
            Executive Summary
          </p>
          <p className="text-[#1A1410] text-lg leading-relaxed">
            {addJargonExplanations(summary)}
          </p>

          {biggestOpportunity && (
            <div className="border-l-4 border-[#E8521A] bg-white rounded-r-lg p-5 mt-6">
              <p className="text-xs uppercase tracking-[0.15em] text-[#E8521A] font-semibold mb-2">
                Biggest Opportunity
              </p>
              <p className="text-[#1A1410] leading-relaxed">
                {addJargonExplanations(biggestOpportunity)}
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
