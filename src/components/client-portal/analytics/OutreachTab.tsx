import { AlertTriangle, MousePointer, TrendingUp, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { OutreachOverview } from "@/hooks/use-analytics-overview";
import { fmtNum, pctChange } from "@/lib/analyticsInsights";
import { ModernCard, StatCard } from "../PortalUI";
import type { PortalTab } from "../ClientPortalSidebar";

interface Props {
  data?: OutreachOverview;
  loading: boolean;
  failed: boolean;
  days: number;
  onOpenTab?: (tab: PortalTab) => void;
}

export function OutreachTab({ data, loading, failed, days, onOpenTab }: Props) {
  if (loading) return <Skeleton className="h-72 w-full rounded-2xl" />;
  if (failed || !data) {
    return (
      <ModernCard className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4" /> Lead and email numbers aren't available right now.
      </ModernCard>
    );
  }
  const { current: c, previous: p } = data;
  const chart = data.daily.map((d) => ({
    name: format(new Date(`${d.day}T12:00:00`), days <= 7 ? "EEE" : "MMM d"),
    Leads: d.leads,
    Opens: d.opens,
  }));
  const none = c.leads === 0 && c.opens === 0 && c.clicks === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="New leads" value={fmtNum(c.leads)} icon={Users} trend={pctChange(c.leads, p.leads)} trendLabel="vs previous period" />
        <StatCard label="Email opens" value={fmtNum(c.opens)} icon={TrendingUp} trend={pctChange(c.opens, p.opens)} trendLabel="vs previous period" />
        <StatCard label="Email clicks" value={fmtNum(c.clicks)} icon={MousePointer} trend={pctChange(c.clicks, p.clicks)} trendLabel="vs previous period" />
      </div>
      <ModernCard className="p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-foreground">Leads and opens per day</h3>
            <p className="text-sm text-muted-foreground">Last {days} days</p>
          </div>
          {onOpenTab && <Button variant="outline" size="sm" onClick={() => onOpenTab("prospects")}>See your leads</Button>}
        </div>
        {none ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No lead activity in this period yet. New leads and opens appear here as outreach runs.</p>
        ) : (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} interval="preserveStartEnd" minTickGap={28} />
                <YAxis allowDecimals={false} width={28} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px" }} />
                <Bar dataKey="Leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Opens" fill="hsl(142.1 76.2% 36.3%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex gap-5 mt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-primary" />Leads</span>
          <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-600" />Opens</span>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Opens count real people only; automated mail-security scanners are excluded, matching your Lead Outreach tab.</p>
      </ModernCard>
    </div>
  );
}
