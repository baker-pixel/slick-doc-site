import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Zap, Eye, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AutomationJob {
  id: string;
  client_id: string;
  sop_id: string | null;
  job_type: string;
  status: string;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  ai_model_used: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  client_accounts?: {
    business_name: string;
    email: string;
  };
}

export function AutomationJobsPanel() {
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<AutomationJob | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("automation_jobs")
      .select(`
        *,
        client_accounts (
          business_name,
          email
        )
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      toast.error("Failed to fetch jobs");
      console.error(error);
    } else {
      setJobs((data || []) as AutomationJob[]);
    }
    setLoading(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-500";
      case "running": return "bg-blue-500";
      case "failed": return "bg-red-500";
      case "cancelled": return "bg-gray-500";
      default: return "bg-yellow-500";
    }
  };

  const getJobTypeIcon = (type: string) => {
    switch (type) {
      case "email_sequence": return "📧";
      case "content_generation": return "📝";
      case "report": return "📊";
      default: return "⚡";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Automation Jobs
        </CardTitle>
        <Button size="sm" variant="outline" onClick={fetchJobs}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No automation jobs yet. Run an automation from the Client Management panel.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{getJobTypeIcon(job.job_type)}</span>
                      <span className="capitalize">{job.job_type.replace("_", " ")}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {job.client_accounts?.business_name || "Unknown"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {job.client_accounts?.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(job.status)}>
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.started_at && job.completed_at
                      ? `${Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)}s`
                      : job.status === "running"
                      ? "Running..."
                      : "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedJob(job)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle>
                            Job Details - {job.job_type.replace("_", " ")}
                          </DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-[60vh]">
                          <div className="space-y-4 p-4">
                            <div>
                              <h4 className="font-medium mb-2">Status</h4>
                              <Badge className={getStatusColor(job.status)}>
                                {job.status}
                              </Badge>
                              {job.error_message && (
                                <p className="text-sm text-red-500 mt-2">
                                  Error: {job.error_message}
                                </p>
                              )}
                            </div>
                            
                            <div>
                              <h4 className="font-medium mb-2">Model Used</h4>
                              <p className="text-sm text-muted-foreground">
                                {job.ai_model_used || "N/A"}
                              </p>
                            </div>

                            {job.input_data && Object.keys(job.input_data).length > 0 && (
                              <div>
                                <h4 className="font-medium mb-2">Input Data</h4>
                                <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                                  {JSON.stringify(job.input_data, null, 2)}
                                </pre>
                              </div>
                            )}

                            {job.output_data && (
                              <div>
                                <h4 className="font-medium mb-2">Output</h4>
                                <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                                  {JSON.stringify(job.output_data, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
