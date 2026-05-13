import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Search,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  FileText,
  Link2,
  Image,
  Type,
  Gauge,
  Target,
  ExternalLink,
  Loader2,
  Plus,
  Sparkles,
  Copy,
  TrendingUp,
  Smartphone,
  Globe,
  Play,
  BarChart3
} from "lucide-react";
import { format } from "date-fns";
import { AiFixCard } from "@/components/admin/shared/AiFixCard";
import { ScoreHeader } from "@/components/admin/shared/ScoreHeader";
import { SeverityIssueList } from "@/components/admin/shared/SeverityIssueList";
import { InsightColumns } from "@/components/admin/shared/InsightColumns";
import { ActionPriorityList } from "@/components/admin/shared/ActionPriorityList";

interface SeoAnalysis {
  id: string;
  client_account_id: string;
  url: string;
  page_title: string | null;
  overall_score: number | null;
  readability_score: number | null;
  keyword_score: number | null;
  technical_score: number | null;
  backlink_potential: number | null;
  keywords_found: any[] | null;
  technical_issues: any[] | null;
  readability_issues: any[] | null;
  suggestions: any[] | null;
  ai_rewrites: any[] | null;
  meta_title: string | null;
  meta_description: string | null;
  h1_tags: any[] | null;
  word_count: number | null;
  image_count: number | null;
  images_missing_alt: number | null;
  internal_links: number | null;
  external_links: number | null;
  mobile_friendly: boolean | null;
  load_time_ms: number | null;
  analyzed_at: string;
}

// Helper to safely cast JSON to array
const asArray = (val: unknown): any[] => Array.isArray(val) ? val : [];

interface Client {
  id: string;
  business_name: string;
}

// ── Site-audit types ─────────────────────────────────────────────────────────

interface WorkflowTask {
  id: string;
  client_id: string;
  status: string;
  progress_message: string | null;
  pages_crawled: number | null;
  result: Record<string, unknown> | null;
  created_at: string;
}

interface FullAuditResult {
  seo_score: number;
  score_breakdown?: {
    crawlability?: number;
    on_page?: number;
    content_quality?: number;
    technical_performance?: number;
    site_architecture?: number;
  };
  pages_crawled: number;
  errors: { issue: string; affected_pages: string[]; impact: string }[];
  warnings: { issue: string; affected_pages: string[]; impact: string }[];
  notices: { issue: string; affected_pages: string[]; impact: string }[];
  working_well: string[];
  quick_wins: { action: string; effort: string; impact: string }[];
  recommended_keywords: string[];
  keyword_cannibalisation_risks: string[];
  local_seo_gaps: string[];
  executive_summary: string;
  action_priority_list: { priority: number; action: string; category: string; estimated_effort: string }[];
  crawl_data?: Record<string, unknown>;
}

export default function SeoAnalysisDashboard() {
  const [analyses, setAnalyses] = useState<SeoAnalysis[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [targetKeywords, setTargetKeywords] = useState("");
  const [selectedAnalysis, setSelectedAnalysis] = useState<SeoAnalysis | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // ── Full-site audit state ────────────────────────────────────────────────
  const [auditScope, setAuditScope]         = useState<"page" | "site">("page");
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [currentTask, setCurrentTask]       = useState<WorkflowTask | null>(null);
  const [auditResult, setAuditResult]       = useState<FullAuditResult | null>(null);
  const [auditHistory, setAuditHistory]     = useState<WorkflowTask[]>([]);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => { fetchClients(); }, []);
  useEffect(() => { if (selectedClient) { fetchAnalyses(); fetchAuditHistory(); } }, [selectedClient]);
  useEffect(() => () => { realtimeRef.current?.unsubscribe(); }, []);

  const fetchAuditHistory = async () => {
    if (!selectedClient) return;
    const { data } = await supabase
      .from("workflow_tasks")
      .select("id, client_id, status, progress_message, pages_crawled, result, created_at")
      .eq("client_id", selectedClient)
      .eq("task_type", "seo")
      .order("created_at", { ascending: false })
      .limit(5);
    setAuditHistory((data ?? []) as WorkflowTask[]);
    // If there's a recently completed full audit, show it
    const latest = (data ?? []).find((t: WorkflowTask) => t.status === "completed" && (t.result as any)?.score_breakdown);
    if (latest?.result) setAuditResult(latest.result as FullAuditResult);
  };

  const subscribeToTask = (taskId: string) => {
    realtimeRef.current?.unsubscribe();
    const channel = supabase
      .channel(`wf_task_${taskId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "workflow_tasks",
        filter: `id=eq.${taskId}`,
      }, (payload) => {
        const updated = payload.new as WorkflowTask;
        setCurrentTask(updated);
        if (updated.status === "completed") {
          setIsRunningAudit(false);
          setAuditResult((updated.result as FullAuditResult) ?? null);
          channel.unsubscribe();
          fetchAuditHistory();
          toast.success(`Full-site audit complete — ${updated.pages_crawled ?? 0} pages crawled`);
        }
        if (updated.status === "failed") {
          setIsRunningAudit(false);
          channel.unsubscribe();
          toast.error("Audit failed — check error log");
        }
      })
      .subscribe();
    realtimeRef.current = channel;
  };

  const startFullSiteAudit = async () => {
    if (!selectedClient) { toast.error("Select a client first"); return; }
    setIsRunningAudit(true);
    setAuditResult(null);
    setCurrentTask(null);
    try {
      // Create workflow task
      const { data: task, error: te } = await supabase
        .from("workflow_tasks")
        .insert({
          client_id: selectedClient,
          task_type: "seo",
          status: "pending",
          audit_scope: "full",
          payload: { audit_scope: "full", analysis_type: "full_site_audit" },
        })
        .select()
        .single();
      if (te || !task) throw new Error("Failed to create audit task");
      setCurrentTask(task as WorkflowTask);
      subscribeToTask(task.id);
      // Invoke edge function
      const { error: fe } = await supabase.functions.invoke("run-seo-agent", {
        body: { task_id: task.id },
      });
      if (fe) throw fe;
    } catch (e) {
      setIsRunningAudit(false);
      toast.error(`Audit failed to start: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from("client_accounts")
      .select("id, business_name")
      .order("business_name");

    if (error) {
      toast.error("Failed to fetch clients");
    } else {
      setClients(data || []);
      if (data && data.length > 0) {
        setSelectedClient(data[0].id);
      }
    }
    setIsLoading(false);
  };

  const fetchAnalyses = async () => {
    if (!selectedClient) return;

    const { data, error } = await supabase
      .from("seo_page_analysis")
      .select("*")
      .eq("client_account_id", selectedClient)
      .order("analyzed_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch analyses");
    } else {
      setAnalyses((data || []) as SeoAnalysis[]);
    }
  };

  const runAnalysis = async () => {
    if (!selectedClient || !newUrl) {
      toast.error("Please select a client and enter a URL");
      return;
    }

    // Validate URL
    try {
      new URL(newUrl);
    } catch {
      toast.error("Please enter a valid URL (including https://)");
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-seo", {
        body: {
          clientId: selectedClient,
          url: newUrl,
          targetKeywords: targetKeywords.split(",").map(k => k.trim()).filter(k => k),
        },
      });

      if (error) throw error;

      const meta = data?.meta;
      const detail = meta
        ? ` • JS rendered: ${meta.renderedWithJs ? "yes" : "no"} • PageSpeed: ${meta.pageSpeedAvailable ? `mobile ${meta.mobileScore}/100` : "unavailable"}`
        : "";
      toast.success(`SEO analysis complete!${detail}`);
      setNewUrl("");
      setTargetKeywords("");
      fetchAnalyses();
    } catch (error) {
      toast.error(`Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBg = (score: number | null) => {
    if (score === null) return "bg-muted";
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "high":
        return <Badge variant="destructive">High</Badge>;
      case "medium":
        return <Badge variant="secondary" className="bg-yellow-500 text-white">Medium</Badge>;
      default:
        return <Badge variant="outline">Low</Badge>;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const openDetails = (analysis: SeoAnalysis) => {
    setSelectedAnalysis(analysis);
    setDetailsOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Progress step labels ────────────────────────────────────────────────
  const PROGRESS_STEPS = [
    "Fetching robots.txt...",
    "Discovering pages via sitemap...",
    "Building crawl queue...",
    "Crawling page",
    "Fetching PageSpeed scores...",
    "Analysing signals...",
    "Generating AI report...",
  ];
  const progressStep = PROGRESS_STEPS.findIndex(s => currentTask?.progress_message?.startsWith(s));
  const progressPct  = Math.round(((progressStep + 1) / PROGRESS_STEPS.length) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            SEO Dashboard
          </h2>
          <p className="text-muted-foreground">Analyze pages, run full-site audits, get AI-powered fixes</p>
        </div>
        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select client" />
          </SelectTrigger>
          <SelectContent>
            {clients.map(client => (
              <SelectItem key={client.id} value={client.id}>
                {client.business_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Audit scope tabs ─────────────────────────────────────────────── */}
      <Tabs value={auditScope} onValueChange={v => setAuditScope(v as "page" | "site")}>
        <TabsList className="w-full max-w-sm">
          <TabsTrigger value="page" className="flex items-center gap-2 flex-1">
            <Search className="h-4 w-4" /> Single Page
          </TabsTrigger>
          <TabsTrigger value="site" className="flex items-center gap-2 flex-1">
            <Globe className="h-4 w-4" /> Full Site Audit
          </TabsTrigger>
        </TabsList>

        {/* ── Full-site audit tab ─────────────────────────────────────────── */}
        <TabsContent value="site" className="space-y-4 mt-4">
          {/* Trigger card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Full-Site SEO Audit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Crawls up to 25 pages via sitemap, extracts on-page signals, checks PageSpeed, and generates a comprehensive Semrush-style audit report.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  onClick={startFullSiteAudit}
                  disabled={isRunningAudit || !selectedClient}
                  className="gap-2"
                >
                  {isRunningAudit ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Running audit...</>
                  ) : (
                    <><Play className="h-4 w-4" /> Start Full Site Audit</>
                  )}
                </Button>
                {currentTask && (
                  <span className="text-xs text-muted-foreground">
                    Task: <code className="font-mono">{currentTask.id.slice(0, 8)}</code>
                  </span>
                )}
              </div>

              {/* Live progress */}
              {isRunningAudit && currentTask && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{currentTask.progress_message ?? "Starting…"}</span>
                    <span>{currentTask.pages_crawled ?? 0} pages crawled</span>
                  </div>
                  <Progress value={progressPct} className="h-2" />
                  <div className="flex gap-1 flex-wrap">
                    {PROGRESS_STEPS.map((step, i) => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i < progressStep ? "bg-primary" :
                        i === progressStep ? "bg-primary/60 animate-pulse" : "bg-muted"
                      }`} />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audit results */}
          {auditResult && (
            <div className="space-y-4">
              {/* Score header */}
              <Card>
                <CardContent className="pt-6">
                  <ScoreHeader
                    score={auditResult.seo_score}
                    label="Overall SEO Health"
                    subtitle={`${auditResult.pages_crawled} pages crawled`}
                    breakdown={auditResult.score_breakdown}
                  />
                  {auditResult.executive_summary && (
                    <p className="mt-4 text-sm text-muted-foreground leading-relaxed border-t pt-4">
                      {auditResult.executive_summary}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Issues */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Issues Found</CardTitle></CardHeader>
                <CardContent>
                  <SeverityIssueList
                    errors={auditResult.errors ?? []}
                    warnings={auditResult.warnings ?? []}
                    notices={auditResult.notices ?? []}
                  />
                </CardContent>
              </Card>

              {/* Insights */}
              <Card>
                <CardHeader><CardTitle className="text-base">Insights</CardTitle></CardHeader>
                <CardContent>
                  <InsightColumns
                    workingWell={auditResult.working_well ?? []}
                    quickWins={auditResult.quick_wins ?? []}
                    recommendations={auditResult.keyword_cannibalisation_risks?.length
                      ? auditResult.keyword_cannibalisation_risks
                      : auditResult.local_seo_gaps}
                  />
                </CardContent>
              </Card>

              {/* Keywords */}
              {auditResult.recommended_keywords?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" />Recommended Keywords</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {auditResult.recommended_keywords.map((kw, i) => (
                        <Badge key={i} variant="outline" className="text-sm">{kw}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Action plan */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Action Plan</CardTitle></CardHeader>
                <CardContent>
                  <ActionPriorityList actions={auditResult.action_priority_list ?? []} />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Audit history */}
          {auditHistory.length > 0 && !auditResult && (
            <Card>
              <CardHeader><CardTitle className="text-base">Previous Audits</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {auditHistory.map(t => (
                    <div key={t.id} className="flex items-center justify-between p-2 rounded border text-sm">
                      <div>
                        <span className="font-mono text-xs text-muted-foreground">{t.id.slice(0, 8)}</span>
                        <span className="ml-2 text-muted-foreground">{format(new Date(t.created_at), "MMM d, h:mm a")}</span>
                        {t.pages_crawled ? <span className="ml-2 text-xs">· {t.pages_crawled} pages</span> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {t.result && (t.result as FullAuditResult).score_breakdown && (
                          <Badge variant="outline">{(t.result as FullAuditResult).seo_score}/100</Badge>
                        )}
                        <Badge variant={t.status === "completed" ? "outline" : "destructive"} className={t.status === "completed" ? "border-green-300 text-green-700" : ""}>
                          {t.status}
                        </Badge>
                        {t.status === "completed" && t.result && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => setAuditResult(t.result as FullAuditResult)}>
                            View
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Single page analysis tab (original content) ─────────────────── */}
        <TabsContent value="page" className="space-y-4 mt-4">

      {/* New Analysis Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Analyze New Page
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Page URL</Label>
              <Input
                placeholder="https://example.com/page"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Target Keywords (comma-separated)</Label>
              <Input
                placeholder="seo, marketing, local business"
                value={targetKeywords}
                onChange={(e) => setTargetKeywords(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={runAnalysis} disabled={isAnalyzing} className="w-full">
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Run Analysis
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analyses List */}
      {analyses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No pages analyzed yet. Enter a URL above to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {analyses.map((analysis) => (
            <Card key={analysis.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate max-w-md">
                        {analysis.page_title || analysis.url}
                      </h3>
                      <a 
                        href={analysis.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                    <p className="text-sm text-muted-foreground truncate max-w-lg">{analysis.url}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Analyzed {format(new Date(analysis.analyzed_at), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>

                  {/* Score Cards */}
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${getScoreColor(analysis.overall_score)}`}>
                        {analysis.overall_score ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">Overall</div>
                    </div>
                    <div className="flex gap-2">
                      <div className="text-center px-2">
                        <div className={`text-lg font-semibold ${getScoreColor(analysis.technical_score)}`}>
                          {analysis.technical_score ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">Technical</div>
                      </div>
                      <div className="text-center px-2">
                        <div className={`text-lg font-semibold ${getScoreColor(analysis.readability_score)}`}>
                          {analysis.readability_score ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">Readability</div>
                      </div>
                      <div className="text-center px-2">
                        <div className={`text-lg font-semibold ${getScoreColor(analysis.keyword_score)}`}>
                          {analysis.keyword_score ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">Keywords</div>
                      </div>
                      <div className="text-center px-2">
                        <div className={`text-lg font-semibold ${getScoreColor(analysis.backlink_potential)}`}>
                          {analysis.backlink_potential ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">Backlink</div>
                      </div>
                    </div>

                    {/* Issues Count + badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {(analysis.technical_issues?.length || 0) > 0 && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {analysis.technical_issues?.length} Issues
                        </Badge>
                      )}
                      {analysis.mobile_friendly && (
                        <Badge variant="outline" className="text-green-600 border-green-300">
                          <Smartphone className="h-3 w-3 mr-1" />
                          Mobile OK
                        </Badge>
                      )}
                      {analysis.load_time_ms !== null && (
                        <Badge variant="outline" className="text-blue-600 border-blue-300">
                          <Gauge className="h-3 w-3 mr-1" />
                          {(analysis.load_time_ms / 1000).toFixed(1)}s TTI
                        </Badge>
                      )}
                    </div>

                    <Button variant="outline" onClick={() => openDetails(analysis)}>
                      View Details
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              SEO Analysis: {selectedAnalysis?.page_title || selectedAnalysis?.url}
            </DialogTitle>
          </DialogHeader>

          {selectedAnalysis && (
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="grid grid-cols-6 w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="pagespeed">PageSpeed</TabsTrigger>
                <TabsTrigger value="technical">Technical</TabsTrigger>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="keywords">Keywords</TabsTrigger>
                <TabsTrigger value="ai">AI Fixes</TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[60vh] mt-4">
                <TabsContent value="overview" className="space-y-4">
                  {/* Score Overview */}
                  <div className="grid grid-cols-5 gap-4">
                    {[
                      { label: "Overall", score: selectedAnalysis.overall_score, icon: Gauge },
                      { label: "Technical", score: selectedAnalysis.technical_score, icon: FileText },
                      { label: "Readability", score: selectedAnalysis.readability_score, icon: Type },
                      { label: "Keywords", score: selectedAnalysis.keyword_score, icon: Target },
                      { label: "Backlink", score: selectedAnalysis.backlink_potential, icon: Link2 },
                    ].map(({ label, score, icon: Icon }) => (
                      <Card key={label}>
                        <CardContent className="pt-4 text-center">
                          <Icon className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                          <div className={`text-3xl font-bold ${getScoreColor(score)}`}>
                            {score ?? "—"}
                          </div>
                          <div className="text-sm text-muted-foreground">{label}</div>
                          <Progress 
                            value={score ?? 0} 
                            className="mt-2 h-2"
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Quick Stats */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Page Statistics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-semibold">{selectedAnalysis.word_count || 0}</div>
                            <div className="text-xs text-muted-foreground">Words</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Image className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-semibold">{selectedAnalysis.image_count || 0}</div>
                            <div className="text-xs text-muted-foreground">Images</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link2 className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-semibold">{selectedAnalysis.internal_links || 0}</div>
                            <div className="text-xs text-muted-foreground">Internal Links</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ExternalLink className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-semibold">{selectedAnalysis.external_links || 0}</div>
                            <div className="text-xs text-muted-foreground">External Links</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="pagespeed" className="space-y-4">
                  {selectedAnalysis.load_time_ms !== null ? (
                    <>
                      {/* Core Web Vitals pulled from technical_issues that came from PageSpeed */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Gauge className="h-5 w-5 text-primary" />
                            Core Web Vitals
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="border rounded-lg p-4">
                              <div className="text-xs text-muted-foreground mb-1">Time to Interactive (TTI)</div>
                              <div className={`text-2xl font-bold ${selectedAnalysis.load_time_ms < 3800 ? "text-green-600" : selectedAnalysis.load_time_ms < 7300 ? "text-yellow-600" : "text-red-600"}`}>
                                {(selectedAnalysis.load_time_ms / 1000).toFixed(2)}s
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">Target: &lt;3.8s</div>
                            </div>
                            <div className="border rounded-lg p-4">
                              <div className="text-xs text-muted-foreground mb-1">Mobile Friendly</div>
                              <div className={`text-2xl font-bold ${selectedAnalysis.mobile_friendly ? "text-green-600" : "text-red-600"}`}>
                                {selectedAnalysis.mobile_friendly ? "Yes" : "No"}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">Based on PageSpeed mobile score</div>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mt-4">
                            Full LCP, CLS, FCP, and TBT values are surfaced as issues in the Technical tab below.
                          </p>
                        </CardContent>
                      </Card>

                      {/* PageSpeed issues from technical_issues */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">PageSpeed Issues</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {(() => {
                            const psIssues = asArray(selectedAnalysis.technical_issues).filter(
                              (i: any) =>
                                i.issue?.toLowerCase().includes("lcp") ||
                                i.issue?.toLowerCase().includes("cls") ||
                                i.issue?.toLowerCase().includes("blocking") ||
                                i.issue?.toLowerCase().includes("performance") ||
                                i.issue?.toLowerCase().includes("mobile performance")
                            );
                            return psIssues.length > 0 ? (
                              <div className="space-y-3">
                                {psIssues.map((issue: any, i: number) => (
                                  <div key={i} className="flex items-start gap-3 border rounded-lg p-3">
                                    {getSeverityBadge(issue.severity)}
                                    <div>
                                      <p className="font-medium text-sm">{issue.issue}</p>
                                      <p className="text-xs text-muted-foreground mt-1">{issue.fix}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle className="h-5 w-5" />
                                No PageSpeed issues detected!
                              </div>
                            );
                          })()}
                        </CardContent>
                      </Card>
                    </>
                  ) : (
                    <Card>
                      <CardContent className="py-12 text-center text-muted-foreground">
                        <Gauge className="h-10 w-10 mx-auto mb-3 opacity-40" />
                        <p className="font-medium">PageSpeed data not available</p>
                        <p className="text-sm mt-1">Re-run the analysis to fetch Core Web Vitals from Google PageSpeed Insights.</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="technical" className="space-y-4">
                  {/* Meta Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Meta Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label className="text-muted-foreground">Title Tag</Label>
                        <p className="font-medium">{selectedAnalysis.meta_title || "Not set"}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedAnalysis.meta_title?.length || 0)} characters
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Meta Description</Label>
                        <p className="font-medium">{selectedAnalysis.meta_description || "Not set"}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedAnalysis.meta_description?.length || 0)} characters
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">H1 Tags</Label>
                        {selectedAnalysis.h1_tags?.length > 0 ? (
                          <ul className="list-disc list-inside">
                            {selectedAnalysis.h1_tags.map((h1, i) => (
                              <li key={i} className="font-medium">{h1}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-yellow-600">No H1 tag found</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Technical Issues */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        Technical Issues ({selectedAnalysis.technical_issues?.length || 0})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedAnalysis.technical_issues?.length > 0 ? (
                        <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Issue</TableHead>
                              <TableHead>Severity</TableHead>
                              <TableHead>Fix</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedAnalysis.technical_issues.map((issue: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{issue.issue}</TableCell>
                                <TableCell>{getSeverityBadge(issue.severity)}</TableCell>
                                <TableCell className="text-muted-foreground">{issue.fix}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <div className="mt-4 space-y-2">
                          <p className="text-sm font-semibold text-muted-foreground">Get AI to fix these:</p>
                          {selectedAnalysis.technical_issues.map((issue: any, i: number) => (
                            <AiFixCard
                              key={`fix-tech-${i}`}
                              clientAccountId={selectedAnalysis.client_account_id}
                              source="seo"
                              sourceReferenceId={`${selectedAnalysis.id}:tech:${i}`}
                              issueTitle={issue.issue}
                              issueSummary={issue.fix}
                              severity={issue.severity === "high" ? "high" : issue.severity === "low" ? "low" : "medium"}
                              context={{ url: selectedAnalysis.url, page_title: selectedAnalysis.page_title, meta_title: selectedAnalysis.meta_title, meta_description: selectedAnalysis.meta_description }}
                              compact
                            />
                          ))}
                        </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="h-5 w-5" />
                          No technical issues found!
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="content" className="space-y-4">
                  {/* Readability Issues */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Readability Analysis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedAnalysis.readability_issues?.length > 0 ? (
                        <div className="space-y-3">
                          {selectedAnalysis.readability_issues.map((issue: any, i: number) => (
                            <AiFixCard
                              key={i}
                              clientAccountId={selectedAnalysis.client_account_id}
                              source="seo"
                              sourceReferenceId={`${selectedAnalysis.id}:read:${i}`}
                              issueTitle={issue.issue}
                              issueSummary={issue.fix || issue.suggestion}
                              severity={issue.severity === "high" ? "high" : issue.severity === "low" ? "low" : "medium"}
                              context={{ url: selectedAnalysis.url, word_count: selectedAnalysis.word_count, readability_score: selectedAnalysis.readability_score }}
                              compact
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="h-5 w-5" />
                          Content is readable!
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Image Analysis */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Image Analysis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-2xl font-bold">{selectedAnalysis.image_count || 0}</div>
                          <div className="text-muted-foreground">Total Images</div>
                        </div>
                        <div>
                          <div className={`text-2xl font-bold ${(selectedAnalysis.images_missing_alt || 0) > 0 ? "text-red-600" : "text-green-600"}`}>
                            {selectedAnalysis.images_missing_alt || 0}
                          </div>
                          <div className="text-muted-foreground">Missing Alt Text</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="keywords" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Keyword Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedAnalysis.keywords_found?.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Keyword</TableHead>
                              <TableHead>Count</TableHead>
                              <TableHead>In Title</TableHead>
                              <TableHead>In H1</TableHead>
                              <TableHead>In Meta</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedAnalysis.keywords_found.map((kw: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{kw.keyword}</TableCell>
                                <TableCell>{kw.count}</TableCell>
                                <TableCell>
                                  {kw.inTitle ? (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {kw.inH1 ? (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {kw.inMeta ? (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-muted-foreground">No target keywords specified during analysis.</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="ai" className="space-y-4">
                  {/* AI Suggestions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-yellow-500" />
                        AI Suggestions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedAnalysis.suggestions?.length > 0 ? (
                        <div className="space-y-3">
                          {selectedAnalysis.suggestions.map((sug: any, i: number) => (
                            <AiFixCard
                              key={i}
                              clientAccountId={selectedAnalysis.client_account_id}
                              source="seo"
                              sourceReferenceId={`${selectedAnalysis.id}:sug:${i}`}
                              issueTitle={sug.suggestion}
                              issueSummary={sug.type}
                              severity={sug.priority === "high" ? "high" : sug.priority === "low" ? "low" : "medium"}
                              context={{ url: selectedAnalysis.url, suggestion_type: sug.type, meta_title: selectedAnalysis.meta_title, meta_description: selectedAnalysis.meta_description }}
                              compact
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No AI suggestions available.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* AI Rewrites */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-purple-500" />
                        AI-Generated Rewrites
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedAnalysis.ai_rewrites?.length > 0 ? (
                        <div className="space-y-4">
                          {selectedAnalysis.ai_rewrites.map((rewrite: any, i: number) => (
                            <div key={i} className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <Badge variant="outline">{rewrite.type}</Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(rewrite.rewritten)}
                                >
                                  <Copy className="h-4 w-4 mr-1" />
                                  Copy
                                </Button>
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Original</Label>
                                  <p className="text-sm text-muted-foreground line-through">
                                    {rewrite.original || "Not set"}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-xs text-green-600">AI Suggestion</Label>
                                  <p className="text-sm font-medium text-green-700">
                                    {rewrite.rewritten}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No AI rewrites available.</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
