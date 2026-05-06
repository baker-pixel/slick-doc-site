import { motion } from "framer-motion";
import { addJargonExplanations } from "@/lib/jargonHelper";

interface Action {
  title: string;
  description: string;
  tag: "Quick Win" | "Medium Term" | "Long Term";
}

const TAG_STYLES: Record<string, string> = {
  "Quick Win":    "bg-[#E1F5EE] text-[#0F6E56] border border-[#1D9E75]/25",
  "Medium Term":  "bg-[#FAEEDA] text-[#854F0B] border border-[#EF9F27]/25",
  "Long Term":    "bg-[#E6F1FB] text-[#185FA5] border border-[#378ADD]/25",
};

const NUMBER_BG: Record<string, string> = {
  "Quick Win":   "bg-[#1D9E75]",
  "Medium Term": "bg-[#EF9F27]",
  "Long Term":   "bg-[#378ADD]",
};

interface ActionPlanSectionProps {
  actions: Action[];
}

export function ActionPlanSection({ actions }: ActionPlanSectionProps) {
  return (
    <section className="bg-[#F7F8FA] px-10 py-12 md:px-14 border-b border-[rgba(0,0,0,0.06)]">
      <div className="max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-[#0F6E56] text-[11px] tracking-[0.12em] uppercase font-semibold mb-2">
            Action Plan
          </p>
          <h2
            style={{ fontFamily: "'DM Serif Display', serif" }}
            className="text-[26px] text-[#1A1D23] leading-[1.2] mb-2"
          >
            Your top recommended actions
          </h2>
          <p className="text-[13px] text-[#8A8F9B] mb-8">
            Prioritised by impact — address in order for fastest gains.
          </p>

          <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl overflow-hidden">
            {actions.map((action, i) => {
              const tagStyle = TAG_STYLES[action.tag] ?? TAG_STYLES["Medium Term"];
              const numBg = NUMBER_BG[action.tag] ?? NUMBER_BG["Medium Term"];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="flex gap-4 items-center px-6 py-4 border-b border-[rgba(0,0,0,0.06)] last:border-b-0"
                >
                  {/* Number */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 text-[12px] font-semibold ${numBg}`}
                  >
                    {i + 1}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium text-[#1A1D23]">
                      {addJargonExplanations(action.title)}
                    </p>
                    {action.description && (
                      <p className="text-[12.5px] text-[#6B7280] leading-[1.55] mt-0.5 hidden sm:block">
                        {addJargonExplanations(action.description)}
                      </p>
                    )}
                  </div>

                  {/* Tag */}
                  <span className={`text-[10px] font-semibold tracking-[0.10em] uppercase px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${tagStyle}`}>
                    {action.tag}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
