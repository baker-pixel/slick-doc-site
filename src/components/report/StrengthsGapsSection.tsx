import { motion } from "framer-motion";
import { addJargonExplanations } from "@/lib/jargonHelper";
import { usePrintMode } from "./PrintModeContext";

interface StrengthsGapsSectionProps {
  strengths: string[];
  gaps: string[];
}

export function StrengthsGapsSection({ strengths, gaps }: StrengthsGapsSectionProps) {
  const printMode = usePrintMode();
  const reveal = printMode
    ? { animate: { opacity: 1, y: 0 } }
    : { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };

  return (
    <section className="bg-white px-10 py-12 md:px-14 border-b border-[rgba(0,0,0,0.06)]">
      <div className="max-w-3xl">
        <motion.div {...reveal}>
          <p className="text-[#0F6E56] text-[11px] tracking-[0.12em] uppercase font-semibold mb-2">
            Analysis
          </p>
          <h2
            style={{ fontFamily: "'DM Serif Display', serif" }}
            className="text-[26px] text-[#1A1D23] leading-[1.2] mb-8"
          >
            Key strengths &amp; critical gaps
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Strengths */}
            <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <span className="w-2 h-2 rounded-full bg-[#1D9E75] shrink-0" />
                <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#0F6E56]">
                  What's working
                </p>
              </div>
              <ul className="space-y-4">
                {strengths.slice(0, 4).map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#E1F5EE] flex items-center justify-center shrink-0 mt-0.5 text-[11px] text-[#0F6E56] font-bold">
                      ✓
                    </div>
                    <span className="text-[13px] text-[#1A1D23] leading-[1.6]">
                      {addJargonExplanations(s)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Gaps */}
            <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <span className="w-2 h-2 rounded-full bg-[#E24B4A] shrink-0" />
                <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#A32D2D]">
                  Critical gaps
                </p>
              </div>
              <ul className="space-y-4">
                {gaps.slice(0, 4).map((g, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#FDEAEA] flex items-center justify-center shrink-0 mt-0.5 text-[11px] text-[#A32D2D] font-bold">
                      !
                    </div>
                    <span className="text-[13px] text-[#1A1D23] leading-[1.6]">
                      {addJargonExplanations(g)}
                    </span>
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
