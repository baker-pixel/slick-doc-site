import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Search, 
  RefreshCw, 
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
  Smartphone
} from "lucide-react";
import { format } from "date-fns";
import { AiFixCard } from "@/components/admin/shared/AiFixCard";

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
  analyzed_at: string;
}

// Helper to safely cast JSON to array
const asArray = (val: unknown): any[] => Array.isArray(val) ? val : [];

interface Client {
  id: string;
  business_name: string;
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

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetchAnalyses();
    }
  }, [selectedClient]);

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

      toast.success("SEO analysis complete!");
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            Real-Time SEO Dashboard
          </h2>
          <p className="text-muted-foreground">Analyze pages, find issues, get AI-powered fixes</p>
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

                    {/* Issues Count */}
                    <div className="flex items-center gap-2">
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
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
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
    </div>
  );
}
