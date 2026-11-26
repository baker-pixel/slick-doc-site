import { Sparkles } from "lucide-react";

export function InsightsStrip({ insights }: { insights: string[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-orange-500/5 p-4 flex gap-3">
      <div className="p-2 rounded-lg bg-amber-500/10 h-fit shrink-0"><Sparkles className="h-4 w-4 text-amber-500" /></div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">What changed</p>
        <ul className="space-y-1">
          {insights.map((t) => <li key={t} className="text-sm text-muted-foreground">{t}</li>)}
        </ul>
      </div>
    </div>
  );
}
