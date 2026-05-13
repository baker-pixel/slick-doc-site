import { cn } from "@/lib/utils";

interface ScoreBreakdown {
  crawlability?: number;
  on_page?: number;
  content_quality?: number;
  technical_performance?: number;
  site_architecture?: number;
}

interface ScoreHeaderProps {
  score: number;
  label: string;
  subtitle?: string;
  breakdown?: ScoreBreakdown;
  className?: string;
}

const RING_R  = 44;
const RING_CX = 56;
const RING_CY = 56;
const CIRCUM  = 2 * Math.PI * RING_R;

function scoreColor(s: number): string {
  if (s >= 70) return "#16a34a";
  if (s >= 40) return "#d97706";
  return "#dc2626";
}

function scoreBg(s: number): string {
  if (s >= 70) return "bg-green-50 border-green-200";
  if (s >= 40) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function scoreText(s: number): string {
  if (s >= 70) return "text-green-700";
  if (s >= 40) return "text-amber-700";
  return "text-red-700";
}

const BREAKDOWN_LABELS: Record<keyof ScoreBreakdown, string> = {
  crawlability:          "Crawlability",
  on_page:               "On-Page",
  content_quality:       "Content",
  technical_performance: "Technical",
  site_architecture:     "Architecture",
};

export function ScoreHeader({ score, label, subtitle, breakdown, className }: ScoreHeaderProps) {
  const clamp  = Math.max(0, Math.min(100, score));
  const dash   = CIRCUM * (1 - clamp / 100);
  const color  = scoreColor(clamp);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Main score row */}
      <div className="flex items-center gap-6">
        {/* SVG ring */}
        <svg width={112} height={112} viewBox="0 0 112 112" className="shrink-0">
          <circle cx={RING_CX} cy={RING_CY} r={RING_R} fill="none" stroke="#e5e7eb" strokeWidth={8} />
          <circle
            cx={RING_CX} cy={RING_CY} r={RING_R}
            fill="none" stroke={color} strokeWidth={8}
            strokeDasharray={CIRCUM}
            strokeDashoffset={dash}
            strokeLinecap="round"
            transform={`rotate(-90 ${RING_CX} ${RING_CY})`}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
          <text x={RING_CX} y={RING_CY - 6} textAnchor="middle" dominantBaseline="middle"
            fontSize={22} fontWeight={700} fill={color} fontFamily="inherit">{clamp}</text>
          <text x={RING_CX} y={RING_CY + 14} textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fill="#6b7280" fontFamily="inherit">/ 100</text>
        </svg>

        {/* Labels */}
        <div className="min-w-0">
          <div className={cn("inline-block px-2 py-0.5 rounded text-xs font-bold mb-1 border", scoreBg(clamp), scoreText(clamp))}>
            {clamp >= 70 ? "Good" : clamp >= 40 ? "Needs Work" : "Critical"}
          </div>
          <h3 className="text-2xl font-bold text-gray-900 leading-tight">{label}</h3>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {/* Score breakdown pills */}
      {breakdown && Object.keys(breakdown).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(Object.entries(BREAKDOWN_LABELS) as [keyof ScoreBreakdown, string][])
            .filter(([k]) => breakdown[k] !== undefined)
            .map(([key, lbl]) => {
              const val = breakdown[key] ?? 0;
              return (
                <div key={key}
                  className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium", scoreBg(val * 4))}>
                  <span className={scoreText(val * 4)}>{val}</span>
                  <span className="text-gray-500">{lbl}</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
