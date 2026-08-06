import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";

interface ScanResult {
  id: string;
  scanned_at: string;
  total_issues: number;
  errors: number;
  warnings: number;
  notices: number;
}

interface Props {
  siteId: string;
}

// Diminishing-returns curve instead of a flat per-issue subtraction: a flat
// "100 - errors*8" floors at 0 for any site with 13+ errors and stays there
// forever, no matter how much better or worse it gets from there -- exactly
// what happened live for a real client sitting at ~195-200 errors, where
// every single historical scan showed 0, making "Before/Now" always read as
// "no change" regardless of real progress. Each category asymptotically
// approaches its max penalty (60/25/15) as the count grows, so there's
// always real differentiation, at every count, in both directions.
function issueScore(r: ScanResult): number {
  const penalty =
    (60 * r.errors) / (r.errors + 15) +
    (25 * r.warnings) / (r.warnings + 10) +
    (15 * r.notices) / (r.notices + 8);
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function ScorePill({ value, label }: { value: number; label: string }) {
  const color =
    value >= 80 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" :
    value >= 50 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" :
    "bg-destructive/15 text-destructive";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`text-2xl font-bold rounded-lg px-3 py-1 ${color}`}>{value}</div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function SeoScoreCard({ siteId }: Props) {
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [appliedCount, setAppliedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: scanData }, { count }] = await Promise.all([
        supabase
          .from("scan_results")
          .select("id, scanned_at, total_issues, errors, warnings, notices")
          .eq("site_id", siteId)
          .order("scanned_at", { ascending: false })
          .limit(10),
        supabase
          .from("wp_fix_queue")
          .select("id", { count: "exact", head: true })
          .eq("site_id", siteId)
          .eq("status", "applied"),
      ]);
      // Fetched newest-first (to actually get the most recent 10, not the
      // oldest 10); reverse back to chronological so firstScan/latestScan
      // below and the history list's own re-reverse still read correctly.
      setScans(((scanData ?? []) as ScanResult[]).reverse());
      setAppliedCount(count ?? 0);
      setLoading(false);
    }
    load();
  }, [siteId]);

  // Don't render at all until we have real scan data — avoids showing
  // "Run a scan" alongside the main audit score card
  if (loading || scans.length === 0) return null;

  const firstScan = scans[0];
  const latestScan = scans[scans.length - 1];
  const firstScore  = issueScore(firstScan);
  const latestScore = issueScore(latestScan);
  const delta = latestScore - firstScore;
  const isImproved = delta > 0;
  const isMultiScan = scans.length > 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" />
            SEO Score
          </CardTitle>
          {appliedCount > 0 && (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent text-xs">
              {appliedCount} fix{appliedCount !== 1 ? "es" : ""} applied
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-around">
          {isMultiScan && <ScorePill value={firstScore} label="Before" />}

          {isMultiScan && (
            <div className="flex flex-col items-center gap-1">
              {delta > 0 ? (
                <TrendingUp className="h-6 w-6 text-emerald-500" />
              ) : delta < 0 ? (
                <TrendingDown className="h-6 w-6 text-destructive" />
              ) : (
                <Minus className="h-6 w-6 text-muted-foreground" />
              )}
              <span className={`text-sm font-semibold ${
                delta > 0 ? "text-emerald-600 dark:text-emerald-400" :
                delta < 0 ? "text-destructive" : "text-muted-foreground"
              }`}>
                {delta > 0 ? `+${delta}` : delta === 0 ? "—" : delta}
              </span>
            </div>
          )}

          <ScorePill value={latestScore} label={isMultiScan ? "Now" : "Score"} />
        </div>

        {/* Issue breakdown */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md bg-destructive/10 p-2">
            <p className="font-semibold text-destructive">{latestScan.errors}</p>
            <p className="text-muted-foreground">Errors</p>
          </div>
          <div className="rounded-md bg-amber-500/10 p-2">
            <p className="font-semibold text-amber-700 dark:text-amber-400">{latestScan.warnings}</p>
            <p className="text-muted-foreground">Warnings</p>
          </div>
          <div className="rounded-md bg-muted/60 p-2">
            <p className="font-semibold">{latestScan.notices}</p>
            <p className="text-muted-foreground">Notices</p>
          </div>
        </div>

        {/* History timeline */}
        {scans.length > 1 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Scan History
            </p>
            <div className="space-y-1.5">
              {[...scans].reverse().map((s, i) => {
                const score = issueScore(s);
                return (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-32 shrink-0">
                      {new Date(s.scanned_at).toLocaleDateString()}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${score}%` }}
                      />
                    </div>
                    <span className="font-medium w-8 text-right">{score}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isMultiScan && isImproved && appliedCount > 0 && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 text-center font-medium">
            {appliedCount} fix{appliedCount !== 1 ? "es" : ""} applied — SEO score improved from {firstScore} to {latestScore}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
