import { format } from "date-fns";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { goalProgress, goalScale, metricLabel, type Goal } from "@/lib/cycleView";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * One goal on a single track: where it started, where it is now, the target. Shows nothing for a goal
 * that nothing measures yet, and says plainly when the number is below where the goal started.
 */
export function GoalCard({ goal, closed = false }: { goal: Goal; closed?: boolean }) {
  const p = goalProgress(goal);
  if (!p || goal.baseline === null || goal.current === null || goal.target === null) return null;
  const s = goalScale(goal.baseline, goal.current, goal.target);
  const lo = Math.min(s.start, s.now), hi = Math.max(s.start, s.now);
  const good = p.state === "progress" || p.state === "reached";

  const summary =
    p.state === "reached" ? "Target reached." :
    p.state === "progress" ? `${plural(Math.round(p.moved), "point")} up since the start. ${Math.round(p.toGo)} to go.` :
    p.state === "below_start" ? `${plural(Math.round(Math.abs(p.moved)), "point")} below where this goal started. ${Math.round(p.toGo)} to go.` :
    `No change since the start. ${Math.round(p.toGo)} to go.`;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0"><Target className="h-4 w-4 text-primary" /></div>
          <span className="text-sm font-medium truncate">{metricLabel(goal.metric)}</span>
        </div>
        {goal.due && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            Aim: {Math.round(goal.target)} by {format(new Date(goal.due), "MMM d")}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums">{Math.round(goal.current)}</span>
        <span className="text-sm text-muted-foreground">{closed ? "at the end of this cycle" : "now"} · started at {Math.round(goal.baseline)} · target {Math.round(goal.target)}</span>
      </div>

      {/* Track: filled from the start to now, with a tick for the start and a flag for the target. */}
      <div className="relative mt-6 mb-7 h-2.5 rounded-full bg-muted" role="img" aria-label={`${metricLabel(goal.metric)} ${Math.round(goal.current)}, started at ${Math.round(goal.baseline)}, target ${Math.round(goal.target)}`}>
        <div className={cn("absolute inset-y-0 rounded-full", good ? "bg-emerald-500/70" : "bg-amber-500/70")} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        <div className="absolute -top-1 w-0.5 bg-muted-foreground/60" style={{ left: `${s.start}%`, height: "1.125rem" }} />
        <div className="absolute -bottom-6 -translate-x-1/2 text-[11px] text-muted-foreground" style={{ left: `${s.start}%` }}>Start</div>
        <div className={cn("absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow", good ? "bg-emerald-500" : "bg-amber-500")} style={{ left: `${s.now}%` }} />
        <div className="absolute -top-1 w-0.5 bg-primary" style={{ left: `${s.target}%`, height: "1.125rem" }} />
        <div className="absolute -bottom-6 -translate-x-1/2 text-[11px] font-medium text-primary" style={{ left: `${s.target}%` }}>Target</div>
      </div>

      <p className={cn("text-sm", good ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>{summary}</p>
      <p className="mt-1 text-xs text-muted-foreground line-clamp-2" title={goal.objective}>{goal.objective}</p>
    </div>
  );
}
