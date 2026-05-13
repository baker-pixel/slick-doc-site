import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface PriorityAction {
  priority: number;
  action: string;
  category: string;
  estimated_effort: string;
}

interface ActionPriorityListProps {
  actions: PriorityAction[];
  className?: string;
}

function priorityBadge(p: number) {
  if (p <= 2) return "bg-red-100 text-red-700 border-red-300";
  if (p <= 5) return "bg-amber-100 text-amber-700 border-amber-300";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

const CAT_COLORS: Record<string, string> = {
  technical:    "bg-purple-100 text-purple-700 border-purple-200",
  content:      "bg-blue-100 text-blue-700 border-blue-200",
  architecture: "bg-teal-100 text-teal-700 border-teal-200",
  local:        "bg-green-100 text-green-700 border-green-200",
  "on-page":    "bg-orange-100 text-orange-700 border-orange-200",
};

function catColor(cat: string): string {
  return CAT_COLORS[cat.toLowerCase()] ?? "bg-gray-100 text-gray-600 border-gray-200";
}

const EFFORT_ICONS: Record<string, string> = {
  low: "●○○", medium: "●●○", high: "●●●",
};

export function ActionPriorityList({ actions, className }: ActionPriorityListProps) {
  if (!actions || actions.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No actions generated yet.</p>;
  }

  const sorted = [...actions].sort((a, b) => a.priority - b.priority);

  return (
    <div className={cn("space-y-2", className)}>
      {sorted.map((action, i) => {
        const effort = (action.estimated_effort ?? "").toLowerCase();
        const effortKey = effort.includes("low") ? "low" : effort.includes("high") ? "high" : "medium";
        return (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50 transition-colors">
            {/* Priority badge */}
            <Badge variant="outline" className={cn("shrink-0 font-bold text-xs px-2 py-0.5 min-w-[36px] text-center", priorityBadge(action.priority))}>
              P{action.priority}
            </Badge>

            {/* Action text */}
            <p className="flex-1 text-sm text-gray-800 leading-snug pt-0.5">{action.action}</p>

            {/* Tags */}
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {action.category && (
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-auto capitalize", catColor(action.category))}>
                  {action.category}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground font-mono tracking-tighter" title={action.estimated_effort}>
                {EFFORT_ICONS[effortKey] ?? "●○○"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
