import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Wand2, CheckCircle2, XCircle, Loader2, AlertTriangle,
  RefreshCw, Globe, ChevronDown, ChevronUp,
} from "lucide-react";

interface Fix {
  id: string;
  site_id: string;
  post_id: number | null;
  media_id: number | null;
  page_title: string | null;
  page_url: string | null;
  field: string;
  current_value: string | null;
  suggested_value: string;
  status: string;
  applied_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface PageGroup {
  key: string;
  title: string;
  url: string | null;
  fixes: Fix[];
}

interface Props {
  siteId: string;
}

const FIELD_LABELS: Record<string, string> = {
  meta_title:    "Meta Title",
  meta_desc:     "Meta Description",
  focus_keyword: "Focus Keyword",
  alt_text:      "Image Alt Text",
  slug:          "URL Slug",
  title:         "Page Title",
  canonical:     "Canonical URL",
};

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  approved: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  applied:  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed:   "bg-destructive/15 text-destructive",
};

function groupByPage(fixes: Fix[]): PageGroup[] {
  const map = new Map<string, PageGroup>();
  for (const fix of fixes) {
    const key = fix.page_url ?? String(fix.post_id ?? fix.media_id ?? "unknown");
    if (!map.has(key)) {
      map.set(key, { key, title: fix.page_title ?? "Untitled", url: fix.page_url, fixes: [] });
    }
    map.get(key)!.fixes.push(fix);
  }
  return Array.from(map.values());
}

export function WpFixQueuePanel({ siteId }: Props) {
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [approvingAll, setApprovingAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("wp_fix_queue")
      .select("*")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load fix queue");
    } else {
      setFixes(data as Fix[]);
      // Auto-expand pages that have pending fixes
      const pendingGroups = groupByPage((data as Fix[]).filter(f => f.status === "pending"));
      setExpanded(new Set(pendingGroups.map(g => g.key)));
    }
    setLoading(false);
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  async function applyFix(fix: Fix) {
    setApplying(prev => new Set(prev).add(fix.id));
    try {
      const { data, error } = await supabase.functions.invoke("approve-wp-fix", {
        body: { fix_id: fix.id },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Failed");

      const status = data?.status ?? "applied";
      setFixes(prev => prev.map(f => f.id === fix.id ? { ...f, status } : f));
      if (status === "applied") {
        toast.success(`Fix applied — ${FIELD_LABELS[fix.field] ?? fix.field}`);
      } else {
        toast.error(`Fix failed — check error details`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply fix");
      setFixes(prev => prev.map(f => f.id === fix.id ? { ...f, status: "failed" } : f));
    } finally {
      setApplying(prev => { const n = new Set(prev); n.delete(fix.id); return n; });
    }
  }

  async function approveAll() {
    const pending = fixes.filter(f => f.status === "pending" || f.status === "failed");
    if (pending.length === 0) return;
    setApprovingAll(true);
    let successCount = 0;
    for (const fix of pending) {
      try {
        await applyFix(fix);
        successCount++;
      } catch {
        // continue
      }
    }
    setApprovingAll(false);
    toast.success(`Applied ${successCount} of ${pending.length} fixes`);
  }

  function togglePage(key: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  const groups = groupByPage(fixes);
  const pendingCount = fixes.filter(f => f.status === "pending" || f.status === "failed").length;
  const appliedCount = fixes.filter(f => f.status === "applied").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4" />
            Fix Queue
            {!loading && (
              <>
                {pendingCount > 0 && (
                  <Badge variant="secondary">{pendingCount} pending</Badge>
                )}
                {appliedCount > 0 && (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent">
                    {appliedCount} applied
                  </Badge>
                )}
              </>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {pendingCount > 0 && (
              <Button
                size="sm"
                onClick={approveAll}
                disabled={approvingAll}
              >
                {approvingAll
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Applying…</>
                  : <><CheckCircle2 className="h-4 w-4" /> Approve All ({pendingCount})</>
                }
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2" />
            <p className="text-sm">No fixes in queue — run a scan to generate suggestions</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[640px]">
            <div className="divide-y">
              {groups.map(group => {
                const groupPending = group.fixes.filter(f => f.status === "pending" || f.status === "failed");
                return (
                  <div key={group.key}>
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                      onClick={() => togglePage(group.key)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{group.title}</span>
                        {group.url && (
                          <span className="text-xs text-muted-foreground truncate hidden sm:block">
                            {group.url}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs text-muted-foreground">{group.fixes.length} fix{group.fixes.length !== 1 ? "es" : ""}</span>
                        {expanded.has(group.key) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>

                    {expanded.has(group.key) && (
                      <div className="bg-muted/20 divide-y divide-border/50">
                        {group.fixes.map(fix => (
                          <div key={fix.id} className="px-4 py-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  {FIELD_LABELS[fix.field] ?? fix.field}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${STATUS_BADGE[fix.status] ?? ""}`}
                                >
                                  {fix.status}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {(fix.status === "pending" || fix.status === "failed") && (
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => applyFix(fix)}
                                    disabled={applying.has(fix.id) || approvingAll}
                                  >
                                    {applying.has(fix.id)
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : fix.status === "failed" ? "Retry" : "Apply"
                                    }
                                  </Button>
                                )}
                                {fix.status === "applied" && (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <p className="text-muted-foreground mb-1">Current</p>
                                <p className={`rounded px-2 py-1 font-mono break-words ${
                                  fix.current_value
                                    ? "bg-muted/60"
                                    : "bg-destructive/10 text-destructive italic"
                                }`}>
                                  {fix.current_value || "empty"}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Suggested</p>
                                <p className="rounded px-2 py-1 font-mono break-words bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                                  {fix.suggested_value}
                                </p>
                              </div>
                            </div>

                            {fix.error_message && (
                              <div className="flex items-start gap-1.5 text-xs text-destructive">
                                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                {fix.error_message}
                              </div>
                            )}
                          </div>
                        ))}

                        {groupPending.length > 1 && (
                          <div className="px-4 py-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs w-full"
                              onClick={async () => {
                                for (const f of groupPending) await applyFix(f);
                              }}
                              disabled={approvingAll}
                            >
                              Apply all {groupPending.length} for this page
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
