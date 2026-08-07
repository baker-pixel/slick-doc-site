import { motion } from "framer-motion";
import { Info } from "lucide-react";

const INK = "#1A1D23";
const MUTED = "#8A8F9B";
const TEAL = "#1D9E75";
const TEAL_BG = "#E1F5EE";
const TEAL_TEXT = "#0F6E56";
const BORDER = "#EAECF0";

interface ScoreTrajectorySectionProps {
  currentScore: number;
  aiReadinessScore?: number;
  weakestPillar?: { label: string; score: number };
  /** Up to 4 titles shown as numbered milestones along the projected line -- reuses the action plan's own recommendations, no separate data source. */
  milestones: string[];
}

const CHART_X0 = 60;
const CHART_X1 = 560;
const CHART_TOP = 20;
const CHART_BOTTOM = 190;

function yFor(score: number): number {
  return CHART_BOTTOM - (Math.max(0, Math.min(100, score)) / 100) * (CHART_BOTTOM - CHART_TOP);
}

/** Cubic bezier point at t, used both for the drawn path and for placing milestone dots exactly on it. */
function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt ** 3 * p0 + 3 * mt ** 2 * t * p1 + 3 * mt * t ** 2 * p2 + t ** 3 * p3;
}

export function ScoreTrajectorySection({ currentScore, aiReadinessScore, weakestPillar, milestones }: ScoreTrajectorySectionProps) {
  // Modeled, forward-only projection: closes half the remaining gap to 100
  // over 3 months IF the action plan below is followed. Never a fabricated
  // backward "history" -- there is no prior measurement for a first-time
  // report, so the chart starts at the one real point we have (today).
  const projectedScore = Math.min(96, Math.round(currentScore + (100 - currentScore) * 0.5));
  const gain = projectedScore - currentScore;

  const todayY = yFor(currentScore);
  const endY = yFor(projectedScore);
  const c1x = CHART_X0 + (CHART_X1 - CHART_X0) * 0.4;
  const c2x = CHART_X0 + (CHART_X1 - CHART_X0) * 0.6;

  const curvePath = `M ${CHART_X0} ${todayY} C ${c1x} ${todayY}, ${c2x} ${endY}, ${CHART_X1} ${endY}`;
  const areaPath = `${curvePath} L ${CHART_X1} ${CHART_BOTTOM} L ${CHART_X0} ${CHART_BOTTOM} Z`;

  const shownMilestones = milestones.slice(0, 4);
  const milestoneDots = shownMilestones.map((title, i) => {
    const t = (i + 1) / (shownMilestones.length + 1);
    const x = bezierPoint(t, CHART_X0, c1x, c2x, CHART_X1);
    const y = bezierPoint(t, todayY, todayY, endY, endY);
    return { title, x, y, n: i + 1 };
  });

  const gridScores = [0, 25, 50, 75, 100];

  const stats: { label: string; value: string; sub: string }[] = [
    { label: "Composite score", value: `${currentScore}/100`, sub: currentScore >= 70 ? "Above local average" : "Below local average" },
  ];
  if (typeof aiReadinessScore === "number") {
    stats.push({
      label: "AI readiness score",
      value: `${aiReadinessScore}/100`,
      sub: aiReadinessScore >= 60 ? "Legible to AI search" : aiReadinessScore >= 30 ? "Partially AI-legible" : "Rarely surfaced in AI search",
    });
  }
  if (weakestPillar) {
    stats.push({ label: "Weakest area", value: `${weakestPillar.score}/100`, sub: weakestPillar.label });
  }

  return (
    <section className="bg-white px-10 py-12 md:px-14 border-b border-[rgba(0,0,0,0.06)]">
      <div className="max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <div className="border border-[rgba(0,0,0,0.08)] rounded-xl p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[14px] font-semibold text-[#1A1D23]">Composite score trajectory</h3>
                <Info size={13} className="text-[#8A8F9B]" />
              </div>
              {gain > 0 && (
                <div className="text-right bg-[#F7F8FA] border border-[rgba(0,0,0,0.06)] rounded-lg px-4 py-2">
                  <div className="text-[10px] text-[#8A8F9B] uppercase tracking-[0.08em]">3-month potential</div>
                  <div className="text-[18px] font-semibold" style={{ color: TEAL_TEXT }}>+{gain} pts</div>
                </div>
              )}
            </div>

            <svg viewBox="0 0 620 240" className="w-full h-auto">
              {gridScores.map((s) => (
                <g key={s}>
                  <line x1={CHART_X0} y1={yFor(s)} x2={CHART_X1} y2={yFor(s)} stroke={BORDER} strokeWidth={1} />
                  <text x={CHART_X0 - 8} y={yFor(s) + 3} textAnchor="end" fontSize="10" fill={MUTED}>{s}</text>
                </g>
              ))}

              {/* Projected area + dashed line -- clearly a model, styled distinctly (dash + color) from the one real point */}
              <path d={areaPath} fill={TEAL_BG} opacity={0.6} />
              <path d={curvePath} fill="none" stroke={TEAL} strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" />

              {milestoneDots.map((m) => (
                <g key={m.n}>
                  <circle cx={m.x} cy={m.y} r={9} fill="white" stroke={TEAL} strokeWidth={1.5} />
                  <text x={m.x} y={m.y + 3.5} textAnchor="middle" fontSize="9" fontWeight={700} fill={TEAL_TEXT}>{m.n}</text>
                </g>
              ))}

              {/* Today -- the one real, measured point */}
              <circle cx={CHART_X0} cy={todayY} r={5} fill={INK} />
              <text x={CHART_X0} y={CHART_BOTTOM + 16} textAnchor="middle" fontSize="10" fill={MUTED}>Today</text>
              <text x={CHART_X1} y={CHART_BOTTOM + 16} textAnchor="middle" fontSize="10" fill={MUTED}>3-month potential</text>
            </svg>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-5 mt-2 mb-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: INK }} />
                <span className="text-[11px] text-[#4A4F5C]">Today's real score</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-0 border-t-2 border-dashed shrink-0" style={{ borderColor: TEAL }} />
                <span className="text-[11px] text-[#4A4F5C]">Projected, if gaps are closed</span>
              </div>
            </div>

            {shownMilestones.length > 0 && (
              <p className="text-[11px] text-[#8A8F9B] mb-4">
                {shownMilestones.map((t, i) => `${i + 1}. ${t}`).join("   ·   ")}
              </p>
            )}

            {/* Stat tiles -- Tailwind needs the full class name statically present to keep it in the build, so no template-literal grid-cols */}
            <div className={`grid grid-cols-1 gap-3 mt-4 ${stats.length === 3 ? "sm:grid-cols-3" : stats.length === 2 ? "sm:grid-cols-2" : ""}`}>
              {stats.map((s) => (
                <div key={s.label} className="border border-[rgba(0,0,0,0.08)] rounded-lg px-4 py-3">
                  <p className="text-[11px] text-[#8A8F9B] mb-1">{s.label}</p>
                  <p style={{ fontFamily: "'DM Serif Display', serif" }} className="text-[22px] text-[#1A1D23] leading-none mb-1">{s.value}</p>
                  <p className="text-[11px] font-medium text-[#4A4F5C]">{s.sub}</p>
                </div>
              ))}
            </div>

            {gain > 0 && (
              <p className="text-[11px] text-[#8A8F9B] mt-4 leading-[1.6]">
                The dashed line is a modeled estimate assuming the action plan below is implemented on the suggested timeline — it is not a guarantee. There is no prior measurement for a first assessment, so the chart starts at today's real score rather than an invented history.
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
