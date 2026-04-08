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
  // Show top 3 or all if fewer
  const displayScores = scores.slice(0, 6);

  return (
    <section className="bg-white py-16 md:py-20">
      <div className="container mx-auto px-4 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-[#E8521A] uppercase tracking-[0.2em] text-xs font-semibold mb-8">
            Category Scores
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayScores.map((cat, i) => {
              const colors = getStatusColor(cat.status);
              return (
                <motion.div
                  key={cat.label}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-[#FAF7F2] border border-[#1A1410]/5 rounded-xl p-5 space-y-3"
                >
                  <p className="text-sm font-medium text-[#1A1410]/70">{cat.label}</p>
                  <div className="flex items-end justify-between">
                    <span
                      className={`text-4xl font-light ${colors.text}`}
                      style={{ fontFamily: "'DM Serif Display', serif" }}
                    >
                      {cat.score}
                    </span>
                    <span
                      className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${colors.badge}`}
                    >
                      {cat.status}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#1A1410]/5 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${colors.bar}`}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${cat.score}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.08 }}
                    />
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
