import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Globe, Loader2, Play, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import CompanyProfileSection, { type ProfileRun } from "./CompanyProfileSection";

interface CrawlStatus {
  crawl: {
    id: string;
    status: "queued" | "running" | "complete" | "failed" | "cancelled";
    phase: "seed" | "crawl" | "done";
    origin: string;
    max_pages: number;
    pages_discovered: number;
    pages_crawled: number;
    pages_failed: number;
    error: string | null;
    created_at: string;
    finished_at: string | null;
    sitemap_urls_found: number;
    sitemaps_read: number;
    renders: number;
    truncated: boolean;
  } | null;
  percent: number;
  eta_seconds: number | null;
  message: string;
  audit: "analysing" | "done" | "failed" | null;
  profile: ProfileRun | null;
  breakdown: { page_type: string; pages: number; errors: number; noindex: number }[];
}

const POLL_MS = 5000;
const TYPE_LABELS: Record<string, string> = {
  home: "Home", service: "Services", product: "Products", blog: "Blog", about: "About", contact: "Contact",
  location: "Locations", pricing: "Pricing", faq: "FAQ", legal: "Legal", other: "Other",
};

const formatEta = (seconds: number | null): string | null => {
  if (seconds === null || seconds <= 0) return null;
  if (seconds < 90) return "about a minute left";
  const mins = Math.round(seconds / 60);
  if (mins < 90) return `about ${mins} min left`;
  return `about ${Math.round(mins / 60)} h left`;
};

interface Props {
  clientId: string;
  adminPassword: string | null | undefined;
  /** Called when what we were watching (a crawl, or the audit that follows it) finishes, so the page can refresh. */
  onFinished?: () => void;
  /** Bump to make the card look again right now (e.g. after "Run audit" queued a crawl). */
  refreshKey?: number;
}

export default function SiteCrawlCard({ clientId, adminPassword, onFinished, refreshKey = 0 }: Props) {
  const [status, setStatus] = useState<CrawlStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const wasActive = useRef(false);
  // set when "Rebuild" is clicked, cleared once a newer profile run shows up (or after a few minutes)
  const [profileAsked, setProfileAsked] = useState<number | null>(null);

  const call = useCallback(async (action: "status" | "start" | "cancel" | "profile", extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("site-crawl", {
      body: { action, client_id: clientId, password: adminPassword, ...extra },
    });
    if (error || data?.error) {
      const msg = await getEdgeErrorMessage(error, data);
      throw new Error(msg ? friendlyEdgeMessage(msg) : "Something went wrong");
    }
    return data as CrawlStatus & { started?: boolean; reason?: string };
  }, [clientId, adminPassword]);

  const refresh = useCallback(async () => {
    try {
      setStatus(await call("status"));
    } catch (e) {
      console.error("crawl status", e);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { setStatus(null); setLoading(true); wasActive.current = false; refresh(); }, [clientId, refresh]);
  useEffect(() => { if (refreshKey > 0) refresh(); }, [refreshKey, refresh]);

  const profileRunning = status?.profile?.status === "running";
  const profilePending = profileAsked !== null && !(status?.profile && Date.parse(status.profile.created_at) >= profileAsked && status.profile.status !== "running") && Date.now() - profileAsked < 5 * 60_000;
  const crawling = status?.crawl?.status === "queued" || status?.crawl?.status === "running";
  const analysing = status?.audit === "analysing";
  const active = crawling || analysing || profileRunning || profilePending;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [active, refresh]);

  // Tell the page once, when a crawl we were watching finishes.
  useEffect(() => {
    if (active) { wasActive.current = true; return; }
    if (wasActive.current && status?.crawl?.status === "complete") { wasActive.current = false; onFinished?.(); }
  }, [active, status, onFinished]);

  const start = async () => {
    setBusy(true);
    try {
      const res = await call("start");
      setStatus(res);
      if (res.started === false && res.reason === "already_running") toast({ title: "A crawl is already running for this site" });
    } catch (e) {
      toast({ title: "Couldn't start the crawl", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const rebuildProfile = async () => {
    setProfileAsked(Date.now());
    try {
      const res = await call("profile");
      setStatus(res);
    } catch (e) {
      setProfileAsked(null);
      toast({ title: "Couldn't start the profile build", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const cancel = async () => {
    if (!status?.crawl) return;
    setBusy(true);
    try { await call("cancel", { crawl_id: status.crawl.id }); await refresh(); }
    catch (e) { toast({ title: "Couldn't cancel", description: e instanceof Error ? e.message : undefined, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const c = status?.crawl ?? null;
  const eta = formatEta(status?.eta_seconds ?? null);

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Globe className="w-4 h-4 text-orange-500" /> Full website crawl
          </div>
          {c && <Badge variant={c.status === "failed" ? "destructive" : "secondary"} className="capitalize">{c.status === "running" && c.phase === "seed" ? "starting" : c.status}</Badge>}
          <div className="flex-1" />
          {crawling ? (
            <Button variant="outline" size="sm" onClick={cancel} disabled={busy} className="gap-2"><XCircle className="w-4 h-4" /> Cancel</Button>
          ) : analysing ? (
            <Badge variant="secondary" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> analysing</Badge>
          ) : (
            <Button size="sm" onClick={start} disabled={busy || loading} className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : c ? <RefreshCw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {c ? "Crawl again" : "Start full crawl"}
            </Button>
          )}
        </div>

        {loading && <div className="text-xs text-muted-foreground">Loading…</div>}

        {!loading && !c && (
          <p className="text-sm text-muted-foreground">
            Reads every page of the site in the background (it can take 5–10 minutes or more), so audits and the company profile are built from the whole website, not a sample.
          </p>
        )}

        {c && analysing && !crawling && (
          <p className="text-sm text-muted-foreground">
            Read {c.pages_crawled} pages. Checking every one of them now: this takes a minute or two, and the audit below updates when it's ready.
          </p>
        )}

        {c && crawling && (
          <div className="space-y-2">
            <Progress value={status?.percent ?? 0} />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>{status?.message}</span>
              <span>{status?.percent ?? 0}%{eta ? ` · ${eta}` : ""}</span>
            </div>
            <p className="text-xs text-muted-foreground">This keeps running in the background. You can leave this page and come back.</p>
          </div>
        )}

        {c && status?.audit === "failed" && (
          <p className="text-sm text-red-600">The pages were read, but the analysis didn't finish. Try "Run new audit" again; if it keeps happening we've been alerted.</p>
        )}

        {c && c.status === "complete" && !analysing && (
          <div className="space-y-2">
            <p className="text-sm">
              {status?.message} <span className="text-muted-foreground">Finished {c.finished_at ? format(new Date(c.finished_at), "MMM d, h:mm a") : ""}.</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {c.sitemap_urls_found} pages listed in {c.sitemaps_read} sitemap{c.sitemaps_read === 1 ? "" : "s"}
              {c.renders > 0 ? ` · ${c.renders} JavaScript pages rendered` : ""}
              {c.truncated ? ` · stopped at the plan limit of ${c.max_pages} pages` : ""}
            </p>
            {status && status.breakdown.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {status.breakdown.map((b) => (
                  <Badge key={b.page_type} variant="outline" className="gap-1">
                    {TYPE_LABELS[b.page_type] ?? b.page_type} {b.pages}
                    {b.errors > 0 && <span className="text-red-600">· {b.errors} errors</span>}
                    {b.noindex > 0 && <span className="text-amber-600">· {b.noindex} noindex</span>}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {c && (c.status === "failed" || c.status === "cancelled") && (
          <p className={`text-sm ${c.status === "failed" ? "text-red-600" : "text-muted-foreground"}`}>{status?.message}</p>
        )}
        {c && c.status === "complete" && !analysing && (
          <CompanyProfileSection
            clientId={clientId} adminPassword={adminPassword} profile={status?.profile ?? null}
            pending={profilePending} canBuild={!crawling} onRebuild={rebuildProfile}
          />
        )}
      </CardContent>
    </Card>
  );
}
