import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, Loader2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { HEALTH_LABEL, needsAttention, siteHealth, type SiteHealth } from "@/lib/siteHealth";

interface SiteRow {
  id: string;
  site_url: string;
  status: string;
  agent_mode: string;
  plugin_version: string | null;
  wp_version: string | null;
  php_version: string | null;
  last_heartbeat_at: string | null;
  last_scanned_at: string | null;
  client_accounts: { business_name: string } | null;
}

const TONE: Record<SiteHealth, string> = {
  healthy: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  slow: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  silent: "bg-destructive/15 text-destructive",
  never: "bg-destructive/15 text-destructive",
  legacy: "bg-muted text-muted-foreground",
  disconnected: "bg-muted text-muted-foreground",
  pending: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
};

const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never");

/** Every connected WordPress site: which connection it uses, whether it is checking in, and what is stuck. */
export function WordPressSitesPanel() {
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [work, setWork] = useState<Record<string, { waiting: number; problems: number }>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // site_changes / agent columns are newer than the generated database types.
    const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const [{ data: s }, { data: ch }] = await Promise.all([
      db.from("connected_sites")
        .select("id, site_url, status, agent_mode, plugin_version, wp_version, php_version, last_heartbeat_at, last_scanned_at, client_accounts(business_name)")
        .order("site_url"),
      db.from("site_changes").select("site_id, status").in("status", ["queued", "delivered", "revert_queued", "revert_delivered", "unverified", "failed"]),
    ]);
    const w: Record<string, { waiting: number; problems: number }> = {};
    for (const c of (ch ?? []) as { site_id: string; status: string }[]) {
      const e = (w[c.site_id] ??= { waiting: 0, problems: 0 });
      if (c.status === "unverified" || c.status === "failed") e.problems++;
      else e.waiting++;
    }
    setSites((s ?? []) as SiteRow[]);
    setWork(w);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const rows = (sites ?? []).map((s) => ({ s, health: siteHealth(s) }));
  const attention = rows.filter((r) => needsAttention(r.health)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Globe className="h-6 w-6" /> WordPress sites</h2>
          <p className="text-sm text-muted-foreground">
            Sites on the new plugin check in about every 5 minutes. Older plugin versions can't report their health.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {sites === null ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : sites.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No WordPress sites are connected yet.</CardContent></Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {sites.length} site{sites.length !== 1 ? "s" : ""}
              {attention > 0 && <Badge variant="destructive" className="ml-2">{attention} need attention</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Health</th>
                  <th className="px-4 py-2 font-medium">Last check-in</th>
                  <th className="px-4 py-2 font-medium">Plugin</th>
                  <th className="px-4 py-2 font-medium">WP / PHP</th>
                  <th className="px-4 py-2 font-medium">Last scan</th>
                  <th className="px-4 py-2 font-medium">Changes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, health }) => {
                  const w = work[s.id];
                  return (
                    <tr key={s.id} className="border-b last:border-0 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium">{s.client_accounts?.business_name ?? <span className="text-muted-foreground">Not linked to a client</span>}</div>
                        <div className="text-xs text-muted-foreground">{s.site_url.replace(/^https?:\/\//, "")}</div>
                      </td>
                      <td className="px-4 py-3"><Badge variant="outline" className={`border-transparent ${TONE[health]}`}>{HEALTH_LABEL[health]}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground">{s.agent_mode === "agent" ? ago(s.last_heartbeat_at) : "n/a"}</td>
                      <td className="px-4 py-3">{s.plugin_version ?? "unknown"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.wp_version ?? "?"} / {s.php_version ?? "?"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ago(s.last_scanned_at)}</td>
                      <td className="px-4 py-3">
                        {w ? (
                          <span className="space-x-2">
                            {w.waiting > 0 && <span className="text-sky-700 dark:text-sky-400">{w.waiting} in progress</span>}
                            {w.problems > 0 && <span className="text-destructive">{w.problems} stuck</span>}
                          </span>
                        ) : <span className="text-muted-foreground">None waiting</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
