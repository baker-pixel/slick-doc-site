import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Loader2, Plug, Download, RefreshCw,
  AlertTriangle, Copy, Clock,
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
  /**
   * admin — operational view: status, scan trigger, copy setup link. No install wizard.
   * client — onboarding wizard with 3-second polling until connected.
   */
  mode?: "admin" | "client";
  onSiteConnected?: (siteId: string) => void;
}

const PLUGIN_DOWNLOAD_URL = "/downloads/orange-door.php";

const SETUP_INSTRUCTIONS = `Install the Orange Door SEO plugin on your WordPress site:

1. Download orange-door.php from your Orange Door dashboard
2. In WordPress Admin go to Plugins → Add New → Upload Plugin
3. Upload orange-door.php and click Activate
4. The plugin connects automatically — no API key needed`;

export function ConnectSitePanel({ clientId, mode = "admin", onSiteConnected }: Props) {
  const [site, setSite] = useState<ConnectedSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const notifiedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchSite() {
    const { data } = await supabase
      .from("connected_sites")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    const fetched = data as ConnectedSite | null;
    setSite(fetched);
    setLoading(false);

    if (fetched && !notifiedRef.current) {
      notifiedRef.current = true;
      onSiteConnected?.(fetched.id);
    }
    return fetched;
  }

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
  }, [clientId, mode]);

  async function triggerScan() {
    if (!site) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-wordpress-site", {
        body: { site_id: site.id },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Scan failed");
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

  function copySetupInstructions() {
    navigator.clipboard.writeText(SETUP_INSTRUCTIONS);
    toast.success("Setup instructions copied to clipboard");
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
          {!site ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Plugin not yet installed on client's WordPress site.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={copySetupInstructions}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy setup instructions for client
              </Button>
              <a
                href={PLUGIN_DOWNLOAD_URL}
                download="orange-door.php"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Download className="h-3 w-3" />
                Download plugin
              </a>
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
                  Site unreachable. Verify the plugin is active and the domain responds.
                </div>
              )}

              <Button
                onClick={triggerScan}
                disabled={scanning || site.status === "unreachable"}
                size="sm"
              >
                {scanning
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Scanning…</>
                  : <><RefreshCw className="h-4 w-4" /> Run Scan Now</>
                }
              </Button>
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
            Connect Your WordPress Site
          </CardTitle>
          {site?.status === "connected" && (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
            </Badge>
          )}
          {!site && (
            <Badge variant="outline" className="text-muted-foreground text-xs">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Waiting for plugin…
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!site ? (
          <>
            <div className="rounded-md bg-muted/50 p-4 space-y-3">
              <p className="text-sm font-medium">Three steps to connect:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
                <li>Download the plugin below</li>
                <li>
                  In WordPress: Plugins → Add New → Upload Plugin → activate{" "}
                  <code className="text-xs bg-muted px-1 rounded">orangedoor.php</code>
                </li>
                <li>This page updates automatically once connected — no API key needed</li>
              </ol>
            </div>
            <a href={PLUGIN_DOWNLOAD_URL} download="orange-door.php">
              <Button className="gap-2">
                <Download className="h-4 w-4" />
                Download Plugin
              </Button>
            </a>
          </>
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
