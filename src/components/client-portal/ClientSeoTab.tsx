import { useState, useEffect, useCallback } from "react";
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
import {
  Search, CheckCircle2, XCircle, Loader2, AlertTriangle,
  TrendingUp, Lightbulb, ChevronDown, ChevronUp, RefreshCw,
  Globe, Wand2, Target, ShieldCheck, Info, BookOpen, Zap,
  MessageSquare, Plug,
} from "lucide-react";

interface Props {
  clientAccountId: string;
}

// ── Plain-English tooltip copy for every score dimension ─────────────────────

const SCORE_TOOLTIPS: Record<string, { label: string; explain: string }> = {
  crawlability: {
    label: "Crawlability",
    explain:
      "Whether Google can find and read all your pages. A low score means some of your content may be invisible to search engines — like having a sign for your shop but no door.",
  },
  on_page: {
    label: "On-Page",
    explain:
      "How well each page is labelled for search engines — the title that appears in Google results, the short description underneath it, and the main heading on each page.",
  },
  content_quality: {
    label: "Content Quality",
    explain:
      "Whether your pages have enough useful detail. Google ranks pages that genuinely answer questions higher than pages with thin or sparse content.",
  },
  technical_performance: {
    label: "Performance",
    explain:
      "How fast your site loads, especially on phones. Slow sites rank lower and lose visitors — Google uses speed as a direct ranking factor.",
  },
  site_architecture: {
    label: "Site Structure",
    explain:
      "How well your pages connect to each other. Good internal linking helps Google understand which pages are most important and makes it easier for visitors to find what they need.",
  },
};

// ── Translate raw technical issues into plain English ────────────────────────

const ISSUE_TRANSLATIONS: Record<string, string> = {
  "missing title tag": "Some pages don't have a title — the headline Google shows in search results.",
  "missing meta description": "Some pages are missing a short description that appears under your link in Google.",
  "missing h1 tag": "Some pages don't have a main heading, which makes it harder for Google to understand what the page is about.",
  "multiple h1 tags": "Some pages have more than one main heading, which can confuse search engines.",
  "missing canonical tag": "Some pages are missing a tag that tells Google which version of the page is the official one, which can split your rankings.",
  "missing viewport meta": "Some pages aren't set up correctly for mobile visitors.",
  "no structured data": "Your pages are missing extra labels that help Google show rich results — like star ratings or business hours.",
  "missing open graph": "Your pages aren't fully set up for sharing on social media like Facebook or LinkedIn.",
  "thin content": "Some pages don't have enough content for Google to consider them valuable.",
  "not served over https": "Your site isn't fully secure — Google flags non-secure sites and they rank lower.",
  "noindex detected": "Some pages are accidentally hidden from Google entirely.",
};

function toPlainEnglish(issue: string): string {
  const lower = issue.toLowerCase();
  for (const [key, translation] of Object.entries(ISSUE_TRANSLATIONS)) {
    if (lower.includes(key)) return translation;
  }
  return issue;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface WpSite {
  id: string;
  site_url: string;
  status: string;
  last_scanned_at: string | null;
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

interface AuditResult {
  seo_score: number;
  score_breakdown?: Record<string, number>;
  pages_crawled?: number;
  errors?: { issue: string; affected_pages?: string[]; impact?: string }[];
  warnings?: { issue: string; affected_pages?: string[]; impact?: string }[];
  working_well?: string[];
  quick_wins?: { action: string; effort: string; impact: string }[];
  recommended_keywords?: string[];
  executive_summary?: string;
  action_priority_list?: { priority: number; action: string; category: string; estimated_effort: string }[];
}

interface Audit {
  id: string;
  created_at: string;
  score: number | null;
  results: AuditResult | null;
}

interface Fix {
  id: string;
  issue_title: string;
  issue_summary: string | null;
  severity: string;
  status: string;
  fix_plan: {
    explanation?: string;
    impact?: string;
    steps?: string[];
    manual_fallback?: string;
  };
  ready_to_apply: { type?: string; payload?: { value?: string; post_url?: string } } | null;
  apply_target: string | null;
  error_message: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const scoreColor = (s: number) =>
  s >= 70 ? "text-emerald-600" : s >= 50 ? "text-amber-500" : "text-red-500";

const scoreRingStroke = (s: number) =>
  s >= 70 ? "stroke-emerald-500" : s >= 50 ? "stroke-amber-400" : "stroke-red-500";

const severityBg: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/10 text-amber-700",
  high: "bg-orange-500/10 text-orange-700",
  critical: "bg-red-500/10 text-red-700",
};

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
  impact?: string;
  level: "error" | "warning";
}

function IssueRow({ issue, impact, level }: IssueRowProps) {
  const [open, setOpen] = useState(false);
  const plain = toPlainEnglish(issue);
  const icon = level === "error"
    ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
    : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        {icon}
        <div className="flex-1">
          <p className="text-sm">{plain}</p>
          {impact && (
            <button
              className="text-xs text-primary underline-offset-2 hover:underline mt-0.5"
              onClick={() => setOpen(v => !v)}
            >
              {open ? "Show less" : "Why does this matter?"}
            </button>
          )}
        </div>
      </div>
      {open && impact && (
        <p className="text-xs text-muted-foreground ml-6 bg-muted/40 rounded-md p-2 leading-relaxed">
          {impact}
        </p>
      )}
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
          {fix.page_title ?? "Page"} · {label}
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

// ── Fix Card ──────────────────────────────────────────────────────────────────

interface FixCardProps {
  fix: Fix;
  applying: boolean;
  rejecting: boolean;
  onApply: () => void;
  onReject: () => void;
}

function FixCard({ fix, applying, rejecting, onApply, onReject }: FixCardProps) {
  const [showHow, setShowHow] = useState(false);
  const canAuto = fix.apply_target === "wordpress" && fix.ready_to_apply?.type?.startsWith("wp_");

  const manualSteps = fix.fix_plan.manual_fallback || fix.fix_plan.steps?.join("\n");

  return (
    <div className="p-4 space-y-3 border-b last:border-0">
      {/* Title + severity */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className={`text-xs ${severityBg[fix.severity] ?? ""}`}>
              {fix.severity === "high" || fix.severity === "critical" ? "Important" :
               fix.severity === "medium" ? "Recommended" : "Minor"}
            </Badge>
          </div>
          <p className="text-sm font-medium leading-snug">{fix.issue_title}</p>
        </div>
      </div>

      {/* Plain-English explanation */}
      {fix.fix_plan.explanation && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {fix.fix_plan.explanation}
        </p>
      )}

      {/* Business impact */}
      {fix.fix_plan.impact && (
        <div className="flex items-start gap-2 text-sm bg-amber-500/5 border border-amber-500/20 rounded-md p-3">
          <TrendingUp className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-800 dark:text-amber-300">{fix.fix_plan.impact}</p>
        </div>
      )}

      {/* New value preview */}
      {fix.ready_to_apply?.payload?.value && (
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            What we'll change it to
          </p>
          <p className="text-sm font-mono break-words">{fix.ready_to_apply.payload.value}</p>
        </div>
      )}

      {/* "Tell me how" expandable */}
      {showHow && manualSteps && (
        <div className="rounded-md bg-muted/40 p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            How to do it yourself
          </p>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
            {manualSteps}
          </p>
        </div>
      )}

      {fix.error_message && (
        <div className="flex items-start gap-2 text-destructive text-xs bg-destructive/5 rounded-md p-2">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          {fix.error_message}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        {/* Tell me how */}
        {manualSteps && (
          <Button
            size="sm" variant="outline"
            className="gap-1.5"
            onClick={() => setShowHow(v => !v)}
          >
            <BookOpen className="h-3.5 w-3.5" />
            {showHow ? "Hide steps" : "Tell me how to do it"}
          </Button>
        )}

        {/* Do it for me */}
        {canAuto ? (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={onApply}
            disabled={applying}
          >
            {applying
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Zap className="h-3.5 w-3.5" />}
            Do it for me
          </Button>
        ) : (
          <Button
            size="sm" variant="secondary"
            className="gap-1.5 cursor-default opacity-70"
            disabled
            title="Your team will handle this change"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Your team handles this
          </Button>
        )}

        {/* Dismiss */}
        <Button
          size="sm" variant="ghost"
          className="text-muted-foreground hover:text-destructive gap-1.5 ml-auto"
          onClick={onReject}
          disabled={rejecting}
        >
          {rejecting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <XCircle className="h-3.5 w-3.5" />}
          Not now
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ClientSeoTab({ clientAccountId }: Props) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [loadingFixes, setLoadingFixes] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [showAllIssues, setShowAllIssues] = useState(false);

  // WordPress plugin state
  const [wpSite, setWpSite] = useState<WpSite | null | undefined>(undefined);
  const [wpFixes, setWpFixes] = useState<WpFix[]>([]);
  const [applyingWp, setApplyingWp] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true);
    const { data } = await supabase
      .from("seo_audits")
      .select("id, created_at, score, results")
      .eq("client_account_id", clientAccountId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setAudit(data as Audit | null);
    setLoadingAudit(false);
  }, [clientAccountId]);

  const loadFixes = useCallback(async () => {
    setLoadingFixes(true);
    const { data } = await supabase
      .from("ai_fixes")
      .select("id, issue_title, issue_summary, severity, status, fix_plan, ready_to_apply, apply_target, error_message, created_at")
      .eq("client_account_id", clientAccountId)
      .in("status", ["proposed", "approved", "failed"])
      .order("created_at", { ascending: false })
      .limit(50);
    setFixes((data ?? []) as Fix[]);
    setLoadingFixes(false);
  }, [clientAccountId]);

  const loadWpData = useCallback(async () => {
    const { data: site } = await supabase
      .from("connected_sites")
      .select("id, site_url, status, last_scanned_at")
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
  }, [clientAccountId]);

  useEffect(() => { loadAudit(); loadFixes(); loadWpData(); }, [loadAudit, loadFixes, loadWpData]);

  async function applyFix(fix: Fix) {
    setApplying(fix.id);
    try {
      const { data, error } = await supabase.functions.invoke("apply-fix-to-wordpress", {
        body: { fix_id: fix.id },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Failed");
      toast.success("Fix applied to your website!");
      setFixes(prev => prev.filter(f => f.id !== fix.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply fix");
    } finally {
      setApplying(null);
    }
  }

  async function rejectFix(id: string) {
    setRejecting(id);
    try {
      const { error } = await supabase
        .from("ai_fixes")
        .update({ status: "rejected" })
        .eq("id", id);
      if (error) throw error;
      setFixes(prev => prev.filter(f => f.id !== id));
      toast.success("Dismissed");
    } catch {
      toast.error("Could not dismiss");
    } finally {
      setRejecting(null);
    }
  }

  async function applyWpFix(fix: WpFix) {
    setApplyingWp(fix.id);
    try {
      const { data, error } = await supabase.functions.invoke("approve-wp-fix", {
        body: { fix_id: fix.id },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Failed");
      toast.success("Fix applied to your website!");
      setWpFixes(prev => prev.filter(f => f.id !== fix.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply fix");
    } finally {
      setApplyingWp(null);
    }
  }

  function dismissWpFix(id: string) {
    // Hide locally for this session — fix stays pending and reappears on next load
    setWpFixes(prev => prev.filter(f => f.id !== id));
  }

  const result = audit?.results;
  const score = audit?.score ?? result?.seo_score ?? null;

  const allIssues = [
    ...(result?.errors ?? []).map(e => ({ ...e, level: "error" as const })),
    ...(result?.warnings ?? []).map(w => ({ ...w, level: "warning" as const })),
  ];
  const visibleIssues = showAllIssues ? allIssues : allIssues.slice(0, 4);

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
            {wpSite?.status === "connected" && (
              <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <Plug className="h-3 w-3" />
                Monitored via WordPress plugin
              </span>
            )}
          </div>
          <Button variant="outline" size="sm"
            onClick={() => { loadAudit(); loadFixes(); loadWpData(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        {/* ── Score Card ────────────────────────────────────── */}
        {loadingAudit ? (
          <Card><CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent></Card>
        ) : !audit ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No audit run yet</p>
            <p className="text-sm mt-1">Your Orange Door team will run your first SEO audit soon.</p>
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
                    {result?.pages_crawled && (
                      <p className="text-xs text-muted-foreground">{result.pages_crawled} pages analysed</p>
                    )}
                  </div>

                  {result?.score_breakdown && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      {Object.entries(result.score_breakdown).map(([key, val]) => {
                        const meta = SCORE_TOOLTIPS[key];
                        if (val === undefined || !meta) return null;
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

                  {result?.executive_summary && (
                    <p className="text-sm text-muted-foreground border-t pt-3 leading-relaxed">
                      {result.executive_summary}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Issues (plain English) ────────────────────────── */}
        {allIssues.length > 0 && (
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
                <IssueRow key={i} issue={item.issue} impact={item.impact} level={item.level} />
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

        {/* ── What's working + Quick wins ───────────────────── */}
        {result && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(result.working_well?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    What's working
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {result.working_well!.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {(result.quick_wins?.length ?? 0) > 0 && (
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
                    {result.quick_wins!.slice(0, 5).map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <TrendingUp className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                        {w.action}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {(result.recommended_keywords?.length ?? 0) > 0 && (
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    Keywords to target
                    <InfoTip text="Search terms your potential customers are typing into Google. Your site should use these naturally in page titles, headings, and content." />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {result.recommended_keywords!.map((kw, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Fix Queue ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4" />
              Recommended improvements
              {!loadingFixes && fixes.length > 0 && (
                <Badge variant="secondary">{fixes.length}</Badge>
              )}
              <InfoTip text="Your team has already worked out exactly what needs to change and how. You can either apply the fix instantly, or follow the step-by-step guide to do it yourself." />
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {loadingFixes ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : fixes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-500" />
                <p className="text-sm font-medium">All caught up!</p>
                <p className="text-xs mt-1">No pending improvements right now.</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[640px]">
                {fixes.map(fix => (
                  <FixCard
                    key={fix.id}
                    fix={fix}
                    applying={applying === fix.id}
                    rejecting={rejecting === fix.id}
                    onApply={() => applyFix(fix)}
                    onReject={() => rejectFix(fix.id)}
                  />
                ))}
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* ── WordPress Plugin Fixes ────────────────────────── */}
        {wpFixes.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Plug className="h-4 w-4" />
                WordPress site improvements
                <Badge variant="secondary">{wpFixes.length}</Badge>
                <InfoTip text="Our plugin scanned your WordPress site and found these specific improvements. Each one can be applied automatically in seconds." />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[480px]">
                {wpFixes.map(fix => (
                  <WpFixCard
                    key={fix.id}
                    fix={fix}
                    applying={applyingWp === fix.id}
                    onApply={() => applyWpFix(fix)}
                    onDismiss={() => dismissWpFix(fix.id)}
                  />
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
