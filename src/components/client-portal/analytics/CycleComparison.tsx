import { format } from "date-fns";
import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCycleMetrics, type CycleWindowMetrics } from "@/hooks/use-cycle-metrics";
import { fmtNum } from "@/lib/analyticsInsights";

// Cycles are not the same length (a new invoice closes the old cycle early), so a change is
// judged per day, and only when both cycles are long enough and have enough events to mean anything.
const MIN_DAYS = 5;
const MIN_EVENTS = 5;

const sumViews = (m: CycleWindowMetrics) => Object.values(m.social.by_platform).reduce((a, p) => a + p.views_total, 0);

interface Row { label: string; cur: number | null; prev: number | null; note?: string }

function change(cur: number | null, prev: number | null, curDays: number, prevDays: number): string {
  if (cur === null || prev === null) return "";
  if (curDays < MIN_DAYS || prevDays < MIN_DAYS || cur + prev < MIN_EVENTS || prev === 0) return "too few to compare";
  const pct = Math.round(((cur / curDays) / (prev / prevDays) - 1) * 100);
  return `${pct > 0 ? "+" : ""}${pct}% per day`;
}

/** This cycle's results next to the last cycle's, on the client's Analytics page. */
export function CycleComparison({ clientAccountId }: { clientAccountId: string }) {
  const { data, isLoading } = useCycleMetrics(clientAccountId);
  if (isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (!data) return null;

  const c = data.current;
  const p = data.previous?.metrics ?? null;
  const rows: Row[] = [
    { label: "Posts published", cur: c.social.published, prev: p?.social.published ?? null },
    { label: "Social views", cur: sumViews(c), prev: p ? sumViews(p) : null, note: "Facebook does not report views" },
    { label: "New leads", cur: c.outreach.leads, prev: p?.outreach.leads ?? null },
    { label: "Email opens (real people)", cur: c.outreach.opens, prev: p?.outreach.opens ?? null },
    { label: "Link clicks", cur: c.outreach.clicks, prev: p?.outreach.clicks ?? null },
    { label: "Replies", cur: c.outreach.replies, prev: p?.outreach.replies ?? null },
    {
      label: "Website visits", cur: c.website.visits, prev: p?.website.visits ?? null,
      note: c.website.days_with_data < c.website.window_days ? `data for ${c.website.days_with_data} of ${c.website.window_days} days` : undefined,
    },
  ];

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <RefreshCw className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-semibold">
            Cycle {data.cycle.cycle_no}{data.previous ? ` compared with cycle ${data.previous.cycle_no}` : ""}
          </h3>
          <span className="text-sm text-muted-foreground">
            {format(new Date(data.cycle.start), "MMM d")} – {format(new Date(data.cycle.end), "MMM d")} ({Math.round(c.window.days)} days
            {p ? `, previous ${Math.round(p.window.days)} days` : ""})
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-4 font-medium">&nbsp;</th>
                <th className="py-1 pr-4 text-right font-medium">This cycle</th>
                <th className="py-1 pr-4 text-right font-medium">Previous</th>
                <th className="py-1 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-border/50">
                  <td className="py-2 pr-4">
                    {r.label}
                    {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.cur === null ? "—" : fmtNum(r.cur)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.prev === null ? "—" : fmtNum(r.prev)}</td>
                  <td className="py-2 text-muted-foreground">{change(r.cur, r.prev, c.window.days, p?.window.days ?? 0)}</td>
                </tr>
              ))}
              {c.seo.score_end !== null && (
                <tr className="border-t border-border/50">
                  <td className="py-2 pr-4">SEO score</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{c.seo.score_end}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{c.seo.score_before ?? "—"}</td>
                  <td className="py-2 text-muted-foreground">
                    {c.seo.score_before !== null ? `${c.seo.score_end - c.seo.score_before > 0 ? "+" : ""}${c.seo.score_end - c.seo.score_before} points` : ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {c.website.top_referrers.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Top visit sources: {c.website.top_referrers.map((r) => `${r.host} (${r.views})`).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
