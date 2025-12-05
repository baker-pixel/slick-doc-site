import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Eye, Calendar, TrendingUp, Lightbulb, Target, Download, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Json } from "@/integrations/supabase/types";

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
  };
}

interface ClientAccount {
  id: string;
  business_name: string;
}

export const ReportsReviewPanel = () => {
  const [reports, setReports] = useState<ClientReport[]>([]);
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [previewReport, setPreviewReport] = useState<ClientReport | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [reportsRes, clientsRes] = await Promise.all([
      supabase
        .from("client_reports")
        .select("*, client_accounts(business_name)")
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
    
    const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </div>
        <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
          {content}
        </pre>
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

          <DialogFooter className="mt-4">
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
    </div>
  );
};
