import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Wand2, XCircle, CheckCircle2, Loader2, Clock, AlertTriangle,
  ChevronDown, ChevronUp, RefreshCw
} from "lucide-react";

interface Fix {
  id: string;
  client_account_id: string;
  source: string;
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
  client_name?: string;
}

interface Client {
  id: string;
  business_name: string;
}

interface Props {
  clientId?: string;
}

const severityColor: Record<string, string> = {
  low:      "bg-muted text-muted-foreground",
  medium:   "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  high:     "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  critical: "bg-destructive/15 text-destructive",
};

const statusColor: Record<string, string> = {
  proposed: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  approved: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  applied:  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed:   "bg-destructive/15 text-destructive",
  rejected: "bg-muted text-muted-foreground",
};

export function SeoFixQueuePanel({ clientId }: Props) {
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterClient, setFilterClient] = useState<string>(clientId ?? "all");
  const [filterStatus, setFilterStatus] = useState<string>("proposed");
  const [applying, setApplying] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("ai_fixes")
        .select("*, client_accounts(business_name)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (filterClient !== "all") q = q.eq("client_account_id", filterClient);
      if (filterStatus !== "all")  q = q.eq("status", filterStatus);

      const { data, error } = await q;
      if (error) throw error;

      setFixes(
        (data ?? []).map((f: any) => ({
          ...f,
          client_name: f.client_accounts?.business_name ?? "Unknown",
        }))
      );

      if (!clientId) {
        const { data: ca } = await supabase
          .from("client_accounts")
          .select("id, business_name")
          .order("business_name");
        setClients(ca ?? []);
      }
    } catch (e) {
      toast.error("Failed to load fix queue");
    } finally {
      setLoading(false);
    }
  }, [filterClient, filterStatus, clientId]);

  useEffect(() => { load(); }, [load]);

  async function applyFix(fix: Fix) {
    setApplying(fix.id);
    try {
      const { data, error } = await supabase.functions.invoke("apply-fix-to-wordpress", {
        body: { fix_id: fix.id },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "Failed");
      toast.success("Fix applied to WordPress");
      setFixes(prev => prev.map(f => f.id === fix.id ? { ...f, status: "applied" } : f));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply fix");
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
      setFixes(prev => prev.map(f => f.id === id ? { ...f, status: "rejected" } : f));
      toast.success("Fix rejected");
    } catch (e) {
      toast.error("Failed to reject fix");
    } finally {
      setRejecting(null);
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const canApply = (fix: Fix) =>
    fix.status !== "applied" &&
    fix.status !== "rejected" &&
    fix.apply_target === "wordpress" &&
    fix.ready_to_apply?.type?.startsWith("wp_");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4" />
            SEO Fix Queue
            {!loading && (
              <Badge variant="secondary">{fixes.length}</Badge>
            )}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {!clientId && (
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="All clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="proposed">Proposed</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : fixes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2" />
            <p className="text-sm">No fixes in this queue</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[600px]">
            <div className="divide-y">
              {fixes.map(fix => (
                <div key={fix.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className={`text-xs ${severityColor[fix.severity] ?? ""}`}>
                          {fix.severity}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${statusColor[fix.status] ?? ""}`}>
                          {fix.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{fix.source}</Badge>
                        {!clientId && (
                          <span className="text-xs text-muted-foreground">{fix.client_name}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium">{fix.issue_title}</p>
                      {fix.issue_summary && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{fix.issue_summary}</p>
                      )}
                      {fix.ready_to_apply?.payload?.post_url && (
                        <p className="text-xs text-muted-foreground truncate">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {fix.ready_to_apply.payload.post_url}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => toggleExpand(fix.id)}
                      >
                        {expanded.has(fix.id)
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />
                        }
                      </Button>
                    </div>
                  </div>

                  {expanded.has(fix.id) && (
                    <div className="space-y-3 pt-2 border-t text-sm">
                      {fix.fix_plan.explanation && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Why it matters</p>
                          <p>{fix.fix_plan.explanation}</p>
                        </div>
                      )}
                      {fix.fix_plan.impact && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Impact</p>
                          <p>{fix.fix_plan.impact}</p>
                        </div>
                      )}
                      {fix.ready_to_apply?.payload?.value && (
                        <div className="rounded-md bg-muted/50 p-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                            New value ({fix.ready_to_apply.type})
                          </p>
                          <p className="font-mono text-xs whitespace-pre-wrap break-words">
                            {fix.ready_to_apply.payload.value}
                          </p>
                        </div>
                      )}
                      {fix.fix_plan.manual_fallback && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Manual steps</p>
                          <p className="text-xs text-muted-foreground whitespace-pre-line">{fix.fix_plan.manual_fallback}</p>
                        </div>
                      )}
                      {fix.error_message && (
                        <div className="flex items-start gap-2 text-destructive text-xs">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          {fix.error_message}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    {canApply(fix) && (
                      <Button
                        size="sm"
                        onClick={() => applyFix(fix)}
                        disabled={applying === fix.id}
                      >
                        {applying === fix.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Wand2 className="h-4 w-4" />
                        }
                        Apply to WordPress
                      </Button>
                    )}
                    {fix.status === "failed" && canApply(fix) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applyFix(fix)}
                        disabled={applying === fix.id}
                      >
                        Retry
                      </Button>
                    )}
                    {fix.status !== "applied" && fix.status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => rejectFix(fix.id)}
                        disabled={rejecting === fix.id}
                      >
                        {rejecting === fix.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <XCircle className="h-4 w-4" />
                        }
                        Reject
                      </Button>
                    )}
                    {fix.status === "applied" && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Applied
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
