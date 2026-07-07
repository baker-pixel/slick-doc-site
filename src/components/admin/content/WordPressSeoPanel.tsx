import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ConnectSitePanel } from "./ConnectSitePanel";
import { WpFixQueuePanel } from "./WpFixQueuePanel";
import { SeoFixQueuePanel } from "./SeoFixQueuePanel";
import { SeoScoreCard } from "@/components/admin/shared/SeoScoreCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, Search, AlertTriangle, CheckCircle2,
  Lightbulb, Target, TrendingUp, ShieldCheck,
} from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

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
}

interface Audit {
  id: string;
  created_at: string;
  score: number | null;
  results: AuditResult | null;
}

interface Props {
  clientId: string;
  clientName?: string;
}

const scoreColor = (s: number) =>
  s >= 70 ? "text-emerald-600" : s >= 50 ? "text-amber-500" : "text-red-500";

const SCORE_LABELS: Record<string, string> = {
  crawlability: "Crawlability",
  on_page: "On-Page",
  content_quality: "Content Quality",
  technical_performance: "Performance",
  site_architecture: "Site Structure",
};

const ISSUE_TRANSLATIONS: Record<string, string> = {
  "missing title tag": "Missing page title (shows in Google results)",
  "missing meta description": "Missing meta description",
  "missing h1 tag": "Missing main heading (H1)",
  "multiple h1 tags": "Multiple H1 tags on same page",
  "missing canonical tag": "Missing canonical tag",
  "missing viewport meta": "Not optimised for mobile",
  "no structured data": "Missing structured data markup",
  "missing open graph": "Missing Open Graph tags",
  "thin content": "Thin / low-word-count content",
  "not served over https": "Not fully served over HTTPS",
  "noindex detected": "Pages accidentally noindexed",
};

function toPlainEnglish(issue: string): string {
  const lower = issue.toLowerCase();
  for (const [key, val] of Object.entries(ISSUE_TRANSLATIONS)) {
    if (lower.includes(key)) return val;
  }
  return issue;
}

export function WordPressSeoPanel({ clientId }: Props) {
  const { adminPassword } = useAdminAuth();
  const [siteId, setSiteId] = useState<string | null>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(true);

  // Reset siteId when switching clients so stale WP site data doesn't leak
  useEffect(() => { setSiteId(null); }, [clientId]);

  useEffect(() => {
    setLoadingAudit(true);
    setAudit(null);
    supabase
      .from("seo_audits")
      .select("id, created_at, score, results")
      .eq("client_account_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setAudit(data as Audit | null);
        setLoadingAudit(false);
      });
  }, [clientId]);

  const result = audit?.results;
  const score = audit?.score ?? result?.seo_score ?? null;
  const allIssues = [
    ...(result?.errors ?? []).map(e => ({ ...e, level: "error" as const })),
    ...(result?.warnings ?? []).map(w => ({ ...w, level: "warning" as const })),
  ];

  return (
    <div className="space-y-4">
      {/* WP Plugin connection + WP scan score */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <ConnectSitePanel
            clientId={clientId}
            mode="admin"
            onSiteConnected={setSiteId}
            adminPassword={adminPassword}
          />
        </div>
        <div>
          {siteId && <SeoScoreCard siteId={siteId} />}
        </div>
      </div>

      {/* Latest full-site SEO audit — shown only when no WP plugin connected */}
      {!siteId && (loadingAudit ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : audit ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              SEO Audit
              <span className="text-xs font-normal text-muted-foreground">
                {new Date(audit.created_at).toLocaleDateString()}
              </span>
              {result?.pages_crawled && (
                <Badge variant="secondary" className="text-xs">
                  {result.pages_crawled} pages
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Score + breakdown */}
            <div className="flex items-start gap-6 flex-wrap">
              {score !== null && (
                <div className="text-center shrink-0">
                  <div className={`text-5xl font-bold ${scoreColor(score)}`}>{score}</div>
                  <div className="text-xs text-muted-foreground">/100</div>
                </div>
              )}
              {result?.score_breakdown && (
                <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2 min-w-[240px]">
                  {Object.entries(result.score_breakdown).map(([key, val]) => (
                    <div key={key} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {SCORE_LABELS[key] ?? key}
                        </span>
                        <span className={`font-semibold ${scoreColor(val)}`}>{val}</span>
                      </div>
                      <Progress value={val} className="h-1.5" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {result?.executive_summary && (
              <p className="text-sm text-muted-foreground border-t pt-3 leading-relaxed">
                {result.executive_summary}
              </p>
            )}

            {/* Issues */}
            {allIssues.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Issues Found
                </p>
                {allIssues.slice(0, 6).map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                      item.level === "error" ? "text-red-500" : "text-amber-500"
                    }`} />
                    <span>{toPlainEnglish(item.issue)}</span>
                  </div>
                ))}
                {allIssues.length > 6 && (
                  <p className="text-xs text-muted-foreground pl-5">
                    +{allIssues.length - 6} more issues
                  </p>
                )}
              </div>
            )}

            {/* What's working + Quick wins */}
            {((result?.working_well?.length ?? 0) > 0 ||
              (result?.quick_wins?.length ?? 0) > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-3">
                {(result?.working_well?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-500" /> What's working
                    </p>
                    {result!.working_well!.slice(0, 3).map((item, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                )}
                {(result?.quick_wins?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Lightbulb className="h-3 w-3 text-amber-500" /> Quick wins
                    </p>
                    {result!.quick_wins!.slice(0, 3).map((w, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        <TrendingUp className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                        {w.action}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recommended keywords */}
            {(result?.recommended_keywords?.length ?? 0) > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-2">
                  <Target className="h-3 w-3 text-primary" /> Target keywords
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result!.recommended_keywords!.map((kw, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null)}

      {/* AI-generated fix recommendations (ai_fixes table) */}
      <SeoFixQueuePanel clientId={clientId} />

      {/* WordPress plugin fix queue (wp_fix_queue table) */}
      {siteId && <WpFixQueuePanel siteId={siteId} />}
    </div>
  );
}
