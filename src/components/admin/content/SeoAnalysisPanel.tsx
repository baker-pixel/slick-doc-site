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
  Search, RefreshCw, AlertTriangle, AlertCircle, Info, CheckCircle2, TrendingUp,
} from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface ClientOption { id: string; business_name: string; }

interface SeoAudit {
  id: string;
  client_account_id: string;
  audit_type: string;
  score: number | null;
  results: Record<string, unknown> | null;
  created_at: string;
}

interface SeoAnalysisPanelProps {
  selectedClientId?: string;
  selectedClientName?: string;
}

const scoreColor = (s: number | null) => {
  if (s === null) return "text-muted-foreground";
  if (s >= 70) return "text-green-600";
  if (s >= 40) return "text-amber-600";
  return "text-red-600";
};

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// The results payload comes in two historical shapes -- newer
// {onPage,offPage,technical,overallScore,...} and older
// {errors,warnings,notices,quick_wins,...}. Normalize both into labeled
// finding groups the UI can render without caring which produced it.
interface FindingGroup { label: string; tone: "error" | "warning" | "info" | "good"; items: string[]; score?: number; }

function toText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    return String(o.issue ?? o.message ?? o.title ?? o.fix ?? JSON.stringify(o));
  }
  return String(item);
}

function extractFindings(results: Record<string, unknown> | null): FindingGroup[] {
  if (!results) return [];
  const groups: FindingGroup[] = [];

  // Newer shape: category objects with { score, issues }
  for (const key of ["technical", "onPage", "offPage"]) {
    const cat = results[key] as Record<string, unknown> | undefined;
    if (cat && typeof cat === "object" && ("issues" in cat || "score" in cat)) {
      groups.push({
        label: key === "onPage" ? "On-Page" : key === "offPage" ? "Off-Page" : "Technical",
        tone: "warning",
        score: typeof cat.score === "number" ? cat.score : undefined,
        items: asArray(cat.issues).map(toText),
      });
    }
  }

  // Older shape: severity buckets
  const buckets: Array<[string, FindingGroup["tone"], string]> = [
    ["errors", "error", "Errors"],
    ["warnings", "warning", "Warnings"],
    ["notices", "info", "Notices"],
    ["quick_wins", "good", "Quick Wins"],
  ];
  for (const [key, tone, label] of buckets) {
    const items = asArray(results[key]).map(toText);
    if (items.length) groups.push({ label, tone, items });
  }

  return groups;
}

const toneIcon = (tone: FindingGroup["tone"]) => {
  switch (tone) {
    case "error": return <AlertCircle className="w-4 h-4 text-red-500" />;
    case "warning": return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case "good": return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    default: return <Info className="w-4 h-4 text-blue-500" />;
  }
};

export default function SeoAnalysisPanel({ selectedClientId, selectedClientName }: SeoAnalysisPanelProps) {
  const { adminPassword } = useAdminAuth();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [audits, setAudits] = useState<SeoAudit[]>([]);
  const [clientId, setClientId] = useState(selectedClientId ?? "");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

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
  const findings = useMemo(() => extractFindings(latest?.results ?? null), [latest]);
  const clientName = clients.find(c => c.id === clientId)?.business_name ?? selectedClientName ?? "";

  const runAudit = async () => {
    if (!clientId) {
      toast({ title: "Select a client first", variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-automation", {
        body: { clientId, jobType: "run_seo_audit", password: adminPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "SEO audit complete", description: "Latest results loaded below." });
      loadAudits();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Audit failed", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-base font-semibold">
          <Search className="w-4 h-4 text-orange-500" />
          SEO Analysis
        </div>
        <div className="flex-1" />
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select client..." />
          </SelectTrigger>
          <SelectContent>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadAudits} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button onClick={runAudit} disabled={running || !clientId} className="gap-2">
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
          {running ? "Running..." : "Run new audit"}
        </Button>
      </div>

      {!clientId ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          Select a client to view its SEO analysis.
        </CardContent></Card>
      ) : loading ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Loading...</CardContent></Card>
      ) : !latest ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          No SEO audits yet for {clientName}. Click "Run new audit" to generate one.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs text-muted-foreground">Current score</div>
                <div className={`text-4xl font-bold ${scoreColor(latest.score)}`}>
                  {latest.score ?? "—"}<span className="text-base text-muted-foreground">/100</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {format(new Date(latest.created_at), "MMM d, yyyy")}
                </div>
              </CardContent>
            </Card>
            <Card className="sm:col-span-2">
              <CardContent className="p-5">
                <div className="text-xs text-muted-foreground mb-2">Score history</div>
                <div className="flex items-end gap-2 h-16">
                  {clientAudits.slice(0, 12).reverse().map(a => (
                    <div key={a.id} className="flex-1 flex flex-col items-center gap-1" title={`${a.score ?? "—"} · ${format(new Date(a.created_at), "MMM d")}`}>
                      <div
                        className={`w-full rounded-t ${(a.score ?? 0) >= 70 ? "bg-green-500" : (a.score ?? 0) >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ height: `${Math.max(4, (a.score ?? 0) * 0.6)}px` }}
                      />
                      <span className="text-[10px] text-muted-foreground">{format(new Date(a.created_at), "M/d")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {findings.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
              This audit recorded a score but no itemized findings.
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {findings.map((g, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {toneIcon(g.tone)}
                      {g.label}
                      {typeof g.score === "number" && (
                        <Badge variant="outline" className={`ml-auto ${scoreColor(g.score)}`}>{g.score}</Badge>
                      )}
                      {typeof g.score !== "number" && g.items.length > 0 && (
                        <Badge variant="outline" className="ml-auto">{g.items.length}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {g.items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No items.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {g.items.slice(0, 12).map((item, j) => (
                          <li key={j} className="text-sm text-muted-foreground flex gap-2">
                            <span className="text-muted-foreground/50">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
