import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Trend } from "@/lib/cycleView";

export interface ChannelStat { label: string; value: string }

interface Props {
  icon: LucideIcon;
  title: string;
  headline: { value: string; unit: string };
  /** Per-day line under the headline, already formatted. */
  rateLine?: string;
  trend: Trend;
  sample: { text: string; thin: boolean };
  stats: ChannelStat[];
  chips?: { label: string; value: string }[];
  chipsTitle?: string;
  footnote?: string;
}

function TrendPill({ trend }: { trend: Trend }) {
  if (trend.state === "too_few") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        <Info className="h-3 w-3" /> Too few to compare yet
      </span>
    );
  }
  const Icon = trend.state === "up" ? ArrowUpRight : trend.state === "down" ? ArrowDownRight : Minus;
  const tone =
    trend.state === "up" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
    trend.state === "down" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" :
    "bg-muted text-muted-foreground";
  const text = trend.state === "flat" ? "About the same as last cycle" : `${trend.state === "up" ? "Up" : "Down"} ${Math.abs(trend.pct)}% a day vs last cycle`;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", tone)}>
      <Icon className="h-3.5 w-3.5" /> {text}
    </span>
  );
}

/** One channel's result for the cycle: a headline number, an honest comparison, and the numbers behind it. */
export function ChannelCard({ icon: Icon, title, headline, rateLine, trend, sample, stats, chips, chipsTitle, footnote }: Props) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card p-5 sm:p-6 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0"><Icon className="h-4 w-4 text-primary" /></div>
          <h3 className="text-sm font-semibold truncate">{title}</h3>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", sample.thin ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
          {sample.text}
        </span>
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums">{headline.value}</span>
          <span className="text-sm text-muted-foreground">{headline.unit}</span>
        </div>
        {rateLine && <p className="mt-1 text-sm text-muted-foreground">{rateLine}</p>}
        <div className="mt-3"><TrendPill trend={trend} /></div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/50 pt-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      {chips && chips.length > 0 && (
        <div>
          {chipsTitle && <p className="mb-2 text-xs text-muted-foreground">{chipsTitle}</p>}
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c.label} className="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1 text-xs">
                <span className="truncate max-w-[10rem]">{c.label}</span>
                <span className="font-semibold tabular-nums">{c.value}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
    </div>
  );
}
