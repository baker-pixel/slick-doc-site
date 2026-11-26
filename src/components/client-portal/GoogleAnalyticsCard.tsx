import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Loader2, BarChart3, Eye, Users, TrendingUp, TrendingDown, MousePointer, AlertTriangle, Lock, RefreshCw, Unplug } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ModernCard, StatCard } from "./PortalUI";

type Totals = { sessions: number; users: number; pageviews: number; engagement_rate: number };
type Report =
  | { state: "not_connected" | "needs_reconnect" | "no_property" }
  | {
      state: "active";
      property: { id: string; name: string };
      email: string | null;
      current: Totals;
      previous: Totals;
      daily: { day: string; sessions: number; users: number }[];
      top_pages: { path: string; views: number }[];
      channels: { channel: string; sessions: number }[];
    };
type Property = { id: string; name: string; account: string };

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n)));
const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : undefined);

const RETURN_MESSAGES: Record<string, { title: string; description: string; destructive?: boolean }> = {
  connected: { title: "Google Analytics connected", description: "Now choose which website to report on." },
  denied: { title: "Connection cancelled", description: "No access was granted to your Google account.", destructive: true },
  scope: { title: "Analytics permission needed", description: "Please tick the Google Analytics permission when connecting, so we can show your website traffic.", destructive: true },
  error: { title: "Couldn't connect Google Analytics", description: "Something went wrong. Please try again.", destructive: true },
};

export default function GoogleAnalyticsCard({ clientAccountId }: { clientAccountId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<{ connected: boolean; needs_reconnect: boolean; email: string | null } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async <T,>(action: string, extra: Record<string, unknown> = {}): Promise<T> => {
    const { data, error: err } = await supabase.functions.invoke("google-analytics-connect", {
      body: { action, client_account_id: clientAccountId, ...extra },
    });
    if (err || data?.error) throw new Error(data?.error || err?.message || "Request failed");
    return data as T;
  }, [clientAccountId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await call<{ connected: boolean; needs_reconnect: boolean; email: string | null }>("status");
      setStatus(s);
      if (!s.connected || s.needs_reconnect) { setReport(null); return; }
      const r = await call<Report>("report");
      setReport(r);
      if (r.state === "no_property") setProperties(await call<{ properties: Property[] }>("properties").then((x) => x.properties));
      if (r.state === "needs_reconnect") setStatus({ ...s, needs_reconnect: true });
    } catch (e) {
      console.error("Google Analytics load failed:", e);
      setError("Google Analytics data isn't available right now.");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { load(); }, [load]);

  // Returning from Google's consent screen: ?google=connected|denied|scope|error
  useEffect(() => {
    const result = searchParams.get("google");
    if (!result) return;
    const msg = RETURN_MESSAGES[result];
    if (msg) toast({ title: msg.title, description: msg.description, variant: msg.destructive ? "destructive" : undefined });
    const next = new URLSearchParams(searchParams);
    next.delete("google");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await call<{ url: string }>("start", { return_origin: window.location.origin });
      window.location.href = url;
    } catch (e) {
      toast({ title: "Couldn't start Google sign-in", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
      setBusy(false);
    }
  };

  const choose = async (p: Property) => {
    setBusy(true);
    try {
      await call("select_property", { property_id: p.id });
      setProperties(null);
      setLoading(true);
      await load();
    } catch (e) {
      toast({ title: "Couldn't select property", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Google Analytics? You can reconnect any time.")) return;
    setBusy(true);
    try {
      await call("disconnect");
      setReport(null); setProperties(null); setStatus({ connected: false, needs_reconnect: false, email: null });
      toast({ title: "Google Analytics disconnected" });
    } catch (e) {
      toast({ title: "Couldn't disconnect", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const Header = ({ right }: { right?: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10"><BarChart3 className="h-5 w-5 text-primary" /></div>
        <div>
          <h3 className="font-semibold text-foreground">Google Analytics</h3>
          <p className="text-sm text-muted-foreground">
            {report?.state === "active" ? `${report.property.name} · last 28 days` : "Your website traffic, straight from Google"}
          </p>
        </div>
      </div>
      {right}
    </div>
  );

  if (loading) {
    return <ModernCard className="p-6"><Header /><div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div></ModernCard>;
  }

  if (error) {
    return (
      <ModernCard className="p-6"><Header />
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4" /> {error}
          <Button variant="ghost" size="sm" onClick={() => { setLoading(true); load(); }}>Retry</Button></div>
      </ModernCard>
    );
  }

  if (!status?.connected || status.needs_reconnect || report?.state === "needs_reconnect") {
    const reconnect = !!status?.connected;
    return (
      <ModernCard className="p-6"><Header />
        <div className="rounded-xl border border-border/60 bg-muted/30 p-5 space-y-3">
          <h4 className="font-semibold text-foreground">{reconnect ? "Reconnect Google Analytics" : "Connect your Google Analytics"}</h4>
          <p className="text-sm text-muted-foreground">
            {reconnect
              ? "Your Google connection has expired. Reconnect to keep your traffic numbers up to date."
              : "See visitors, top pages and where your traffic comes from, right in your dashboard."}
          </p>
          <Button onClick={connect} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{reconnect ? "Reconnect Google" : "Connect Google Analytics"}</Button>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Lock className="h-3 w-3" /> View-only access to your Analytics data. We can never change your account, and you can disconnect any time.</p>
        </div>
      </ModernCard>
    );
  }

  if (report?.state === "no_property") {
    return (
      <ModernCard className="p-6"><Header right={<Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>Disconnect</Button>} />
        <p className="text-sm text-muted-foreground mb-3">Connected as <b>{status.email}</b>. Choose the website to report on:</p>
        {properties === null ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : properties.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Google Analytics 4 properties were found for this Google account. Reconnect with the account that owns your website's Analytics.</p>
        ) : (
          <ul className="space-y-2">
            {properties.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
                <div className="min-w-0"><p className="font-medium text-foreground truncate">{p.name}</p><p className="text-xs text-muted-foreground truncate">{p.account}</p></div>
                <Button size="sm" onClick={() => choose(p)} disabled={busy}>Use this</Button>
              </li>
            ))}
          </ul>
        )}
      </ModernCard>
    );
  }

  if (report?.state !== "active") return null;
  const { current, previous } = report;
  const maxCh = Math.max(1, ...report.channels.map((c) => c.sessions));

  return (
    <ModernCard className="p-6">
      <Header right={
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setLoading(true); load(); }} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}><Unplug className="h-4 w-4 mr-1" />Disconnect</Button>
        </div>
      } />
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Sessions" value={fmt(current.sessions)} icon={Eye} trend={pct(current.sessions, previous.sessions)} trendLabel="vs prior 28 days" />
          <StatCard label="Users" value={fmt(current.users)} icon={Users} trend={pct(current.users, previous.users)} trendLabel="vs prior 28 days" />
          <StatCard label="Page views" value={fmt(current.pageviews)} icon={TrendingUp} trend={pct(current.pageviews, previous.pageviews)} trendLabel="vs prior 28 days" />
          <StatCard label="Engagement rate" value={`${Math.round(current.engagement_rate * 100)}%`} icon={MousePointer} />
        </div>

        <div>
          <p className="text-sm font-medium text-foreground mb-2">Sessions per day</p>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.daily.map((d) => ({ name: format(new Date(`${d.day}T12:00:00`), "MMM d"), sessions: d.sessions }))}>
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} width={32} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px" }} />
                <Area type="monotone" dataKey="sessions" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Top pages</p>
            {report.top_pages.length === 0 ? <p className="text-sm text-muted-foreground">No page data yet.</p> : (
              <ul className="space-y-2">
                {report.top_pages.map((p) => (
                  <li key={p.path} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-foreground" title={p.path}>{p.path}</span>
                    <span className="text-muted-foreground tabular-nums">{fmt(p.views)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Where visitors come from</p>
            {report.channels.length === 0 ? <p className="text-sm text-muted-foreground">No channel data yet.</p> : (
              <ul className="space-y-2.5">
                {report.channels.map((c) => (
                  <li key={c.channel} className="text-sm">
                    <div className="flex justify-between mb-1"><span className="text-foreground">{c.channel}</span><span className="text-muted-foreground tabular-nums">{fmt(c.sessions)}</span></div>
                    <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(c.sessions / maxCh) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Connected as {report.email}. Data from Google Analytics; Google can take up to a day to finalize recent numbers.</p>
      </div>
    </ModernCard>
  );
}
