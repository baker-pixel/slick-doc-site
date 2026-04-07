import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { callAdminApi } from "@/lib/admin-api";
import { friendlyEdgeMessage } from "@/lib/edge-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Clock, CheckCircle2, AlertCircle, XCircle, Building2, Calendar } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ClientRequest {
  id: string;
  client_account_id: string;
  title: string;
  description: string | null;
  request_type: string;
  priority: string;
  status: string;
  admin_notes: string | null;
  assigned_to: string | null;
  due_date: string | null;
  created_at: string;
  client_accounts?: { business_name: string };
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", icon: Clock, variant: "secondary" },
  in_progress: { label: "In Progress", icon: AlertCircle, variant: "default" },
  completed: { label: "Completed", icon: CheckCircle2, variant: "outline" },
  cancelled: { label: "Cancelled", icon: XCircle, variant: "destructive" },
};

const REQUEST_TYPES: Record<string, string> = {
  general: "General Request",
  content: "Content Update",
  design: "Design Change",
  bug: "Bug Report",
  feature: "New Feature",
  urgent: "Urgent Issue",
};

export default function ClientRequestsAdminPanel({ clientId }: { clientId?: string } = {}) {
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ClientRequest | null>(null);
  const [updating, setUpdating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editData, setEditData] = useState({
    status: "",
    admin_notes: "",
    assigned_to: "",
    due_date: "",
  });

  useEffect(() => {
    fetchRequests();

    const channel = supabase
      .channel("admin-requests-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_requests",
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await callAdminApi(adminPassword, {
        action: "get_requests",
      });

      if (error) throw new Error(error);
      
      setRequests((data as any)?.data || []);
    } catch (error: any) {
      console.error("Error fetching requests:", error);
      toast({ title: "Error loading requests", description: friendlyEdgeMessage(error.message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (request: ClientRequest) => {
    setSelectedRequest(request);
    setEditData({
      status: request.status,
      admin_notes: request.admin_notes || "",
      assigned_to: request.assigned_to || "",
      due_date: request.due_date || "",
    });
  };

  const handleUpdate = async () => {
    if (!selectedRequest) return;

    setUpdating(true);
    try {
      const { data, error } = await callAdminApi(adminPassword, {
        action: "update_request",
        id: selectedRequest.id,
        data: {
          status: editData.status,
          admin_notes: editData.admin_notes || null,
          assigned_to: editData.assigned_to || null,
          due_date: editData.due_date || null,
          completed_at: editData.status === "completed" ? new Date().toISOString() : null,
        },
      });

      if (error) throw new Error(error);

      toast({
        title: "Request Updated",
        description: "The request has been updated successfully.",
      });

      setSelectedRequest(null);
      fetchRequests();
    } catch (error: any) {
      console.error("Error updating request:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update request.",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const filteredRequests = requests.filter((r) => {
    const matchesStatus = filterStatus === "all" || r.status === filterStatus;
    const matchesClient = !clientId || r.client_account_id === clientId;
    return matchesStatus && matchesClient;
  });

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const inProgressCount = requests.filter((r) => r.status === "in_progress").length;

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
        <div>
          <h2 className="text-2xl font-semibold">Client Requests</h2>
          <p className="text-muted-foreground">
            {pendingCount} pending, {inProgressCount} in progress
          </p>
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Requests</SelectItem>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredRequests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No requests found</h3>
            <p className="text-muted-foreground text-center">
              {filterStatus === "all" ? "No client requests yet" : `No ${filterStatus} requests`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => {
            const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusConfig.icon;

            return (
              <Card key={request.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEditDialog(request)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{request.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Building2 className="h-3 w-3" />
                        {request.client_accounts?.business_name || "Unknown Client"}
                        <span className="text-muted-foreground">•</span>
                        {format(new Date(request.created_at), "MMM d, yyyy")}
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
                    <p className="text-sm text-muted-foreground line-clamp-2">{request.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {REQUEST_TYPES[request.request_type] || request.request_type}
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
                      {request.priority.charAt(0).toUpperCase() + request.priority.slice(1)} Priority
                    </Badge>
                    {request.assigned_to && (
                      <Badge variant="secondary">Assigned: {request.assigned_to}</Badge>
                    )}
                    {request.due_date && (
                      <Badge variant="outline">
                        <Calendar className="h-3 w-3 mr-1" />
                        Due: {format(new Date(request.due_date), "MMM d")}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Update Request</DialogTitle>
            <DialogDescription>
              {selectedRequest?.title}
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4 mt-4">
              {selectedRequest.description && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Client's Request:</p>
                  <p className="text-sm">{selectedRequest.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={editData.status}
                    onValueChange={(value) => setEditData({ ...editData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Due Date</label>
                  <Input
                    type="date"
                    value={editData.due_date}
                    onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Assigned To</label>
                <Input
                  placeholder="Team member name"
                  value={editData.assigned_to}
                  onChange={(e) => setEditData({ ...editData, assigned_to: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes for Client</label>
                <Textarea
                  placeholder="Add notes that the client can see..."
                  value={editData.admin_notes}
                  onChange={(e) => setEditData({ ...editData, admin_notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setSelectedRequest(null)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdate} disabled={updating}>
                  {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}