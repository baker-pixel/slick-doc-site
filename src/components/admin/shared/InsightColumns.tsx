import { CheckCircle, Zap, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QuickWin {
  action: string;
  effort: "low" | "medium" | string;
  impact: "high" | "medium" | string;
}

interface InsightColumnsProps {
  workingWell:     string[];
  quickWins:       QuickWin[];
  recommendations?: string[];
  className?: string;
}

function effortColor(e: string) {
  return e === "low" ? "bg-green-100 text-green-700 border-green-200" : "bg-amber-100 text-amber-700 border-amber-200";
}
function impactColor(i: string) {
  return i === "high" ? "bg-purple-100 text-purple-700 border-purple-200" : "bg-blue-100 text-blue-700 border-blue-200";
}

export function InsightColumns({ workingWell, quickWins, recommendations, className }: InsightColumnsProps) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-4", className)}>
      {/* What's working */}
      <div className="rounded-lg border bg-green-50 border-green-200 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm font-semibold text-green-700">What's Working</span>
        </div>
        {workingWell.length === 0 ? (
          <p className="text-xs text-muted-foreground">No strengths detected yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {workingWell.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick wins */}
      <div className="rounded-lg border bg-amber-50 border-amber-200 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-700">Quick Wins</span>
        </div>
        {quickWins.length === 0 ? (
          <p className="text-xs text-muted-foreground">No quick wins identified.</p>
        ) : (
          <ul className="space-y-2">
            {quickWins.map((win, i) => (
              <li key={i} className="text-sm text-gray-700 space-y-1">
                <p className="leading-snug">{win.action}</p>
                <div className="flex gap-1">
                  <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 h-auto", effortColor(win.effort))}>
                    {win.effort} effort
                  </Badge>
                  <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5 h-auto", impactColor(win.impact))}>
                    {win.impact} impact
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recommendations */}
      <div className="rounded-lg border bg-blue-50 border-blue-200 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-700">Recommendations</span>
        </div>
        {!recommendations || recommendations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No additional recommendations.</p>
        ) : (
          <ul className="space-y-1.5">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-blue-500 mt-0.5 shrink-0">→</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
