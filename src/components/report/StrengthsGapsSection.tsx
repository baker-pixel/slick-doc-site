import { motion } from "framer-motion";
import { Check, AlertTriangle } from "lucide-react";
import { addJargonExplanations } from "@/lib/jargonHelper";

interface StrengthsGapsSectionProps {
  strengths: string[];
  gaps: string[];
}

export function StrengthsGapsSection({ strengths, gaps }: StrengthsGapsSectionProps) {
  return (
    <section className="bg-[#FAF7F2] py-16 md:py-20">
      <div className="container mx-auto px-4 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-[#E8521A] uppercase tracking-[0.2em] text-xs font-semibold mb-8">
            Key Findings
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Strengths */}
            <div className="bg-[#2D6A4F]/5 border border-[#2D6A4F]/10 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-[#2D6A4F]">Key Strengths</h3>
              <ul className="space-y-3">
                {strengths.slice(0, 4).map((s, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[#1A1410]/80 leading-relaxed">
                    <Check className="w-4 h-4 text-[#2D6A4F] mt-0.5 shrink-0" />
                    <span>{addJargonExplanations(s)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Gaps */}
            <div className="bg-[#E8521A]/5 border border-[#E8521A]/10 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-[#E8521A]">Critical Gaps</h3>
              <ul className="space-y-3">
                {gaps.slice(0, 4).map((g, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[#1A1410]/80 leading-relaxed">
                    <AlertTriangle className="w-4 h-4 text-[#E8521A] mt-0.5 shrink-0" />
                    <span>{addJargonExplanations(g)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
