import { AlertTriangle, Clock, Eye, Loader2, Lock, MousePointer, Plug, RefreshCw, TrendingUp, Unplug, Users } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { useGoogleAnalytics } from "@/hooks/use-google-analytics";
import { useLiveAnalytics } from "@/hooks/use-live-analytics";
import type { PluginTraffic } from "@/hooks/use-analytics-overview";
import { fmtNum, pctChange } from "@/lib/analyticsInsights";
import { ModernCard, StatCard } from "../PortalUI";
import { PluginUpdateNotice } from "../PluginUpdateNotice";
import type { PortalTab } from "../ClientPortalSidebar";

type Ga = ReturnType<typeof useGoogleAnalytics>;

interface Props {
  ga: Ga;
  plugin: UseQueryResult<PluginTraffic | null>;
  clientAccountId: string;
  days: number;
  onOpenTab?: (tab: PortalTab) => void;
}

const dayLabel = (day: string, days: number) => format(new Date(`${day}T12:00:00`), days <= 7 ? "EEE" : "MMM d");

function Notice({ icon: Icon, title, children, action }: { icon: typeof Plug; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-primary/10 shrink-0"><Icon className="h-5 w-5 text-primary" /></div>
      <div className="space-y-1.5">
        <h4 className="font-semibold text-foreground">{title}</h4>
        <div className="text-sm text-muted-foreground">{children}</div>
        {action}
      </div>
    </div>
  );
}

function TrendChart({ data, dataKey, days, height = 200 }: { data: { name: string; [k: string]: string | number }[]; dataKey: string; days: number; height?: number }) {
  void days;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis allowDecimals={false} width={32} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px" }} />
          <Area type="monotone" dataKey={dataKey} stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ConnectCard({ ga, reconnect }: { ga: Ga; reconnect: boolean }) {
  return (
    <ModernCard className="p-6">
      <div className="rounded-xl border border-border/60 bg-muted/30 p-5 space-y-3">
        <h4 className="font-semibold text-foreground">{reconnect ? "Reconnect Google Analytics" : "Connect Google Analytics"}</h4>
        <p className="text-sm text-muted-foreground">
          {reconnect
            ? "Your Google connection has expired. Reconnect to keep your website numbers up to date."
            : "See your visitors, top pages and where your traffic comes from, with one click."}
        </p>
        <Button onClick={ga.connect} disabled={ga.busy}>
          {ga.busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {reconnect ? "Reconnect Google" : "Connect Google Analytics"}
        </Button>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> View-only access to your Analytics data. We can never change your account, and you can disconnect any time.
        </p>
      </div>
    </ModernCard>
  );
}

function PropertyPicker({ ga }: { ga: Ga }) {
  return (
    <ModernCard className="p-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-muted-foreground">Connected as <b className="text-foreground">{ga.status?.email}</b>. Choose the website to report on:</p>
        <Button variant="ghost" size="sm" onClick={ga.disconnect} disabled={ga.busy}>Disconnect</Button>
      </div>
      {ga.properties === null ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : ga.properties.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Google Analytics 4 properties were found for this Google account. Reconnect with the account that owns your website's Analytics.</p>
      ) : (
        <ul className="space-y-2">
          {ga.properties.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
              <div className="min-w-0"><p className="font-medium text-foreground truncate">{p.name}</p><p className="text-xs text-muted-foreground truncate">{p.account}</p></div>
              <Button size="sm" onClick={() => ga.choose(p)} disabled={ga.busy}>Use this</Button>
            </li>
          ))}
        </ul>
      )}
    </ModernCard>
  );
}

function GoogleReport({ ga, days }: { ga: Ga; days: number }) {
  const r = ga.active!;
  const maxCh = Math.max(1, ...r.channels.map((c) => c.sessions));
  const confirmDisconnect = () => { if (window.confirm("Disconnect Google Analytics? You can reconnect any time.")) ga.disconnect(); };
  return (
    <ModernCard className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{r.property.name}</h3>
          <p className="text-sm text-muted-foreground">Source: Google Analytics · last {days} days</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={ga.refresh} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={confirmDisconnect} disabled={ga.busy}><Unplug className="h-4 w-4 mr-1" />Disconnect</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Sessions" value={fmtNum(r.current.sessions)} icon={Eye} trend={pctChange(r.current.sessions, r.previous.sessions)} trendLabel="vs previous period" />
        <StatCard label="Visitors" value={fmtNum(r.current.users)} icon={Users} trend={pctChange(r.current.users, r.previous.users)} trendLabel="vs previous period" />
        <StatCard label="Page views" value={fmtNum(r.current.pageviews)} icon={TrendingUp} trend={pctChange(r.current.pageviews, r.previous.pageviews)} trendLabel="vs previous period" />
        <StatCard label="Engagement rate" value={`${Math.round(r.current.engagement_rate * 100)}%`} icon={MousePointer} />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground mb-2">Sessions per day</p>
        <TrendChart data={r.daily.map((d) => ({ name: dayLabel(d.day, days), Sessions: d.sessions }))} dataKey="Sessions" days={days} />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <p className="text-sm font-medium text-foreground mb-2">Top pages</p>
          {r.top_pages.length === 0 ? <p className="text-sm text-muted-foreground">No page data yet.</p> : (
            <ul className="space-y-2">
              {r.top_pages.map((p) => (
                <li key={p.path} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-foreground" title={p.path}>{p.path}</span>
                  <span className="text-muted-foreground tabular-nums">{fmtNum(p.views)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground mb-2">Where visitors come from</p>
          {r.channels.length === 0 ? <p className="text-sm text-muted-foreground">No channel data yet.</p> : (
            <ul className="space-y-2.5">
              {r.channels.map((c) => (
                <li key={c.channel} className="text-sm">
                  <div className="flex justify-between mb-1"><span className="text-foreground">{c.channel}</span><span className="text-muted-foreground tabular-nums">{fmtNum(c.sessions)}</span></div>
                  <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(c.sessions / maxCh) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Connected as {r.email}. Google can take up to a day to finalize recent numbers.</p>
    </ModernCard>
  );
}

// Temporary fallback until the client connects Google: our own WordPress-plugin visit counts.
function PluginFallback({ plugin, clientAccountId, days, onOpenTab }: Omit<Props, "ga">) {
  const { data: live } = useLiveAnalytics(clientAccountId);
  const state = live?.traffic?.state;
  const data = plugin.data;
  return (
    <div className="space-y-4">
      {state === "needs_update" && live?.traffic?.state === "needs_update" && (
        <PluginUpdateNotice currentVersion={live.traffic.plugin_version} forVisitorStats />
      )}
      <ModernCard className="p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Website visits (from your site plugin)</h3>
          <p className="text-sm text-muted-foreground">Basic visit counts until Google Analytics is connected · last {days} days</p>
        </div>
        {state === "no_site" && (
          <Notice icon={Plug} title="No website connected" action={onOpenTab && <Button size="sm" variant="outline" onClick={() => onOpenTab("seo")}>Connect your WordPress site</Button>}>
            Connect Google Analytics above, or install the Orange Door plugin on your WordPress site to see visitor numbers.
          </Notice>
        )}
        {state === "off" && <Notice icon={Plug} title="Visitor counting is turned off">Your team switched visitor counting off for this website.</Notice>}
        {state === "waiting" && <Notice icon={Clock} title="Waiting for the first visit">Your plugin is counting. Numbers appear after the next visit to your site (logged-in WordPress admins aren't counted).</Notice>}
        {(state === undefined || state === "active") && plugin.isLoading && <Skeleton className="h-48 w-full" />}
        {plugin.isError && <p className="text-sm text-muted-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Website visit numbers are unavailable right now.</p>}
        {state === "active" && data && (
          <>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <StatCard label="Visits" value={fmtNum(data.current)} icon={Eye} trend={pctChange(data.current, data.previous)} trendLabel="vs previous period" />
              <StatCard label="On your site now" value={fmtNum(live?.traffic?.state === "active" ? live.traffic.active_now : 0)} icon={Users} />
            </div>
            <TrendChart data={data.daily.map((d) => ({ name: dayLabel(d.day, days), Visits: d.visits }))} dataKey="Visits" days={days} />
          </>
        )}
      </ModernCard>
    </div>
  );
}

export function WebsiteTab({ ga, plugin, clientAccountId, days, onOpenTab }: Props) {
  if (ga.loading) return <Skeleton className="h-80 w-full rounded-2xl" />;

  if (ga.active) return <GoogleReport ga={ga} days={days} />;

  return (
    <div className="space-y-6">
      {ga.error ? (
        <ModernCard className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Google Analytics data isn't available right now.
          <Button variant="ghost" size="sm" onClick={ga.refresh}>Retry</Button>
        </ModernCard>
      ) : ga.report?.state === "no_property" ? (
        <PropertyPicker ga={ga} />
      ) : (
        <ConnectCard ga={ga} reconnect={!!ga.status?.connected} />
      )}
      {ga.report?.state !== "no_property" && (
        <PluginFallback plugin={plugin} clientAccountId={clientAccountId} days={days} onOpenTab={onOpenTab} />
      )}
    </div>
  );
}
