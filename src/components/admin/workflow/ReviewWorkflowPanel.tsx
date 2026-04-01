import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  CheckCircle, 
  Send, 
  Eye, 
  Clock, 
  FileText, 
  AlertCircle,
  ArrowRight,
  Loader2,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";

interface ReviewWorkflowPanelProps {
  adminPassword: string;
}

interface ReviewItem {
  id: string;
  title: string;
  type: 'task_output' | 'deliverable' | 'content';
  status: string;
  client_name: string;
  client_id: string;
  created_at: string;
  description?: string;
  output_data?: any;
}

export function ReviewWorkflowPanel({ adminPassword }: ReviewWorkflowPanelProps) {
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendToClientOpen, setSendToClientOpen] = useState(false);
  const [clientMessage, setClientMessage] = useState("");

  // Fetch completed tasks with output
  const { data: completedTasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["review-tasks", adminPassword],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("admin", {
        body: {
          action: "getClientTasks",
          password: adminPassword,
        },
      });
      return (data?.tasks || []).filter(
        (t: any) => t.status === "completed" && t.output_data
      );
    },
  });

  // Fetch pending deliverables
  const { data: pendingDeliverables, isLoading: deliverablesLoading } = useQuery({
    queryKey: ["review-deliverables", adminPassword],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("admin", {
        body: {
          action: "getDeliverables",
          password: adminPassword,
        },
      });
      return (data?.deliverables || []).filter(
        (d: any) => d.status === "pending_review" || d.status === "draft"
      );
    },
  });

  // Fetch clients for mapping
  const { data: clients } = useQuery({
    queryKey: ["clients", adminPassword],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("admin", {
        body: {
          action: "getClients",
          password: adminPassword,
        },
      });
      return data?.clients || [];
    },
  });

  const getClientName = (clientId: string) => {
    const client = clients?.find((c: any) => c.id === clientId);
    return client?.business_name || "Unknown Client";
  };

  // Combine into review items
  const reviewItems: ReviewItem[] = [
    ...(completedTasks || []).map((t: any) => ({
      id: t.id,
      title: t.name,
      type: 'task_output' as const,
      status: 'needs_review',
      client_name: getClientName(t.client_account_id),
      client_id: t.client_account_id,
      created_at: t.completed_at || t.created_at,
      description: t.description,
      output_data: t.output_data,
    })),
    ...(pendingDeliverables || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      type: 'deliverable' as const,
      status: d.status,
      client_name: getClientName(d.client_account_id),
      client_id: d.client_account_id,
      created_at: d.submitted_at || d.created_at,
      description: d.description,
      output_data: null,
    })),
  ];

  // Mark as reviewed mutation
  const markReviewedMutation = useMutation({
    mutationFn: async (item: ReviewItem) => {
      if (item.type === 'task_output') {
        await supabase.functions.invoke("admin", {
          body: {
            action: "updateClientTask",
            password: adminPassword,
            taskId: item.id,
            updates: { status: "reviewed", notes: "Reviewed and ready for client" },
          },
        });
      } else if (item.type === 'deliverable') {
        await supabase.functions.invoke("admin", {
          body: {
            action: "updateDeliverable",
            password: adminPassword,
            deliverableId: item.id,
            updates: { status: "ready_to_send" },
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Marked as reviewed");
      queryClient.invalidateQueries({ queryKey: ["review-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["review-deliverables"] });
    },
  });

  // Send to client mutation
  const sendToClientMutation = useMutation({
    mutationFn: async ({ item, message }: { item: ReviewItem; message: string }) => {
      // Create content approval record
      await supabase.functions.invoke("admin", {
        body: {
          action: "createContentApproval",
          password: adminPassword,
          approval: {
            client_account_id: item.client_id,
            title: item.title,
            content_type: item.type === 'task_output' ? 'automated_output' : 'deliverable',
            content_preview: item.description || item.title,
            full_content: item.output_data ? JSON.stringify(item.output_data, null, 2) : item.description,
            status: 'pending',
          },
        },
      });

      // Send notification to client
      await supabase.functions.invoke("admin", {
        body: {
          action: "createClientNotification",
          password: adminPassword,
          notification: {
            client_account_id: item.client_id,
            title: "New content ready for review",
            description: message || `"${item.title}" is ready for your review`,
            notification_type: "content_approval",
            priority: "high",
          },
        },
      });

      // Update original item status
      if (item.type === 'task_output') {
        await supabase.functions.invoke("admin", {
          body: {
            action: "updateClientTask",
            password: adminPassword,
            taskId: item.id,
            updates: { status: "sent_to_client" },
          },
        });
      } else if (item.type === 'deliverable') {
        await supabase.functions.invoke("admin", {
          body: {
            action: "updateDeliverable",
            password: adminPassword,
            deliverableId: item.id,
            updates: { status: "pending_review" },
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Sent to client for approval");
      setSendToClientOpen(false);
      setClientMessage("");
      queryClient.invalidateQueries({ queryKey: ["review-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["review-deliverables"] });
    },
  });

  const isLoading = tasksLoading || deliverablesLoading;

  const needsReview = reviewItems.filter(i => i.status === 'needs_review' || i.status === 'completed');
  const readyToSend = reviewItems.filter(i => i.status === 'ready_to_send' || i.status === 'reviewed');
  const pendingApproval = reviewItems.filter(i => i.status === 'pending_review');

  const renderItem = (item: ReviewItem) => (
    <Card key={item.id} className="mb-3">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                {item.type === 'task_output' ? 'Task Output' : 'Deliverable'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {format(new Date(item.created_at), "MMM d, h:mm a")}
              </span>
            </div>
            <h4 className="font-medium truncate">{item.title}</h4>
            <p className="text-sm text-muted-foreground">{item.client_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedItem(item);
                setPreviewOpen(true);
              }}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {(item.status === 'needs_review' || item.status === 'completed') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markReviewedMutation.mutate(item)}
                disabled={markReviewedMutation.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
            )}
            {(item.status === 'ready_to_send' || item.status === 'reviewed' || item.status === 'needs_review') && (
              <Button
                size="sm"
                onClick={() => {
                  setSelectedItem(item);
                  setSendToClientOpen(true);
                }}
              >
                <Send className="h-4 w-4 mr-1" />
                Send
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Review Workflow</h2>
          <p className="text-muted-foreground">
            Review automated outputs and send to clients for approval
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["review-tasks"] });
            queryClient.invalidateQueries({ queryKey: ["review-deliverables"] });
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{needsReview.length}</p>
                <p className="text-sm text-muted-foreground">Needs Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Send className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{readyToSend.length}</p>
                <p className="text-sm text-muted-foreground">Ready to Send</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingApproval.length}</p>
                <p className="text-sm text-muted-foreground">Pending Client Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workflow Steps */}
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="text-amber-600 font-medium">1</span>
          </div>
          <span>Review Output</span>
        </div>
        <ArrowRight className="h-4 w-4" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-blue-600 font-medium">2</span>
          </div>
          <span>Send to Client</span>
        </div>
        <ArrowRight className="h-4 w-4" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
            <span className="text-purple-600 font-medium">3</span>
          </div>
          <span>Client Approves</span>
        </div>
        <ArrowRight className="h-4 w-4" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-4 w-4 text-green-600" />
          </div>
          <span>Complete</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="needs-review" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="needs-review" className="relative">
            Needs Review
            {needsReview.length > 0 && (
              <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center" variant="destructive">
                {needsReview.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ready-to-send">
            Ready to Send
            {readyToSend.length > 0 && (
              <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center">
                {readyToSend.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending-approval">
            Pending Approval
            {pendingApproval.length > 0 && (
              <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center" variant="secondary">
                {pendingApproval.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="needs-review" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : needsReview.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <p className="text-muted-foreground">All caught up! No items need review.</p>
              </CardContent>
            </Card>
          ) : (
            needsReview.map(renderItem)
          )}
        </TabsContent>

        <TabsContent value="ready-to-send" className="mt-4">
          {readyToSend.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Send className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No items ready to send.</p>
              </CardContent>
            </Card>
          ) : (
            readyToSend.map(renderItem)
          )}
        </TabsContent>

        <TabsContent value="pending-approval" className="mt-4">
          {pendingApproval.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No items pending client approval.</p>
              </CardContent>
            </Card>
          ) : (
            pendingApproval.map(renderItem)
          )}
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedItem?.title}</DialogTitle>
            <DialogDescription>
              {selectedItem?.client_name} • {selectedItem?.type === 'task_output' ? 'Automated Task Output' : 'Deliverable'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedItem?.description && (
              <div>
                <h4 className="font-medium mb-2">Description</h4>
                <p className="text-sm text-muted-foreground">{selectedItem.description}</p>
              </div>
            )}
            {selectedItem?.output_data && (
              <div>
                <h4 className="font-medium mb-2">Output</h4>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                  {typeof selectedItem.output_data === 'string' 
                    ? selectedItem.output_data 
                    : JSON.stringify(selectedItem.output_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            {selectedItem && (
              <Button onClick={() => {
                setPreviewOpen(false);
                setSendToClientOpen(true);
              }}>
                <Send className="h-4 w-4 mr-2" />
                Send to Client
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send to Client Dialog */}
      <Dialog open={sendToClientOpen} onOpenChange={setSendToClientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to Client</DialogTitle>
            <DialogDescription>
              Send "{selectedItem?.title}" to {selectedItem?.client_name} for approval
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Message to Client (optional)</label>
              <Textarea
                placeholder="Add a note for the client..."
                value={clientMessage}
                onChange={(e) => setClientMessage(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendToClientOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedItem && sendToClientMutation.mutate({ item: selectedItem, message: clientMessage })}
              disabled={sendToClientMutation.isPending}
            >
              {sendToClientMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
