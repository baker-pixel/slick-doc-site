import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import {
  Search, CheckCircle2, XCircle, Loader2, AlertTriangle,
  TrendingUp, Lightbulb, RefreshCw,
  Globe, Wand2, ShieldCheck, Info, Zap,
  Plug,
} from "lucide-react";
import { ConnectSitePanel } from "@/components/admin/content/ConnectSitePanel";
import { SeoScoreCard } from "@/components/admin/shared/SeoScoreCard";

interface Props {
  clientAccountId: string;
}

// ── Plain-English tooltip copy for every score dimension ─────────────────────
// Keys match the rubric categories the audit engine writes (seoRubric.ts).

const SCORE_TOOLTIPS: Record<string, { label: string; explain: string }> = {
  technical: {
    label: "Technical",
    explain:
      "The behind-the-scenes setup Google relies on — mobile display tags, canonical links, and structured data. Problems here can make your site harder for Google to trust and understand.",
  },
  on_page: {
    label: "On-Page",
    explain:
      "How well each page is labelled for search engines — the title that appears in Google results, the short description underneath it, and the main heading on each page.",
  },
  performance: {
    label: "Performance",
    explain:
      "How fast your site loads, especially on phones. Slow sites rank lower and lose visitors — Google uses speed as a direct ranking factor.",
  },
  content: {
    label: "Content",
    explain:
      "Whether your pages have enough useful detail. Google ranks pages that genuinely answer questions higher than pages with thin or sparse content.",
  },
  off_page: {
    label: "Off-Page",
    explain:
      "Signals from outside your website, like links from other sites. These build your site's reputation with Google over time.",
  },
};

// Findings that describe a measurement gap, not a problem with the site.
const INFORMATIONAL_CHECKS = new Set(["perf_not_measured", "render_required"]);

// ── Types ─────────────────────────────────────────────────────────────────────

interface WpSite {
  id: string;
  site_url: string;
  status: string;
  last_scanned_at: string | null;
  plugin_version: string | null;
  yoast_active: boolean;
  rankmath_active: boolean;
}

interface WpFix {
  id: string;
  post_id: number | null;
  media_id: number | null;
  page_title: string | null;
  page_url: string | null;
  field: string;
  current_value: string | null;
  suggested_value: string;
  status: string;
  error_message: string | null;
}

const WP_FIELD_LABELS: Record<string, string> = {
  meta_title:    "Meta Title",
  meta_desc:     "Meta Description",
  focus_keyword: "Focus Keyword",
  alt_text:      "Image Alt Text",
  slug:          "URL Slug",
  title:         "Page Title",
  canonical:     "Canonical URL",
};

// Canonical seo_audits shape written by the seo-audit engine.
interface Finding {
  id: string;
  status: string;
  check_id: string;
  category: string;
  severity: "critical" | "warning" | "good";
  title: string;
  pages: string[];
  plain_english: string;
  impact: number;
  effort: number;
  wp_applyable: boolean;
}

interface AuditResult {
  status?: "complete" | "inconclusive";
  reason?: string;
  overall_score?: number;
  subscores?: Record<string, number | null>;
  pages_analyzed?: { url: string; reachable: boolean }[];
  findings?: Finding[];
  action_plan?: string[];
  diff?: { previous_audit_id: string | null; regressed: number; resolved: number };
}

interface Audit {
  id: string;
  created_at: string;
  status: string;
  score: number | null;
  results: AuditResult | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const scoreColor = (s: number) =>
  s >= 70 ? "text-emerald-600" : s >= 50 ? "text-amber-500" : "text-red-500";

const scoreRingStroke = (s: number) =>
  s >= 70 ? "stroke-emerald-500" : s >= 50 ? "stroke-amber-400" : "stroke-red-500";

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width="110" height="110" className="-rotate-90">
      <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor"
        strokeWidth="10" className="text-muted/30" />
      <circle cx="55" cy="55" r={r} fill="none" strokeWidth="10"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        className={scoreRingStroke(score)} />
    </svg>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

interface IssueRowProps {
  issue: string;
  pageCount?: number;
  level: "error" | "warning";
}

function IssueRow({ issue, pageCount, level }: IssueRowProps) {
  const icon = level === "error"
    ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
    : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;

  return (
    <div className="flex items-start gap-2">
      {icon}
      <p className="text-sm">
        {issue}
        {pageCount !== undefined && pageCount > 1 && (
          <span className="text-muted-foreground"> ({pageCount} pages)</span>
        )}
      </p>
    </div>
  );
}

// ── WordPress Fix Card ────────────────────────────────────────────────────────

interface WpFixCardProps {
  fix: WpFix;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}

function WpFixCard({ fix, applying, onApply, onDismiss }: WpFixCardProps) {
  const label = WP_FIELD_LABELS[fix.field] ?? fix.field;
  return (
    <div className="p-4 space-y-3 border-b last:border-0">
      <div>
        <p className="text-xs text-muted-foreground mb-0.5">
          {fix.page_url ? (
            <a
              href={fix.page_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              {fix.page_title ?? fix.page_url}
            </a>
          ) : (
            fix.page_title ?? "Page"
          )}{" "}
          · {label}
        </p>
        <p className="text-sm font-medium">
          {fix.current_value
            ? `Update your ${label.toLowerCase()}`
            : `Add a ${label.toLowerCase()} to this page`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground mb-1">Currently</p>
          <p className={`rounded px-2 py-1.5 font-mono break-words leading-relaxed ${
            fix.current_value
              ? "bg-muted/60"
              : "bg-red-500/10 text-red-700 dark:text-red-400 italic"
          }`}>
            {fix.current_value || "empty"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1">Suggested</p>
          <p className="rounded px-2 py-1.5 font-mono break-words leading-relaxed bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            {fix.suggested_value}
          </p>
        </div>
      </div>

      {fix.error_message && (
        <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/5 rounded p-2">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          {fix.error_message}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" className="gap-1.5" onClick={onApply} disabled={applying}>
          {applying
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Zap className="h-3.5 w-3.5" />}
          {fix.status === "failed" ? "Retry" : "Do it for me"}
        </Button>
        <Button
          size="sm" variant="ghost"
          className="text-muted-foreground hover:text-destructive gap-1.5 ml-auto"
          onClick={onDismiss}
        >
          <XCircle className="h-3.5 w-3.5" />
          Not now
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ClientSeoTab({ clientAccountId }: Props) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [showAllIssues, setShowAllIssues] = useState(false);

  // WordPress plugin state
  const [wpSite, setWpSite] = useState<WpSite | null | undefined>(undefined);
  const [wpFixes, setWpFixes] = useState<WpFix[]>([]);
  const [loadingWp, setLoadingWp] = useState(true);
  const [applyingWp, setApplyingWp] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showAllFixes, setShowAllFixes] = useState(false);
  const [hasWebsiteUrl, setHasWebsiteUrl] = useState(true);
  const autoScanFired = useRef(false);

  useEffect(() => {
    supabase
      .from("client_accounts")
      .select("website_url")
      .eq("id", clientAccountId)
      .maybeSingle()
      .then(({ data }) => setHasWebsiteUrl(!!data?.website_url?.trim()));
  }, [clientAccountId]);

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true);
    // Only canonical-engine audits (rubric_version set); legacy rows have a
    // different results shape this view can't render.
    const { data } = await supabase
      .from("seo_audits")
      .select("id, created_at, status, score, results")
      .eq("client_account_id", clientAccountId)
      .not("rubric_version", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setAudit(data as Audit | null);
    setLoadingAudit(false);
  }, [clientAccountId]);

  const loadWpData = useCallback(async () => {
    setLoadingWp(true);
    const { data: site } = await supabase
      .from("connected_sites")
      .select("id, site_url, status, last_scanned_at, plugin_version, yoast_active, rankmath_active")
      .eq("client_id", clientAccountId)
      .maybeSingle();
    setWpSite(site as WpSite | null);

    if (site?.id) {
      const { data: wf } = await supabase
        .from("wp_fix_queue")
        .select("id, post_id, media_id, page_title, page_url, field, current_value, suggested_value, status, error_message")
        .eq("site_id", site.id)
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: false })
        .limit(30);
      setWpFixes((wf ?? []) as WpFix[]);
    }
    setLoadingWp(false);
  }, [clientAccountId]);

  useEffect(() => { loadAudit(); loadWpData(); }, [loadAudit, loadWpData]);

  // Auto-scan: fires once when site is connected but never scanned yet.
  // This is the reliable trigger — the connect-site fire-and-forget is best-effort only.
  useEffect(() => {
    if (
      wpSite?.status === "connected" &&
      !wpSite.last_scanned_at &&
      !scanning &&
      !autoScanFired.current
    ) {
      autoScanFired.current = true;
      triggerScan();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wpSite?.id, wpSite?.status, wpSite?.last_scanned_at]);

  async function applyWpFix(fix: WpFix) {
    setApplyingWp(fix.id);
    try {
      const { data, error } = await supabase.functions.invoke("approve-wp-fix", {
        body: { fix_id: fix.id },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Could not apply fix");
      }
      toast.success(`Fix applied to ${fix.page_title ?? fix.page_url ?? "your page"}`);
      setWpFixes(prev => prev.filter(f => f.id !== fix.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply fix");
    } finally {
      setApplyingWp(null);
    }
  }

  async function dismissWpFix(id: string) {
    setWpFixes(prev => prev.filter(f => f.id !== id));
    const { error } = await supabase
      .from("wp_fix_queue")
      .update({ status: "rejected" })
      .eq("id", id);
    if (error) {
      toast.error("Could not dismiss");
      await loadWpData();
    }
  }

  async function triggerScan() {
    if (!wpSite?.id) return;
    setScanning(true);
    toast.info("Scanning your site — this may take up to 30 seconds…");
    try {
      const { data, error } = await supabase.functions.invoke("scan-wordpress-site", {
        body: { site_id: wpSite.id },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Scan failed");
      }
      const issueCount = data.total_issues ?? 0;
      const fixCount   = data.fixes_generated ?? 0;
      toast.success(
        fixCount > 0
          ? `Scan complete — ${fixCount} improvement${fixCount !== 1 ? "s" : ""} queued`
          : issueCount > 0
            ? `Scan complete — ${issueCount} issue${issueCount !== 1 ? "s" : ""} found, improvements generating`
            : "Scan complete — no issues found"
      );
      await loadWpData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleDisconnect() {
    if (!wpSite?.id) return;
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("disconnect-site", {
        body: { site_id: wpSite.id },
      });
      if (error || data?.error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Could not disconnect");
      }
      toast.success("WordPress site disconnected");
      setShowDisconnectConfirm(false);
      await loadWpData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  const result = audit?.results;
  const score = audit?.score ?? result?.overall_score ?? null;
  const wpConnected = wpSite?.status === "connected";
  const inconclusive = audit?.status === "inconclusive" || result?.status === "inconclusive";

  // Findings are stored per page; group by check so each issue shows once
  // with a page count instead of repeating for every affected page.
  const grouped = new Map<string, { finding: Finding; pageCount: number }>();
  for (const f of result?.findings ?? []) {
    if (INFORMATIONAL_CHECKS.has(f.check_id)) continue;
    const g = grouped.get(f.check_id);
    if (g) g.pageCount += f.pages.length;
    else grouped.set(f.check_id, { finding: f, pageCount: f.pages.length });
  }
  const groupedFindings = [...grouped.values()];

  const allIssues = groupedFindings
    .map(g => ({
      issue: g.finding.plain_english,
      pageCount: g.pageCount,
      level: g.finding.severity === "critical" ? ("error" as const) : ("warning" as const),
      impact: g.finding.impact,
    }))
    .sort((a, b) => (a.level === b.level ? b.impact - a.impact : a.level === "error" ? -1 : 1));
  const visibleIssues = showAllIssues ? allIssues : allIssues.slice(0, 4);

  // Quick wins: low-effort fixes, highest impact-for-effort first.
  const quickWins = groupedFindings
    .filter(g => g.finding.effort <= 2)
    .sort((a, b) => (b.finding.impact / b.finding.effort) - (a.finding.impact / a.finding.effort))
    .slice(0, 5);

  // What's working: score dimensions in good shape + progress since last audit.
  const workingWell: string[] = [];
  for (const [key, val] of Object.entries(result?.subscores ?? {})) {
    const meta = SCORE_TOOLTIPS[key];
    if (meta && val !== null && val >= 85) workingWell.push(`${meta.label} is in good shape (${val}/100)`);
  }
  const resolvedCount = result?.diff?.resolved ?? 0;
  if (resolvedCount > 0) {
    workingWell.push(`${resolvedCount} issue${resolvedCount !== 1 ? "s" : ""} fixed since your last audit`);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6 p-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Search className="h-6 w-6 text-primary" />
              SEO Health
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              How visible your website is on Google — and what we can improve
            </p>
          </div>
          <Button variant="outline" size="sm"
            onClick={() => { loadAudit(); loadWpData(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        {/* ── WordPress Plugin Connection Status ───────────── */}
        {wpSite === undefined ? null : (wpSite === null || wpSite.status === "disconnected") ? (
          <ConnectSitePanel
            clientId={clientAccountId}
            mode="client"
            onSiteConnected={() => loadWpData()}
          />
        ) : (
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-full p-1.5 shrink-0 ${
                    wpSite.status === "connected"   ? "bg-emerald-500/15" :
                    wpSite.status === "pending"     ? "bg-amber-500/15" :
                    wpSite.status === "unreachable" ? "bg-destructive/15" :
                    "bg-muted"
                  }`}>
                    <Plug className={`h-4 w-4 ${
                      wpSite.status === "connected"   ? "text-emerald-600 dark:text-emerald-400" :
                      wpSite.status === "pending"     ? "text-amber-600 dark:text-amber-400" :
                      wpSite.status === "unreachable" ? "text-destructive" :
                      "text-muted-foreground"
                    }`} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">WordPress Plugin</span>
                      {wpSite.status === "connected" && (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                        </Badge>
                      )}
                      {wpSite.status === "pending" && (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent text-xs">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Waiting for plugin…
                        </Badge>
                      )}
                      {wpSite.status === "unreachable" && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Unreachable
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{wpSite.site_url}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {wpSite.plugin_version && <span>Plugin v{wpSite.plugin_version}</span>}
                      {(wpSite.yoast_active || wpSite.rankmath_active) && (
                        <span>{wpSite.yoast_active ? "Yoast SEO" : "RankMath"} detected</span>
                      )}
                      {wpSite.last_scanned_at && (
                        <span>Last scanned {new Date(wpSite.last_scanned_at).toLocaleDateString()}</span>
                      )}
                      {!wpSite.last_scanned_at && wpSite.status === "connected" && (
                        <span>Not yet scanned</span>
                      )}
                    </div>
                    {wpSite.status === "pending" && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                        Activate the plugin in your WordPress admin to complete the connection.
                      </p>
                    )}
                    {wpSite.status === "unreachable" && (
                      <p className="text-xs text-destructive mt-1">
                        Your site isn't responding. Check the plugin is active and your domain is reachable.
                      </p>
                    )}
                  </div>
                </div>

                {/* Disconnect / reset a stuck pending connection */}
                {(wpSite.status === "connected" || wpSite.status === "unreachable" || wpSite.status === "pending") && (
                  <div className="shrink-0">
                    {showDisconnectConfirm ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {wpSite.status === "pending" ? "Start over?" : "Remove connection?"}
                        </span>
                        <Button
                          size="sm" variant="destructive" className="h-7 text-xs"
                          onClick={handleDisconnect}
                          disabled={disconnecting}
                        >
                          {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, disconnect"}
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => setShowDisconnectConfirm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setShowDisconnectConfirm(true)}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        {wpSite.status === "pending" ? "Reset" : "Disconnect"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── WordPress Scan Score (plugin data) ───────────── */}
        {wpSite?.id && wpSite.status === "connected" && <SeoScoreCard siteId={wpSite.id} />}

        {/* ── Score Card — shown only when no WP plugin connected ── */}
        {!wpConnected && (loadingAudit ? (
          <Card><CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent></Card>
        ) : !audit ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-40" />
            {hasWebsiteUrl ? (
              <>
                <p className="font-medium">No audit run yet</p>
                <p className="text-sm mt-1">Your Orange Door team will run your first SEO audit soon.</p>
              </>
            ) : (
              <>
                <p className="font-medium text-orange-600 dark:text-orange-400">Waiting on you: add your website</p>
                <p className="text-sm mt-1">We can't audit or fix anything without a site to crawl. Add your website URL under "Confirm Business Information" on Home, or Settings → Company Context.</p>
              </>
            )}
          </CardContent></Card>
        ) : inconclusive ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">We couldn't check your site this time</p>
            <p className="text-sm mt-1">
              {result?.reason ?? "Your website didn't respond when we tried to analyse it. We'll retry automatically."}
            </p>
          </CardContent></Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                {/* Ring */}
                <div className="relative flex items-center justify-center shrink-0">
                  {score !== null && <ScoreRing score={score} />}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-bold ${score !== null ? scoreColor(score) : ""}`}>
                      {score ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                  </div>
                </div>

                {/* Breakdown */}
                <div className="flex-1 space-y-3 w-full">
                  <div>
                    <p className="font-semibold text-lg">Overall SEO Score</p>
                    {(result?.pages_analyzed?.length ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">{result!.pages_analyzed!.length} pages analysed</p>
                    )}
                    <p className="text-xs text-muted-foreground/70 mt-0.5">General website audit — separate from WordPress plugin scan</p>
                  </div>

                  {result?.subscores && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      {Object.entries(result.subscores).map(([key, val]) => {
                        const meta = SCORE_TOOLTIPS[key];
                        if (val === null || val === undefined || !meta) return null;
                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex items-center justify-between text-xs gap-1">
                              <span className="flex items-center gap-1 text-muted-foreground">
                                {meta.label}
                                <InfoTip text={meta.explain} />
                              </span>
                              <span className={`font-semibold ${scoreColor(val)}`}>{val}</span>
                            </div>
                            <Progress value={val} className="h-1.5" />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(result?.diff?.regressed ?? 0) > 0 && (
                    <p className="text-sm text-muted-foreground border-t pt-3 leading-relaxed">
                      {result!.diff!.regressed} previously fixed issue{result!.diff!.regressed !== 1 ? "s have" : " has"} come back — we're on it.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* ── Issues (plain English) — shown only when no WP plugin connected ── */}
        {!wpConnected && allIssues.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Things to fix
                <InfoTip text="These are areas where your site could be doing better on Google. We've translated the technical details into plain English." />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {visibleIssues.map((item, i) => (
                <IssueRow key={i} issue={item.issue} pageCount={item.pageCount} level={item.level} />
              ))}
              {allIssues.length > 4 && (
                <button
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => setShowAllIssues(v => !v)}
                >
                  {showAllIssues
                    ? "Show less"
                    : `Show ${allIssues.length - 4} more`}
                </button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── What's working + Quick wins — shown only when no WP plugin connected ── */}
        {!wpConnected && result && !inconclusive && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workingWell.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    What's working
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {workingWell.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {quickWins.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Quick wins
                    <InfoTip text="Small changes that can have a noticeable impact on your rankings relatively quickly." />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {quickWins.map((g) => (
                      <li key={g.finding.check_id} className="flex items-start gap-2 text-sm">
                        <TrendingUp className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <span>
                          {g.finding.plain_english}
                          {g.finding.wp_applyable && (
                            <span className="text-muted-foreground text-xs"> — we can apply this for you</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Site Improvements ─────────────────────────────── */}
        {(wpSite?.status === "connected" || wpSite?.status === "unreachable") && (() => {
          const VISIBLE     = 8;
          const visible     = showAllFixes ? wpFixes : wpFixes.slice(0, VISIBLE);
          const hiddenCount = wpFixes.length - visible.length;
          const initialScan = scanning && wpFixes.length === 0;
          const unreachable = wpSite?.status === "unreachable";

          return (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wand2 className="h-4 w-4" />
                    Site Improvements
                    {wpFixes.length > 0 && <Badge variant="secondary">{wpFixes.length}</Badge>}
                    <InfoTip text="Issues found on your WordPress site. Each fix can be applied automatically in one click." />
                  </CardTitle>
                  <Button
                    size="sm" variant="outline"
                    onClick={triggerScan} disabled={scanning}
                    className="gap-1.5"
                  >
                    {scanning
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…</>
                      : <><RefreshCw className="h-3.5 w-3.5" /> Scan site</>}
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {loadingWp || initialScan ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm font-medium">Setting up your SEO data…</p>
                    <p className="text-xs">Scanning your WordPress site for the first time. This takes about 30 seconds.</p>
                  </div>
                ) : unreachable && wpFixes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mb-2 text-destructive" />
                    <p className="text-sm font-medium">Can't check right now</p>
                    <p className="text-xs mt-1">Your site didn't respond to the last scan. Click "Scan site" to try again.</p>
                  </div>
                ) : wpFixes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-500" />
                    <p className="text-sm font-medium">All caught up!</p>
                    <p className="text-xs mt-1">No pending improvements right now.</p>
                  </div>
                ) : (
                  <>
                    {visible.map(fix => (
                      <WpFixCard
                        key={fix.id}
                        fix={fix}
                        applying={applyingWp === fix.id}
                        onApply={() => applyWpFix(fix)}
                        onDismiss={() => dismissWpFix(fix.id)}
                      />
                    ))}
                    {hiddenCount > 0 && (
                      <div className="px-4 py-3 border-t">
                        <button
                          className="text-xs text-primary underline-offset-2 hover:underline"
                          onClick={() => setShowAllFixes(true)}
                        >
                          Show {hiddenCount} more improvement{hiddenCount !== 1 ? "s" : ""}
                        </button>
                      </div>
                    )}
                    {showAllFixes && wpFixes.length > VISIBLE && (
                      <div className="px-4 py-3 border-t">
                        <button
                          className="text-xs text-primary underline-offset-2 hover:underline"
                          onClick={() => setShowAllFixes(false)}
                        >
                          Show less
                        </button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </TooltipProvider>
  );
}
