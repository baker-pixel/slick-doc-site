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
    <section className="bg-white py-16 md:py-20">
      <div className="container mx-auto px-4 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="space-y-8"
        >
          <p className="text-[#E8521A] uppercase tracking-[0.2em] text-xs font-semibold">
            Action Plan
          </p>

          <div className="space-y-5">
            {actions.map((action, i) => {
              const isQuickWin = action.tag === "Quick Win";
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="flex gap-4 items-start"
                >
                  {/* Number */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0 ${
                      isQuickWin ? "bg-[#E8521A]" : "bg-[#1A1410]/60"
                    }`}
                  >
                    {i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="text-[#1A1410] font-semibold text-[15px]">
                        {addJargonExplanations(action.title)}
                      </h4>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isQuickWin
                            ? "bg-[#E8521A]/10 text-[#E8521A]"
                            : action.tag === "Long Term"
                            ? "bg-[#1A1410]/5 text-[#1A1410]/50"
                            : "bg-[#1A1410]/5 text-[#1A1410]/50"
                        }`}
                      >
                        {action.tag}
                      </span>
                    </div>
                    <p className="text-sm text-[#1A1410]/60 leading-relaxed">
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
