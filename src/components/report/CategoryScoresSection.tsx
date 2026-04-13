import { motion } from "framer-motion";
import { getStatusColor } from "./ReportConfig";

interface CategoryScore {
  label: string;
  score: number;
  status: "Strong" | "Moderate" | "Weak" | "Critical";
}

interface CategoryScoresSectionProps {
  scores: CategoryScore[];
}

export function CategoryScoresSection({ scores }: CategoryScoresSectionProps) {
  const displayScores = scores.slice(0, 6);

  return (
    <section className="bg-[#FAF7F2] px-10 py-12 md:px-14 border-b border-[#F0EBE2]">
      <div className="max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-[#E8521A] text-[10px] tracking-[0.2em] uppercase font-semibold mb-2">
            Category Scores
          </p>
          <h2
            style={{ fontFamily: "'DM Serif Display', serif" }}
            className="text-[26px] text-[#1A1410] leading-[1.2] mb-8"
          >
            Detailed findings
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayScores.map((cat, i) => {
              const colors = getStatusColor(cat.status);
              return (
                <motion.div
                  key={cat.label}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-white border border-[rgba(60,35,15,0.12)] rounded-xl p-5"
                >
                  <p className="text-[11px] tracking-[0.12em] uppercase text-[#7A6355] font-medium mb-3">
                    {cat.label}
                  </p>
                  <div
                    className={`text-[40px] leading-none mb-2.5 ${colors.text}`}
                    style={{ fontFamily: "'DM Serif Display', serif" }}
                  >
                    {cat.score}
                  </div>
                  <div className="h-[5px] bg-[#F0EBE2] rounded-full overflow-hidden mb-2">
                    <motion.div
                      className={`h-full rounded-full ${colors.bar}`}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${cat.score}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.08 }}
                    />
                  </div>
                  <span className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${colors.badge}`}>
                    {cat.status}
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
