import { motion } from "framer-motion";
import { Search, MousePointer, Zap, Mail, DollarSign, Users, BarChart3 } from "lucide-react";
import { getStatusColor } from "./ReportConfig";

interface CategoryScore {
  label: string;
  score: number;
  status: "Strong" | "Moderate" | "Weak" | "Critical";
}

interface CategoryScoresSectionProps {
  scores: CategoryScore[];
}

function getPillarIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes("search") || l.includes("seo") || l.includes("visib"))
    return <Search size={18} />;
  if (l.includes("yield") || l.includes("convers") || l.includes("cta") || l.includes("transaction"))
    return <MousePointer size={18} />;
  if (l.includes("sequence") || l.includes("nurture") || l.includes("email"))
    return <Mail size={18} />;
  if (l.includes("revenue") || l.includes("sales") || l.includes("activation"))
    return <DollarSign size={18} />;
  if (l.includes("engagement") || l.includes("retention"))
    return <Users size={18} />;
  if (l.includes("metric") || l.includes("analytic") || l.includes("measure") || l.includes("improvement"))
    return <BarChart3 size={18} />;
  return <Zap size={18} />;
}

export function CategoryScoresSection({ scores }: CategoryScoresSectionProps) {
  const displayScores = scores.slice(0, 6);

  return (
    <section className="bg-[#F7F8FA] px-10 py-12 md:px-14 border-b border-[rgba(0,0,0,0.06)]">
      <div className="max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-[#0F6E56] text-[11px] tracking-[0.12em] uppercase font-semibold mb-2">
            Category Scores
          </p>
          <h2
            style={{ fontFamily: "'DM Serif Display', serif" }}
            className="text-[26px] text-[#1A1D23] leading-[1.2] mb-8"
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
                  transition={{ delay: i * 0.07 }}
                  className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl p-5"
                >
                  {/* Icon circle */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center mb-4"
                    style={{ background: colors.hexBg, color: colors.hex }}
                  >
                    {getPillarIcon(cat.label)}
                  </div>

                  {/* Score */}
                  <div
                    className={`text-[40px] leading-none mb-1.5 ${colors.text}`}
                    style={{ fontFamily: "'DM Serif Display', serif" }}
                  >
                    {cat.score}
                  </div>

                  {/* Label */}
                  <p className="text-[13px] text-[#4A4F5C] font-medium mb-3">{cat.label}</p>

                  {/* Progress bar */}
                  <div className="h-[3px] bg-[#EAECF0] rounded-full overflow-hidden mb-3">
                    <motion.div
                      className={`h-full rounded-full ${colors.bar}`}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${cat.score}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.07 }}
                    />
                  </div>

                  {/* Badge */}
                  <span className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full tracking-[0.08em] uppercase ${colors.badge}`}>
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
