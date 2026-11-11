import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Activity, Eye, Users, MousePointer, TrendingUp, RefreshCw, AlertTriangle, Plug, Clock } from "lucide-react";
import { format } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useLiveAnalytics, type LiveTraffic } from "@/hooks/use-live-analytics";
import { ModernCard, StatCard } from "./PortalUI";
import { PluginUpdateNotice } from "./PluginUpdateNotice";
import type { PortalTab } from "./ClientPortalSidebar";

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

function useSecondsSince(iso: string | undefined) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

// Day strings are plain dates (YYYY-MM-DD). Parse at noon so a time zone shift can't move them a day.
const weekday = (day: string) => format(new Date(`${day}T12:00:00`), "EEE");

function TrafficBlock({ traffic }: { traffic: Extract<LiveTraffic, { state: "active" }> }) {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2">
        <p className="text-sm font-medium text-foreground mb-2">Website visits, last 7 days</p>
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={traffic.daily.map((d) => ({ name: weekday(d.day), visits: d.visits }))}>
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <YAxis allowDecimals={false} width={32} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px" }} />
              <Area type="monotone" dataKey="visits" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-foreground mb-2">Viewing now</p>
        {traffic.viewing.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is on your site right now.</p>
        ) : (
          <ul className="space-y-2">
            {traffic.viewing.map((p) => (
              <li key={p.path} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-foreground" title={p.path}>{p.path}</span>
                <span className="text-muted-foreground tabular-nums">{p.visitors}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Notice({ icon: Icon, title, children, action }: { icon: typeof Plug; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-primary/10 shrink-0"><Icon className="h-5 w-5 text-primary" /></div>
      <div className="space-y-1.5">
        <h4 className="font-semibold text-foreground">{title}</h4>
        <p className="text-sm text-muted-foreground">{children}</p>
        {action}
      </div>
    </div>
  );
}

export default function LiveAnalyticsSection({ clientAccountId, onOpenTab }: { clientAccountId: string; onOpenTab?: (tab: PortalTab) => void }) {
  const { data, error, loading, refreshing, refresh } = useLiveAnalytics(clientAccountId);
  const age = useSecondsSince(data?.generated_at);

  const traffic = data?.traffic ?? null;
  const active = traffic?.state === "active" ? traffic : null;
  const updatedLabel = age === null ? "" : age < 10 ? "Updated just now" : age < 60 ? `Updated ${age}s ago` : `Updated ${Math.floor(age / 60)}m ago`;

  return (
    <div className="space-y-4">
      {/* The update prompt sits outside the card so it can't be missed. */}
      {traffic?.state === "needs_update" && (
        <PluginUpdateNotice currentVersion={traffic.plugin_version} forVisitorStats />
      )}

      <ModernCard className="p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 relative">
              <Activity className="h-5 w-5 text-emerald-500" />
              {!error && active && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Live</h3>
              <p className="text-sm text-muted-foreground">
                {error && data ? "Couldn't refresh. Showing the last update." : updatedLabel || "Right now and the last 7 days"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing} aria-label="Refresh live data">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {loading && !data && <p className="text-sm text-muted-foreground py-6 text-center">Loading live data...</p>}

        {!loading && !data && error && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <AlertTriangle className="h-4 w-4" /> Live data isn't available right now.
          </div>
        )}

        {data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {active && <StatCard label="On your site now" value={fmt(active.active_now)} icon={Activity} />}
              {active && <StatCard label="Visits today" value={fmt(active.visits_today)} icon={Eye} />}
              {active && <StatCard label="Visits · 7 days" value={fmt(active.visits_7d)} icon={Eye} />}
              <StatCard label="Leads · 7 days" value={fmt(data.engagement.leads_generated)} icon={Users} />
              <StatCard label="Email opens · 7 days" value={fmt(data.engagement.email_opens)} icon={TrendingUp} />
              <StatCard label="Email clicks · 7 days" value={fmt(data.engagement.email_clicks)} icon={MousePointer} />
            </div>

            {traffic === null && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Website visit numbers are unavailable right now.
              </p>
            )}

            {traffic?.state === "no_site" && (
              <Notice
                icon={Plug}
                title="Connect your website to see live visitors"
                action={onOpenTab && (
                  <Button size="sm" variant="outline" onClick={() => onOpenTab("seo")}>Connect your WordPress site</Button>
                )}
              >
                Install the Orange Door plugin on your WordPress site and your visitor numbers show up here, with no other setup.
              </Notice>
            )}

            {traffic?.state === "needs_update" && (
              <Notice icon={Clock} title="Visitor numbers are waiting on the plugin update">
                Your website's plugin is too old to report visitors. The steps above take about a minute.
              </Notice>
            )}

            {traffic?.state === "waiting" && (
              <Notice icon={Clock} title="Waiting for the first visit">
                Your plugin is up to date and counting. The numbers appear after the next visit to your site (visits by logged-in WordPress admins and editors aren't counted).
              </Notice>
            )}

            {traffic?.state === "off" && (
              <Notice icon={Plug} title="Visitor counting is turned off">
                Your team switched visitor counting off for this website. Ask them if you'd like it back on.
              </Notice>
            )}

            {active && <TrafficBlock traffic={active} />}
          </div>
        )}
      </ModernCard>
    </div>
  );
}
