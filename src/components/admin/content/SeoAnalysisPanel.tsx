import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, RefreshCw, AlertTriangle, AlertCircle, Info, CheckCircle2, TrendingUp, Wrench,
} from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface ClientOption { id: string; business_name: string; }

type Severity = "critical" | "warning" | "good";
interface Finding {
  id: string;
  status: string;
  check_id: string;
  category: string;
  severity: Severity;
  title: string;
  pages: string[];
  plain_english: string;
  technical_detail: string;
  impact: number;
  effort: number;
  wp_applyable: boolean;
  fix?: { type: string; payload?: { value?: string; post_url?: string }; expected_baseline?: unknown } | null;
}
interface AuditResults {
  status?: "complete" | "inconclusive";
  reason?: string;
  overall_score?: number;
  subscores?: Record<string, number | null>;
  pages_analyzed?: { url: string; fetched_via: string; reachable: boolean }[];
  findings?: Finding[];
  action_plan?: string[];
  diff?: { previous_audit_id: string | null; regressed: number; resolved: number };
}
interface SeoAudit {
  id: string;
  client_account_id: string;
  score: number | null;
  status: string;
  results: AuditResults | null;
  created_at: string;
}

interface SeoAnalysisPanelProps {
  selectedClientId?: string;
  selectedClientName?: string;
}

const scoreColor = (s: number | null) => {
  if (s === null || s === undefined) return "text-muted-foreground";
  if (s >= 70) return "text-green-600";
  if (s >= 40) return "text-amber-600";
  return "text-red-600";
};
const barColor = (s: number) => (s >= 70 ? "bg-green-500" : s >= 40 ? "bg-amber-500" : "bg-red-500");

const sevIcon = (sev: Severity) => {
  if (sev === "critical") return <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
  if (sev === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  return <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />;
};

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical", on_page: "On-Page", performance: "Performance", content: "Content", off_page: "Off-Page",
};

export default function SeoAnalysisPanel({ selectedClientId, selectedClientName }: SeoAnalysisPanelProps) {
  const { adminPassword } = useAdminAuth();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [audits, setAudits] = useState<SeoAudit[]>([]);
  const [clientId, setClientId] = useState(selectedClientId ?? "");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("admin", {
      body: { action: "list", table: "client_accounts", password: adminPassword },
    });
    if (error || data?.error) return;
    const rows = (data?.data ?? [])
      .filter((c: { status?: string }) => c.status === "active")
      .map((c: { id: string; business_name: string }) => ({ id: c.id, business_name: c.business_name }))
      .sort((a: ClientOption, b: ClientOption) => a.business_name.localeCompare(b.business_name));
    setClients(rows);
  }, [adminPassword]);

  const loadAudits = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin", {
      body: { action: "list", table: "seo_audits", password: adminPassword },
    });
    if (error || data?.error) {
      toast({ title: "Error loading SEO audits", description: data?.error || error?.message, variant: "destructive" });
      setAudits([]);
    } else {
      setAudits((data?.data ?? []) as SeoAudit[]);
    }
    setLoading(false);
  }, [adminPassword]);

  useEffect(() => { loadClients(); }, [loadClients]);
  useEffect(() => { loadAudits(); }, [loadAudits]);
  useEffect(() => { if (selectedClientId) setClientId(selectedClientId); }, [selectedClientId]);

  const clientAudits = useMemo(
    () => audits
      .filter(a => a.client_account_id === clientId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [audits, clientId],
  );
  const latest = clientAudits[0] ?? null;
  const results = latest?.results ?? null;
  const clientName = clients.find(c => c.id === clientId)?.business_name ?? selectedClientName ?? "";

  // findings in action-plan order (falls back to as-stored)
  const orderedFindings = useMemo(() => {
    if (!results?.findings) return [];
    const byId = new Map(results.findings.map(f => [f.id, f]));
    const order = results.action_plan ?? results.findings.map(f => f.id);
    const seen = new Set<string>();
    const out: Finding[] = [];
    for (const id of order) { const f = byId.get(id); if (f && !seen.has(id)) { out.push(f); seen.add(id); } }
    return out;
  }, [results]);

  const runAudit = async () => {
    if (!clientId) { toast({ title: "Select a client first", variant: "destructive" }); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("seo-audit", {
        body: { clientId, password: adminPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.status === "inconclusive") {
        toast({ title: "Audit inconclusive", description: "The site couldn't be crawled (unreachable, blocked, or robots-disallowed)." });
      } else {
        toast({ title: `Audit complete — score ${data.overall_score}`, description: `${data.findings} findings across ${data.pages} pages.` });
      }
      loadAudits();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Audit failed", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const applyFix = async (f: Finding) => {
    if (!f.fix?.payload?.value) return;
    setApplyingId(f.id);
    try {
      const { data, error } = await supabase.functions.invoke("apply-fix-to-wordpress", {
        body: { client_id: clientId, seo_fix: f.fix, password: adminPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Applied to WordPress", description: `${f.title} — re-audit will confirm it resolved.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Couldn't apply", description: msg, variant: "destructive" });
    } finally {
      setApplyingId(null);
    }
  };

  const subOrder = ["technical", "on_page", "performance", "content", "off_page"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-base font-semibold">
          <Search className="w-4 h-4 text-orange-500" /> SEO Analysis
        </div>
        <div className="flex-1" />
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select client..." /></SelectTrigger>
          <SelectContent>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadAudits} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button onClick={runAudit} disabled={running || !clientId} className="gap-2">
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
          {running ? "Auditing..." : "Run new audit"}
        </Button>
      </div>

      {!clientId ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Select a client to view its SEO analysis.</CardContent></Card>
      ) : loading ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Loading...</CardContent></Card>
      ) : !latest ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No SEO audits yet for {clientName}. Click "Run new audit" to generate one.</CardContent></Card>
      ) : latest.status === "inconclusive" ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-500" />
          <p className="font-medium text-foreground">Audit inconclusive</p>
          <p className="text-sm mt-1">{results?.reason ?? "The site couldn't be crawled."}</p>
        </CardContent></Card>
      ) : (
        <>
          {/* Score + subscores + history */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs text-muted-foreground">Overall score</div>
                <div className={`text-4xl font-bold ${scoreColor(latest.score)}`}>
                  {latest.score ?? "—"}<span className="text-base text-muted-foreground">/100</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{format(new Date(latest.created_at), "MMM d, yyyy")}</div>
                {results?.diff && (results.diff.resolved > 0 || results.diff.regressed > 0) && (
                  <div className="text-xs mt-2 flex gap-3">
                    {results.diff.resolved > 0 && <span className="text-green-600">▲ {results.diff.resolved} resolved</span>}
                    {results.diff.regressed > 0 && <span className="text-red-600">▼ {results.diff.regressed} regressed</span>}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardContent className="p-5">
                <div className="text-xs text-muted-foreground mb-3">Dimensions</div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {subOrder.map(cat => {
                    const v = results?.subscores?.[cat];
                    return (
                      <div key={cat}>
                        <div className={`text-xl font-bold ${v == null ? "text-muted-foreground" : scoreColor(v)}`}>
                          {v == null ? "—" : v}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{CATEGORY_LABELS[cat]}</div>
                        {v == null && <div className="text-[10px] text-muted-foreground/70">not measured</div>}
                      </div>
                    );
                  })}
                </div>
                {results?.pages_analyzed && (
                  <div className="text-xs text-muted-foreground mt-4 pt-3 border-t">
                    {results.pages_analyzed.length} pages analyzed
                    {results.pages_analyzed.some(p => p.fetched_via === "plain") && " · some pages not JS-rendered"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Action plan */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Action plan · {orderedFindings.length} findings, highest impact first
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {orderedFindings.map(f => (
                  <div key={f.id} className="flex items-start gap-3 px-4 py-3">
                    {sevIcon(f.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{f.title}</span>
                        {f.wp_applyable && (
                          <Badge variant="outline" className="text-[10px] gap-1 text-orange-700 border-orange-200">
                            <Wrench className="w-3 h-3" /> WordPress-fixable
                          </Badge>
                        )}
                        {f.status === "regressed" && (
                          <Badge variant="outline" className="text-[10px] text-red-700 border-red-200">regressed</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{f.plain_english}</p>
                      <div className="text-xs text-muted-foreground/70 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>{f.technical_detail}</span>
                        <span>· affects {f.pages.length} page{f.pages.length === 1 ? "" : "s"}</span>
                        <span>· impact {f.impact}/5 · effort {f.effort}/5</span>
                      </div>
                      {f.fix?.payload?.value && (
                        <div className="text-xs mt-1.5 rounded bg-muted/50 px-2 py-1 text-muted-foreground">
                          Suggested: <span className="text-foreground">{f.fix.payload.value}</span>
                        </div>
                      )}
                    </div>
                    {f.wp_applyable && f.fix?.payload?.value && (
                      <Button
                        size="sm" variant="outline"
                        className="flex-shrink-0 gap-1 text-orange-700 border-orange-200 hover:bg-orange-50"
                        disabled={applyingId === f.id}
                        onClick={() => applyFix(f)}
                      >
                        {applyingId === f.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                        Apply
                      </Button>
                    )}
                  </div>
                ))}
                {orderedFindings.length === 0 && (
                  <div className="py-10 text-center text-muted-foreground text-sm">No findings — this site looks healthy.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
