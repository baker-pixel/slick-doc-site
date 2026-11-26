import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Percent change vs the previous period; undefined hides the pill. */
  trend?: number;
  spark?: number[];
  note?: string;
  loading?: boolean;
}

export function KpiCard({ label, value, icon: Icon, trend, spark, note, loading }: Props) {
  const up = trend !== undefined && trend >= 0;
  return (
    <div className="rounded-2xl bg-card border border-border/50 p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0"><Icon className="h-4 w-4 text-primary" /></div>
          <span className="text-sm text-muted-foreground truncate">{label}</span>
        </div>
        {!loading && trend !== undefined && (
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shrink-0",
            up ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400",
          )}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      {loading ? <Skeleton className="h-9 w-24" /> : <p className="text-3xl font-bold text-foreground tabular-nums">{value}</p>}
      <div className="h-9 -mx-1">
        {!loading && spark && spark.length > 1 && spark.some((v) => v > 0) && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.12} strokeWidth={1.5} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {note && <p className="text-xs text-muted-foreground -mt-1">{note}</p>}
    </div>
  );
}
