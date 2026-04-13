import { motion } from "framer-motion";
import { addJargonExplanations } from "@/lib/jargonHelper";

interface Action {
  title: string;
  description: string;
  tag: "Quick Win" | "Medium Term" | "Long Term";
}

interface ActionPlanSectionProps {
  actions: Action[];
}

export function ActionPlanSection({ actions }: ActionPlanSectionProps) {
  return (
    <section className="bg-[#FAF7F2] px-10 py-12 md:px-14 border-b border-[#F0EBE2]">
      <div className="max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-[#E8521A] text-[10px] tracking-[0.2em] uppercase font-semibold mb-2">
            Action Plan
          </p>
          <h2
            style={{ fontFamily: "'DM Serif Display', serif" }}
            className="text-[26px] text-[#1A1410] leading-[1.2] mb-8"
          >
            Your top recommended actions
          </h2>

          <div>
            {actions.map((action, i) => {
              const isQuick = action.tag === "Quick Win";
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="flex gap-5 items-start py-5 border-b border-[#F0EBE2] last:border-b-0"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 mt-0.5 ${
                      isQuick ? "bg-[#E8521A]" : "bg-[#3D2E22]"
                    }`}
                    style={{ fontFamily: "'DM Serif Display', serif", fontSize: "17px" }}
                  >
                    {i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap mb-1">
                      <h4 className="text-[14.5px] font-semibold text-[#1A1410]">
                        {addJargonExplanations(action.title)}
                      </h4>
                      <span
                        className={`text-[10px] font-semibold tracking-[0.1em] uppercase px-2 py-0.5 rounded-full ${
                          isQuick
                            ? "bg-[#FFF0E8] text-[#E8521A]"
                            : "bg-[#F0EBE2] text-[#7A6355]"
                        }`}
                      >
                        {action.tag}
                      </span>
                    </div>
                    <p className="text-[13.5px] text-[#7A6355] leading-[1.6]">
                      {addJargonExplanations(action.description)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
