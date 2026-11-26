import { Sparkles } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import type { Snapshot } from "@/hooks/use-analytics-snapshots";
import { fmtNum } from "@/lib/analyticsInsights";
import { EmptyState, ModernCard } from "../PortalUI";
import { BarChart3 } from "lucide-react";

export function ReportsTab({ snapshots, loading }: { snapshots?: Snapshot[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!snapshots || snapshots.length === 0) {
    return <EmptyState icon={BarChart3} title="No weekly reports yet" description="Your weekly summaries appear here after your first full week." />;
  }
  const highlights = snapshots[0].highlights?.items?.filter(Boolean) ?? [];
  const range = (s: Snapshot) => `${format(new Date(s.period_start), "MMM d")} – ${format(new Date(s.period_end), "MMM d, yyyy")}`;
  const hasVisits = snapshots.some((s) => s.metrics.website_visits !== undefined);
  return (
    <div className="space-y-6">
      <ModernCard className="p-6">
        <h3 className="font-semibold text-foreground mb-1">Weekly reports</h3>
        <p className="text-sm text-muted-foreground mb-4">Your past weekly summaries, newest first.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border/60">
                <th className="py-2 pr-4 font-medium">Week</th>
                <th className="py-2 pr-4 font-medium text-right">Leads</th>
                <th className="py-2 pr-4 font-medium text-right">Email opens</th>
                {hasVisits && <th className="py-2 font-medium text-right">Website visits</th>}
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-b border-border/30 last:border-0">
                  <td className="py-2.5 pr-4 text-foreground">{range(s)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(s.metrics.leads_generated)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(s.metrics.email_opens)}</td>
                  {hasVisits && <td className="py-2.5 text-right tabular-nums">{fmtNum(s.metrics.website_visits)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ModernCard>
      {highlights.length > 0 && (
        <ModernCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-amber-500/10"><Sparkles className="h-5 w-5 text-amber-500" /></div>
            <div><h3 className="font-semibold text-foreground">Highlights</h3><p className="text-sm text-muted-foreground">From your latest weekly report</p></div>
          </div>
          <ul className="space-y-2">{highlights.map((h) => <li key={h} className="text-sm text-foreground">• {h}</li>)}</ul>
        </ModernCard>
      )}
    </div>
  );
}
