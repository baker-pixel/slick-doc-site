import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { 
  Shield, 
  Link2, 
  Type, 
  FileText, 
  Smartphone, 
  Accessibility, 
  Zap,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wand2,
  Download
} from "lucide-react";
import { AiFixCard } from "@/components/admin/shared/AiFixCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface QAReport {
  id: string;
  client_account_id: string;
  url: string;
  page_title: string | null;
  broken_links: Array<{ url: string; statusCode: number }>;
  spelling_errors: Array<{ word: string; suggestions: string[]; context: string }>;
  missing_metadata: Array<{ type: string; description: string }>;
  mobile_issues: Array<{ issue: string; element: string }>;
  accessibility_issues: Array<{ issue: string; wcag: string; severity: string }>;
  load_time_ms: number | null;
  overall_score: number | null;
  auto_fixes_applied: Array<{ fix: string; applied_at: string }>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  created_at: string;
}

const issueCategories = [
  { key: 'broken_links', label: 'Broken Links', icon: Link2, color: 'text-red-500' },
  { key: 'spelling_errors', label: 'Spelling/Grammar', icon: Type, color: 'text-yellow-500' },
  { key: 'missing_metadata', label: 'Missing Metadata', icon: FileText, color: 'text-orange-500' },
  { key: 'mobile_issues', label: 'Mobile Layout', icon: Smartphone, color: 'text-blue-500' },
  { key: 'accessibility_issues', label: 'Accessibility', icon: Accessibility, color: 'text-purple-500' },
];

export default function QualityAssurancePanel() {
  const { adminPassword } = useAdminAuth();
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [urlToScan, setUrlToScan] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ['clients-for-qa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_accounts')
        .select('id, business_name')
        .eq('status', 'active')
        .order('business_name');
      if (error) throw error;
      return data;
    }
  });

  const { data: reports, isLoading } = useQuery({
    queryKey: ['qa-reports', selectedClient],
    queryFn: async () => {
      if (!selectedClient) return [];
      const { data, error } = await supabase
        .from('qa_reports' as any)
        .select('*')
        .eq('client_account_id', selectedClient)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as QAReport[];
    },
    enabled: !!selectedClient
  });

  const runScanMutation = useMutation({
    mutationFn: async (url: string) => {
      setIsScanning(true);
      const { data, error } = await supabase.functions.invoke('run-qa-scan', {
        body: { clientId: selectedClient, url, password: adminPassword }
      });
      if (error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Scan failed");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-reports'] });
      toast.success('QA scan completed');
      setUrlToScan("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      setIsScanning(false);
    }
  });

  const applyFixMutation = useMutation({
    mutationFn: async ({ reportId, fixType }: { reportId: string; fixType: string }) => {
      const { data, error } = await supabase.functions.invoke('apply-qa-fix', {
        body: { reportId, fixType, password: adminPassword }
      });
      if (error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to apply fix");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-reports'] });
      toast.success('Fix applied successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    if (score >= 50) return 'text-orange-500';
    return 'text-red-500';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500/10 text-blue-500"><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Scanning</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/10 text-red-500"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const getTotalIssues = (report: QAReport) => {
    return (
      (report.broken_links?.length || 0) +
      (report.spelling_errors?.length || 0) +
      (report.missing_metadata?.length || 0) +
      (report.mobile_issues?.length || 0) +
      (report.accessibility_issues?.length || 0)
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AI Quality Assurance</h2>
          <p className="text-muted-foreground">
            Automatically check web pages for issues and apply AI-powered fixes
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Run QA Scan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>URL to Scan</Label>
              <Input
                placeholder="https://example.com/page"
                value={urlToScan}
                onChange={(e) => setUrlToScan(e.target.value)}
                disabled={!selectedClient}
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={() => runScanMutation.mutate(urlToScan)}
                disabled={!selectedClient || !urlToScan || isScanning}
                className="w-full"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Run Scan
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedClient && (
        <Card>
          <CardHeader>
            <CardTitle>QA Reports</CardTitle>
            <CardDescription>
              Review scan results and apply automated fixes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading reports...</p>
            ) : reports?.length === 0 ? (
              <p className="text-muted-foreground">No QA reports yet. Run a scan above to get started.</p>
            ) : (
              <div className="space-y-4">
                {reports?.map(report => (
                  <Card key={report.id} className="border-l-4" style={{ 
                    borderLeftColor: report.overall_score && report.overall_score >= 90 ? '#22c55e' : 
                                     report.overall_score && report.overall_score >= 70 ? '#eab308' : '#ef4444'
                  }}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{report.page_title || report.url}</CardTitle>
                          <p className="text-sm text-muted-foreground truncate max-w-md">{report.url}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          {report.overall_score !== null && (
                            <div className="text-center">
                              <p className={`text-2xl font-bold ${getScoreColor(report.overall_score)}`}>
                                {report.overall_score}
                              </p>
                              <p className="text-xs text-muted-foreground">Score</p>
                            </div>
                          )}
                          {getStatusBadge(report.status)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {report.status === 'completed' && (
                        <>
                          <div className="grid grid-cols-5 gap-2 mb-4">
                            {issueCategories.map(cat => {
                              const issues = report[cat.key as keyof QAReport] as any[] || [];
                              return (
                                <div key={cat.key} className="text-center p-2 bg-muted rounded-lg">
                                  <cat.icon className={`h-4 w-4 mx-auto mb-1 ${issues.length > 0 ? cat.color : 'text-green-500'}`} />
                                  <p className="text-lg font-semibold">{issues.length}</p>
                                  <p className="text-xs text-muted-foreground">{cat.label}</p>
                                </div>
                              );
                            })}
                          </div>

                          {report.load_time_ms && (
                            <div className="flex items-center gap-2 mb-4 p-2 bg-muted rounded-lg">
                              <Zap className={`h-4 w-4 ${report.load_time_ms < 3000 ? 'text-green-500' : 'text-yellow-500'}`} />
                              <span className="text-sm">Load Time: {(report.load_time_ms / 1000).toFixed(2)}s</span>
                            </div>
                          )}

                          <Accordion type="single" collapsible className="w-full">
                            {issueCategories.map(cat => {
                              const issues = report[cat.key as keyof QAReport] as any[] || [];
                              if (issues.length === 0) return null;
                              
                              return (
                                <AccordionItem key={cat.key} value={cat.key}>
                                  <AccordionTrigger className="hover:no-underline">
                                    <div className="flex items-center gap-2">
                                      <cat.icon className={`h-4 w-4 ${cat.color}`} />
                                      <span>{cat.label}</span>
                                      <Badge variant="outline" className="ml-2">{issues.length}</Badge>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent>
                                    <div className="space-y-2">
                                      {issues.slice(0, 5).map((issue, idx) => (
                                        <div key={idx} className="space-y-2">
                                        <div className="flex items-start justify-between p-2 bg-muted/50 rounded text-sm">
                                          <div className="flex-1">
                                            {cat.key === 'broken_links' && (
                                              <>
                                                <p className="font-mono text-xs text-red-500">{issue.url}</p>
                                                <p className="text-muted-foreground">Status: {issue.statusCode}</p>
                                              </>
                                            )}
                                            {cat.key === 'spelling_errors' && (
                                              <>
                                                <p><span className="text-red-500 line-through">{issue.word}</span></p>
                                                <p className="text-muted-foreground">Suggestions: {issue.suggestions?.join(', ')}</p>
                                              </>
                                            )}
                                            {cat.key === 'missing_metadata' && (
                                              <>
                                                <p className="font-medium">{issue.type}</p>
                                                <p className="text-muted-foreground">{issue.description}</p>
                                              </>
                                            )}
                                            {cat.key === 'mobile_issues' && (
                                              <>
                                                <p>{issue.issue}</p>
                                                <p className="text-muted-foreground font-mono text-xs">{issue.element}</p>
                                              </>
                                            )}
                                            {cat.key === 'accessibility_issues' && (
                                              <>
                                                <p>{issue.issue}</p>
                                                <Badge variant="outline" className="mt-1">{issue.wcag}</Badge>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                          <AiFixCard
                                            clientAccountId={report.client_account_id}
                                            source="qa"
                                            sourceReferenceId={`${report.id}:${cat.key}:${idx}`}
                                            issueTitle={
                                              cat.key === 'broken_links' ? `Broken link: ${issue.url}` :
                                              cat.key === 'spelling_errors' ? `Spelling: ${issue.word}` :
                                              cat.key === 'missing_metadata' ? `Missing metadata: ${issue.type}` :
                                              issue.issue
                                            }
                                            issueSummary={
                                              cat.key === 'spelling_errors' ? `Suggestions: ${issue.suggestions?.join(', ')}` :
                                              cat.key === 'missing_metadata' ? issue.description :
                                              cat.key === 'accessibility_issues' ? `WCAG: ${issue.wcag}` :
                                              cat.key === 'mobile_issues' ? issue.element :
                                              `Status: ${issue.statusCode}`
                                            }
                                            severity={issue.severity === 'high' ? 'high' : 'medium'}
                                            context={{ url: report.url, page_title: report.page_title, category: cat.label }}
                                            compact
                                          />
                                        </div>
                                      ))}
                                      {issues.length > 5 && (
                                        <p className="text-muted-foreground text-sm">+ {issues.length - 5} more issues</p>
                                      )}
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              );
                            })}
                          </Accordion>

                          {report.auto_fixes_applied && report.auto_fixes_applied.length > 0 && (
                            <div className="mt-4 p-3 bg-green-500/10 rounded-lg">
                              <p className="text-sm font-medium text-green-500 flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4" />
                                {report.auto_fixes_applied.length} fixes applied automatically
                              </p>
                            </div>
                          )}
                        </>
                      )}

                      <div className="flex gap-2 mt-4">
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          Export Report
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => runScanMutation.mutate(report.url)}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Re-scan
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
