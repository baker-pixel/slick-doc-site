import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import {
  CheckCircle2, XCircle, Loader2, Plug, Download, RefreshCw,
  AlertTriangle, Clock, ExternalLink,
} from "lucide-react";

interface ConnectedSite {
  id: string;
  site_url: string;
  status: string;
  plugin_version: string | null;
  wp_version: string | null;
  yoast_active: boolean;
  rankmath_active: boolean;
  last_scanned_at: string | null;
}

interface Props {
  clientId: string;
  mode?: "admin" | "client";
  onSiteConnected?: (siteId: string) => void;
  adminPassword?: string;
}

const PLUGIN_DOWNLOAD_URL = "/downloads/orange-door.zip";

export function ConnectSitePanel({ clientId, mode = "admin", onSiteConnected, adminPassword }: Props) {
  const [site, setSite] = useState<ConnectedSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [wpAdminUrl, setWpAdminUrl] = useState("");
  const [preparing, setPreparing] = useState(false);
  const notifiedRef = useRef(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSite = useCallback(async () => {
    const { data } = await supabase
      .from("connected_sites")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    const fetched = data as ConnectedSite | null;
    setSite(fetched);
    setLoading(false);

    // Tell the parent when the connection goes live (plugin activated), not just
    // on first load -- the parent owns which card renders and used to stay on
    // "Waiting for plugin" until a manual reload.
    if (fetched?.status === "connected" && !notifiedRef.current) {
      notifiedRef.current = true;
      onSiteConnected?.(fetched.id);
    } else if (fetched?.status !== "connected") {
      notifiedRef.current = false;
    }
    return fetched;
  }, [clientId, onSiteConnected]);

  useEffect(() => {
    notifiedRef.current = false;
    fetchSite();

    // Only poll in client mode (onboarding wizard); admin uses Refresh button
    if (mode === "client") {
      pollRef.current = setInterval(async () => {
        const s = await fetchSite();
        if (s?.status === "connected") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      }, 3000);
    }

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [clientId, mode, fetchSite]);

  async function triggerScan() {
    if (!site) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-wordpress-site", {
        body: { site_id: site.id, password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Scan failed");
      }
      toast.success(
        `Scan complete — ${data.total_issues} issues, ${data.fixes_generated} fixes queued`,
      );
      await fetchSite();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function prepare(siteUrl: string): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke("prepare-connection", {
      body: { client_id: clientId, site_url: siteUrl, password: adminPassword },
    });
    if (error || data?.error) {
      const msg = await getEdgeErrorMessage(error, data);
      toast.error(msg ? friendlyEdgeMessage(msg) : "Could not save the site URL");
      return false;
    }
    return true;
  }

  async function handleDisconnect() {
    if (!site) return;
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("disconnect-site", {
        body: { site_id: site.id, password: adminPassword },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Could not disconnect");
      }
      const p = data?.plugin as { reached?: boolean; deactivated?: boolean; removed?: boolean } | undefined;
      if (p?.removed) toast.success("Disconnected — the plugin was removed from your WordPress site");
      else if (p?.deactivated) toast.warning("Disconnected and plugin deactivated. Delete “Orange Door SEO” under Plugins to finish removing it.");
      else toast.warning("Disconnected. We couldn't reach your site to remove the plugin — deactivate and delete “Orange Door SEO” under Plugins.");
      await fetchSite();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleConnect() {
    let base = wpAdminUrl.trim().replace(/\/+$/, "");
    if (!base) {
      toast.error("Enter your WordPress admin URL first");
      return;
    }
    if (!/^https?:\/\//i.test(base)) base = "https://" + base;

    // Derive root site URL (strip /wp-admin so it matches get_site_url() on the plugin side)
    const siteUrl = base.replace(/\/wp-admin\/?$/i, "").replace(/\/+$/, "");

    // Register client_id ↔ site_url so connect-site can link them when the plugin activates.
    // Also patches client_id onto any existing record if the plugin already registered.
    // Stop here on failure: downloading a plugin that can't be matched back to
    // this account just leaves the client waiting forever.
    if (!(await prepare(siteUrl))) return;
    await fetchSite();

    // Auto-download ZIP
    const a = document.createElement("a");
    a.href = PLUGIN_DOWNLOAD_URL;
    a.download = "orange-door.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Open WP plugin upload page — no nonce required, just needs admin login
    window.open(`${base}/plugin-install.php?tab=upload`, "_blank", "noopener,noreferrer");
    toast.info("ZIP downloading — upload it on the WordPress page that just opened, then activate");
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  async function handleAdminPrepare() {
    let base = wpAdminUrl.trim().replace(/\/+$/, "");
    if (!base) { toast.error("Enter the client's WordPress site URL first"); return; }
    if (!/^https?:\/\//i.test(base)) base = "https://" + base;
    const siteUrl = base.replace(/\/wp-admin\/?$/i, "").replace(/\/+$/, "");
    setPreparing(true);
    try {
      if (await prepare(siteUrl)) {
        toast.success("Site URL saved — now install the plugin on the WordPress site");
        await fetchSite();
      }
    } finally {
      setPreparing(false);
    }
  }

  // ── ADMIN MODE ─────────────────────────────────────────────────────────────
  if (mode === "admin") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plug className="h-4 w-4" />
              Plugin Connection
            </CardTitle>
            <div className="flex items-center gap-2">
              {site?.status === "connected" && (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                </Badge>
              )}
              {site?.status === "unreachable" && (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" /> Unreachable
                </Badge>
              )}
              {site?.status === "pending" && (
                <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Waiting for plugin
                </Badge>
              )}
              {site?.status === "disconnected" && (
                <Badge variant="outline" className="text-muted-foreground">
                  Disconnected
                </Badge>
              )}
              {!site && (
                <Badge variant="outline" className="text-muted-foreground">
                  Not connected
                </Badge>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => fetchSite()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!site || site.status === "pending" || site.status === "disconnected" ? (
            <div className="space-y-4">
              {site?.status === "disconnected" && (
                <p className="text-xs text-muted-foreground">
                  Disconnected (the plugin is removed from the site on disconnect). To reconnect, reinstall the plugin from the
                  ZIP below, or if it's still installed open Settings → Orange Door and click <strong>Reconnect</strong>.
                  To move to a different site, save its URL first.
                </p>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium">Client's WordPress site URL</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://clientsite.com"
                    value={wpAdminUrl}
                    onChange={(e) => setWpAdminUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdminPrepare()}
                    className="font-mono text-sm"
                  />
                  <Button size="sm" onClick={handleAdminPrepare} disabled={preparing} className="shrink-0">
                    {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save URL"}
                  </Button>
                </div>
                {site?.status === "pending" && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    URL saved ({site.site_url}) — waiting for the plugin to be activated on the WordPress site.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={PLUGIN_DOWNLOAD_URL}
                  download="orange-door.zip"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Download className="h-3 w-3" />
                  Download plugin ZIP
                </a>
                <span className="text-xs text-muted-foreground">→ install &amp; activate on the WordPress site</span>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Site</p>
                  <p className="font-mono text-xs truncate">{site.site_url}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Plugin</p>
                  <p>v{site.plugin_version ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">WordPress</p>
                  <p>{site.wp_version ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">SEO plugin</p>
                  <p>
                    {site.yoast_active ? "Yoast SEO" :
                     site.rankmath_active ? "RankMath" : "None"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last scan</p>
                  <p className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {site.last_scanned_at
                      ? new Date(site.last_scanned_at).toLocaleDateString()
                      : "Never"}
                  </p>
                </div>
              </div>

              {site.status === "unreachable" && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  Site unreachable. Verify the plugin is active and the domain responds. If the plugin was reinstalled or the site restored, open Settings → Orange Door on the site and click Re-sync Connection.
                </div>
              )}

              <div className="flex items-center gap-2">
                {/* Not disabled when unreachable: a scan is the retry, and a successful one restores "connected". */}
                <Button onClick={triggerScan} disabled={scanning || disconnecting} size="sm">
                  {scanning
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Scanning…</>
                    : <><RefreshCw className="h-4 w-4" /> {site.status === "unreachable" ? "Retry Scan" : "Run Scan Now"}</>
                  }
                </Button>
                <Button
                  onClick={handleDisconnect}
                  disabled={scanning || disconnecting}
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                >
                  {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── CLIENT MODE ────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="h-4 w-4" />
            {site?.status === "disconnected"
              ? "Reconnect Your WordPress Site"
              : "Connect Your WordPress Site"}
          </CardTitle>
          {site?.status === "connected" && (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
            </Badge>
          )}
          {site?.status === "disconnected" && (
            <Badge variant="outline" className="text-muted-foreground text-xs">
              Disconnected
            </Badge>
          )}
          {site?.status === "pending" && (
            <Badge variant="outline" className="text-amber-700 dark:text-amber-400 text-xs">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Waiting for plugin…
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {(!site || site.status === "disconnected" || site.status === "pending") ? (
          <div className="space-y-4">
            {site?.status === "disconnected" && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-medium">Your site was disconnected.</p>
                <p>
                  The plugin is removed when you disconnect. To reconnect, use the button below to download it again,
                  upload it in WordPress, and activate it. (If it's still listed under Plugins, open Settings → Orange Door
                  and click <strong>Reconnect</strong> instead.)
                </p>
              </div>
            )}
            {/* Step 1 — URL + Connect */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Enter your WordPress admin URL</p>
              <div className="flex gap-2">
                <Input
                  placeholder="https://yoursite.com/wp-admin"
                  value={wpAdminUrl || (site ? site.site_url : "")}
                  onChange={(e) => setWpAdminUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  className="font-mono text-sm"
                />
                <Button onClick={handleConnect} className="gap-2 shrink-0">
                  <ExternalLink className="h-4 w-4" />
                  {site?.status === "disconnected" ? "Reconnect" : "Connect"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Make sure you're logged into WordPress admin first. Clicking Connect downloads the plugin ZIP and opens the WordPress upload screen.
              </p>
            </div>

            {/* Step 2 — what to do on WP side */}
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">On the WordPress page that opens</p>
              <p className="text-sm text-muted-foreground">
                Upload the ZIP → <strong>Install Now</strong> → <strong>Activate Plugin</strong>
              </p>
              <p className="text-xs text-muted-foreground mt-1">This page updates automatically once connected — no API key needed.</p>
              {site?.status === "pending" && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Waiting for the plugin to check in from {site.site_url}…
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Site</p>
                <p className="font-mono text-xs truncate">{site.site_url}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">SEO plugin</p>
                <p>{site.yoast_active ? "Yoast SEO" : site.rankmath_active ? "RankMath" : "None"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last scanned</p>
                <p>{site.last_scanned_at
                  ? new Date(site.last_scanned_at).toLocaleDateString()
                  : "Pending first scan"}</p>
              </div>
            </div>

            {site.status === "unreachable" && (
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                Your site is temporarily unreachable. Our team has been notified.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
