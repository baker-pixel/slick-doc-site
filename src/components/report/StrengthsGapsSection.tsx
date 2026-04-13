import { motion } from "framer-motion";
import { addJargonExplanations } from "@/lib/jargonHelper";

interface StrengthsGapsSectionProps {
  strengths: string[];
  gaps: string[];
}

export function StrengthsGapsSection({ strengths, gaps }: StrengthsGapsSectionProps) {
  return (
    <section className="bg-white px-10 py-12 md:px-14 border-b border-[#F0EBE2]">
      <div className="max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-[#E8521A] text-[10px] tracking-[0.2em] uppercase font-semibold mb-2">
            Analysis
          </p>
          <h2
            style={{ fontFamily: "'DM Serif Display', serif" }}
            className="text-[26px] text-[#1A1410] leading-[1.2] mb-8"
          >
            Key strengths &amp; critical gaps
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Strengths */}
            <div className="bg-[#F0FBF4] border border-[#9FD8AE] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-[#2D6A4F] shrink-0" />
                <p className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#2D6A4F]">
                  Key Strengths
                </p>
              </div>
              <ul className="space-y-3.5">
                {strengths.slice(0, 4).map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#D8F3DC] flex items-center justify-center shrink-0 mt-0.5 text-[11px] text-[#2D6A4F] font-bold">
                      ✓
                    </div>
                    <span className="text-[13.5px] text-[#2C2218] leading-[1.55]">
                      {addJargonExplanations(s)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Gaps */}
            <div className="bg-[#FFF7F0] border border-[#F4B89A] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-[#E8521A] shrink-0" />
                <p className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#E8521A]">
                  Critical Gaps
                </p>
              </div>
              <ul className="space-y-3.5">
                {gaps.slice(0, 4).map((g, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#FBE8DF] flex items-center justify-center shrink-0 mt-0.5 text-[11px] text-[#E8521A] font-bold">
                      !
                    </div>
                    <span className="text-[13.5px] text-[#2C2218] leading-[1.55]">
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
