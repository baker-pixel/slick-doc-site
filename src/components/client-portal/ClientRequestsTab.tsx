import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, FileText, Clock, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ClientRequest {
  id: string;
  title: string;
  description: string | null;
  request_type: string;
  priority: string;
  status: string;
  admin_notes: string | null;
  due_date: string | null;
  created_at: string;
}

const REQUEST_TYPES = [
  { value: "general", label: "General Request" },
  { value: "content", label: "Content Update" },
  { value: "design", label: "Design Change" },
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "New Feature" },
  { value: "urgent", label: "Urgent Issue" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", icon: Clock, variant: "secondary" },
  in_progress: { label: "In Progress", icon: AlertCircle, variant: "default" },
  completed: { label: "Completed", icon: CheckCircle2, variant: "outline" },
  cancelled: { label: "Cancelled", icon: XCircle, variant: "destructive" },
};

interface ClientRequestsTabProps {
  clientAccountId: string;
}

export default function ClientRequestsTab({ clientAccountId }: ClientRequestsTabProps) {
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    request_type: "general",
    priority: "normal",
  });

  useEffect(() => {
    fetchRequests();

    const channel = supabase
      .channel("client-requests-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_requests",
          filter: `client_account_id=eq.${clientAccountId}`,
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientAccountId]);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("client_requests")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("client_requests").insert({
        client_account_id: clientAccountId,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        request_type: formData.request_type,
        priority: formData.priority,
      });

      if (error) throw error;

      toast({
        title: "Request Submitted",
        description: "Your request has been submitted successfully.",
      });

      setFormData({ title: "", description: "", request_type: "general", priority: "normal" });
      setDialogOpen(false);
    } catch (error) {
      console.error("Error submitting request:", error);
      toast({
        title: "Error",
        description: "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Formal requests are tracked with a status and priority, separate from the chat.
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Submit New Request</DialogTitle>
              <DialogDescription>
                Describe your request and we'll get back to you as soon as possible.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  placeholder="Brief summary of your request"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <Select
                    value={formData.request_type}
                    onValueChange={(value) => setFormData({ ...formData, request_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REQUEST_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority</label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  placeholder="Provide details about your request..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || !formData.title.trim()}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Submit Request
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No requests yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Submit your first request to get started
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusConfig.icon;

            return (
              <Card key={request.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{request.title}</CardTitle>
                      <CardDescription>
                        Submitted {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
                      </CardDescription>
                    </div>
                    <Badge variant={statusConfig.variant} className="shrink-0">
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusConfig.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {request.description && (
                    <p className="text-sm text-muted-foreground">{request.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {REQUEST_TYPES.find((t) => t.value === request.request_type)?.label || request.request_type}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        request.priority === "urgent"
                          ? "border-destructive text-destructive"
                          : request.priority === "high"
                          ? "border-orange-500 text-orange-500"
                          : ""
                      }
                    >
                      {PRIORITIES.find((p) => p.value === request.priority)?.label || request.priority} Priority
                    </Badge>
                    {request.due_date && (
                      <Badge variant="outline">
                        Due: {format(new Date(request.due_date), "MMM d, yyyy")}
                      </Badge>
                    )}
                  </div>
                  {request.admin_notes && (
                    <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Agency Response:</p>
                      <p className="text-sm">{request.admin_notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}