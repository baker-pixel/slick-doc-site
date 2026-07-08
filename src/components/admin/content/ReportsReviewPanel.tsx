import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Eye, Calendar, TrendingUp, Lightbulb, Target, Download, Trash2, Send, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Json } from "@/integrations/supabase/types";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface ClientReport {
  id: string;
  client_id: string;
  report_type: string;
  report_period_start: string;
  report_period_end: string;
  metrics: Json | null;
  insights: Json | null;
  recommendations: Json | null;
  created_at: string;
  client_accounts?: {
    business_name: string;
    email: string;
    first_name: string | null;
  };
}

interface ClientAccount {
  id: string;
  business_name: string;
}

export const ReportsReviewPanel = () => {
  const { adminPassword } = useAdminAuth();
  const [reports, setReports] = useState<ClientReport[]>([]);
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [previewReport, setPreviewReport] = useState<ClientReport | null>(null);
  const [sendingReport, setSendingReport] = useState<ClientReport | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [reportsRes, clientsRes] = await Promise.all([
      supabase
        .from("client_reports")
        .select("*, client_accounts(business_name, email, first_name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("client_accounts")
        .select("id, business_name")
        .order("business_name"),
    ]);

    if (reportsRes.data) setReports(reportsRes.data as ClientReport[]);
    if (clientsRes.data) setClients(clientsRes.data);
    setLoading(false);
  };

  const formatReportType = (type: string) => {
    return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const getReportTypeColor = (type: string) => {
    switch (type) {
      case "monthly":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "quarterly":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "annual":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handleDelete = async (reportId: string) => {
    const { error } = await supabase
      .from("client_reports")
      .delete()
      .eq("id", reportId);

    if (error) {
      toast({ title: "Error", description: "Failed to delete report", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Report has been deleted" });
      fetchData();
    }
  };

  const handleSendToClient = async () => {
    if (!sendingReport || !sendingReport.client_accounts?.email) return;

    setIsSending(true);

    try {
      const { error } = await supabase.functions.invoke("send-report-to-client", {
        body: {
          reportId: sendingReport.id,
          clientEmail: sendingReport.client_accounts.email,
          clientName: sendingReport.client_accounts.first_name || sendingReport.client_accounts.business_name,
          businessName: sendingReport.client_accounts.business_name,
          reportType: formatReportType(sendingReport.report_type),
          periodStart: sendingReport.report_period_start,
          periodEnd: sendingReport.report_period_end,
          metrics: sendingReport.metrics,
          insights: sendingReport.insights,
          recommendations: sendingReport.recommendations,
          password: adminPassword,
        },
      });

      if (error) {
        console.error("Email error:", error);
        toast({ title: "Error", description: "Failed to send report", variant: "destructive" });
      } else {
        toast({ title: "Sent", description: "Report has been sent to the client" });
        setSendingReport(null);
      }
    } catch (error: any) {
      console.error("Send error:", error);
      toast({ title: "Error", description: "Failed to send report", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const exportReportAsJson = (report: ClientReport) => {
    const exportData = {
      report_type: report.report_type,
      period: {
        start: report.report_period_start,
        end: report.report_period_end,
      },
      client: report.client_accounts?.business_name,
      metrics: report.metrics,
      insights: report.insights,
      recommendations: report.recommendations,
      generated_at: report.created_at,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report_${report.client_accounts?.business_name?.toLowerCase().replace(/\s+/g, "_")}_${report.report_period_start}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Report exported as JSON" });
  };

  const filteredReports = reports.filter((r) => {
    if (selectedClient !== "all" && r.client_id !== selectedClient) return false;
    if (selectedType !== "all" && r.report_type !== selectedType) return false;
    return true;
  });

  const reportTypes = [...new Set(reports.map((r) => r.report_type))];

  const renderJsonContent = (data: Json | null, title: string, icon: React.ReactNode) => {
    if (!data) return null;

    const priorityColor: Record<string, string> = {
      high: "text-red-500", medium: "text-amber-500", low: "text-lime-600",
    };

    let body: React.ReactNode;
    if (typeof data === "string") {
      body = <p className="text-sm whitespace-pre-wrap">{data}</p>;
    } else if (Array.isArray(data)) {
      if (data.length === 0) {
        body = <p className="text-sm text-muted-foreground">No data available</p>;
      } else if (typeof data[0] === "object" && data[0] !== null && "action" in (data[0] as object)) {
        // Recommendations: { priority, action, expected_impact }[]
        body = (
          <ul className="space-y-3">
            {(data as Array<{ priority?: string; action?: string; expected_impact?: string }>).map((rec, i) => (
              <li key={i} className="border-b border-border/50 pb-2 last:border-0">
                {rec.priority && (
                  <span className={`text-[11px] font-semibold uppercase ${priorityColor[rec.priority.toLowerCase()] ?? "text-muted-foreground"}`}>
                    {rec.priority} priority
                  </span>
                )}
                <p className="text-sm font-medium">{rec.action}</p>
                {rec.expected_impact && <p className="text-xs text-muted-foreground">Expected impact: {rec.expected_impact}</p>}
              </li>
            ))}
          </ul>
        );
      } else {
        // Insights: string[]
        body = (
          <ul className="list-disc list-inside space-y-1">
            {(data as unknown[]).map((item, i) => (
              <li key={i} className="text-sm">{String(item)}</li>
            ))}
          </ul>
        );
      }
    } else if (typeof data === "object") {
      const obj = data as Record<string, unknown>;
      // Legacy pre-fix shapes: { summary: "..." } / { content: "..." }
      if ("summary" in obj || "content" in obj) {
        body = <p className="text-sm whitespace-pre-wrap">{String(obj.summary ?? obj.content)}</p>;
      } else {
        const entries = Object.entries(obj);
        body = entries.length === 0
          ? <p className="text-sm text-muted-foreground">No data available</p>
          : (
            <div className="space-y-1">
              {entries.map(([key, value]) => (
                <div key={key} className="text-sm">
                  <span className="font-medium capitalize">{key.replace(/_/g, " ")}:</span>{" "}
                  {String(value)}
                </div>
              ))}
            </div>
          );
      }
    } else {
      body = <p className="text-sm text-muted-foreground">No data available</p>;
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </div>
        <div className="bg-muted/50 p-3 rounded-lg">
          {body}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Reports Review</h2>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.business_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {reportTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {formatReportType(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Reports Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading reports...</div>
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No reports found</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map((report) => (
            <Card key={report.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge className={getReportTypeColor(report.report_type)}>
                    {formatReportType(report.report_type)}
                  </Badge>
                </div>
                <CardTitle className="text-base leading-tight mt-2">
                  {report.client_accounts?.business_name || "Unknown Client"}
                </CardTitle>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(report.report_period_start), "MMM d")} - {format(new Date(report.report_period_end), "MMM d, yyyy")}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="flex-1 mb-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="w-3 h-3" />
                    <span>{report.metrics ? "Metrics included" : "No metrics"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Lightbulb className="w-3 h-3" />
                    <span>{report.insights ? "Insights included" : "No insights"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Target className="w-3 h-3" />
                    <span>{report.recommendations ? "Recommendations included" : "No recommendations"}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewReport(report)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setSendingReport(report)}
                  >
                    <Send className="w-3 h-3 mr-1" />
                    Send
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportReportAsJson(report)}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Export
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(report.id)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewReport} onOpenChange={() => setPreviewReport(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <Badge className={previewReport ? getReportTypeColor(previewReport.report_type) : ""}>
                {previewReport && formatReportType(previewReport.report_type)}
              </Badge>
            </div>
            <DialogTitle>{previewReport?.client_accounts?.business_name} Report</DialogTitle>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              {previewReport && (
                <>
                  {format(new Date(previewReport.report_period_start), "MMMM d")} - {format(new Date(previewReport.report_period_end), "MMMM d, yyyy")}
                </>
              )}
            </div>
          </DialogHeader>
          
          <div className="mt-4 space-y-6">
            {renderJsonContent(
              previewReport?.metrics ?? null,
              "Metrics",
              <TrendingUp className="w-4 h-4 text-blue-400" />
            )}
            
            {renderJsonContent(
              previewReport?.insights ?? null,
              "Insights",
              <Lightbulb className="w-4 h-4 text-amber-400" />
            )}
            
            {renderJsonContent(
              previewReport?.recommendations ?? null,
              "Recommendations",
              <Target className="w-4 h-4 text-green-400" />
            )}
          </div>

          <DialogFooter className="mt-4 flex-wrap gap-2">
            <Button
              variant="default"
              onClick={() => {
                if (previewReport) {
                  setSendingReport(previewReport);
                  setPreviewReport(null);
                }
              }}
            >
              <Send className="w-4 h-4 mr-2" />
              Send to Client
            </Button>
            <Button
              variant="outline"
              onClick={() => previewReport && exportReportAsJson(previewReport)}
            >
              <Download className="w-4 h-4 mr-2" />
              Export JSON
            </Button>
            <Button variant="outline" onClick={() => setPreviewReport(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send to Client Dialog */}
      <Dialog open={!!sendingReport} onOpenChange={() => setSendingReport(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Report to Client</DialogTitle>
            <DialogDescription>
              Send this report summary via email to the client.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">{formatReportType(sendingReport?.report_type || "")} Report</p>
              <p className="text-sm text-muted-foreground">
                {sendingReport?.client_accounts?.business_name}
              </p>
              {sendingReport && (
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(sendingReport.report_period_start), "MMM d")} - {format(new Date(sendingReport.report_period_end), "MMM d, yyyy")}
                </p>
              )}
            </div>
            
            {sendingReport?.client_accounts?.email ? (
              <p className="text-sm text-muted-foreground">
                Will be sent to: <span className="font-medium">{sendingReport.client_accounts.email}</span>
              </p>
            ) : (
              <p className="text-sm text-destructive">
                No email address found for this client
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendingReport(null)} disabled={isSending}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendToClient} 
              disabled={isSending || !sendingReport?.client_accounts?.email}
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Report
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
