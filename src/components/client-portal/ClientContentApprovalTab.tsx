import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, FileCheck, CheckCircle, XCircle, Clock, MessageSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ContentApproval {
  id: string;
  title: string;
  content_type: string;
  content_preview: string | null;
  full_content: string | null;
  status: string;
  feedback: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

interface ClientContentApprovalTabProps {
  clientAccountId: string;
}

export default function ClientContentApprovalTab({ clientAccountId }: ClientContentApprovalTabProps) {
  const [approvals, setApprovals] = useState<ContentApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<ContentApproval | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchApprovals();
  }, [clientAccountId]);

  const fetchApprovals = async () => {
    try {
      const { data, error } = await supabase
        .from("content_approvals")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      setApprovals(data || []);
    } catch (error) {
      console.error("Error fetching approvals:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedApproval) return;
    setSubmitting(true);

    try {
      const { error } = await supabase
        .from("content_approvals")
        .update({
          status: "approved",
          feedback: feedback || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedApproval.id);

      if (error) throw error;

      toast({
        title: "Content Approved",
        description: "The content has been approved and will proceed to publishing.",
      });

      setSelectedApproval(null);
      setFeedback("");
      fetchApprovals();
    } catch (error) {
      console.error("Error approving content:", error);
      toast({
        title: "Error",
        description: "Failed to approve content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!selectedApproval || !feedback.trim()) {
      toast({
        title: "Feedback Required",
        description: "Please provide feedback on what changes are needed.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);

    try {
      const { error } = await supabase
        .from("content_approvals")
        .update({
          status: "changes_requested",
          feedback,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedApproval.id);

      if (error) throw error;

      toast({
        title: "Changes Requested",
        description: "Your feedback has been sent to the team.",
      });

      setSelectedApproval(null);
      setFeedback("");
      fetchApprovals();
    } catch (error) {
      console.error("Error requesting changes:", error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case "changes_requested":
        return <Badge className="bg-orange-100 text-orange-800">Changes Requested</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Pending Review</Badge>;
    }
  };

  const getContentTypeIcon = (type: string) => {
    return <FileCheck className="h-5 w-5 text-primary" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const reviewedApprovals = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Content Approvals</h2>
        <p className="text-muted-foreground">Review and approve content before it goes live</p>
      </div>

      {approvals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground">No Content to Review</h3>
            <p className="text-muted-foreground">Content items will appear here when they need your approval.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Pending Approvals */}
          {pendingApprovals.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                Awaiting Your Review ({pendingApprovals.length})
              </h3>
              <div className="grid gap-4">
                {pendingApprovals.map((approval) => (
                  <Card 
                    key={approval.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-yellow-500"
                    onClick={() => {
                      setSelectedApproval(approval);
                      setFeedback("");
                    }}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {getContentTypeIcon(approval.content_type)}
                          <div>
                            <CardTitle className="text-base">{approval.title}</CardTitle>
                            <CardDescription className="text-xs">
                              {approval.content_type} • Submitted {format(new Date(approval.submitted_at), "MMM d, yyyy")}
                            </CardDescription>
                          </div>
                        </div>
                        {getStatusBadge(approval.status)}
                      </div>
                    </CardHeader>
                    {approval.content_preview && (
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {approval.content_preview}
                        </p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Reviewed Content */}
          {reviewedApprovals.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Previously Reviewed ({reviewedApprovals.length})
              </h3>
              <div className="grid gap-4">
                {reviewedApprovals.map((approval) => (
                  <Card 
                    key={approval.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow opacity-75"
                    onClick={() => {
                      setSelectedApproval(approval);
                      setFeedback(approval.feedback || "");
                    }}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {getContentTypeIcon(approval.content_type)}
                          <div>
                            <CardTitle className="text-base">{approval.title}</CardTitle>
                            <CardDescription className="text-xs">
                              {approval.content_type} • Reviewed {approval.reviewed_at ? format(new Date(approval.reviewed_at), "MMM d, yyyy") : "N/A"}
                            </CardDescription>
                          </div>
                        </div>
                        {getStatusBadge(approval.status)}
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Review Dialog */}
      <Dialog open={!!selectedApproval} onOpenChange={() => setSelectedApproval(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedApproval && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedApproval.title}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{selectedApproval.content_type}</Badge>
                  {getStatusBadge(selectedApproval.status)}
                </div>

                {selectedApproval.full_content && (
                  <div className="prose prose-sm max-w-none bg-muted/50 p-4 rounded-lg">
                    <div dangerouslySetInnerHTML={{ __html: selectedApproval.full_content }} />
                  </div>
                )}

                {selectedApproval.status === "pending" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Feedback (optional for approval, required for changes)
                    </label>
                    <Textarea
                      placeholder="Add any comments or requested changes..."
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={4}
                    />
                  </div>
                )}

                {selectedApproval.feedback && selectedApproval.status !== "pending" && (
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-sm font-medium mb-1">Your Feedback:</p>
                    <p className="text-sm text-muted-foreground">{selectedApproval.feedback}</p>
                  </div>
                )}
              </div>

              {selectedApproval.status === "pending" && (
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={handleRequestChanges}
                    disabled={submitting}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Request Changes
                  </Button>
                  <Button onClick={handleApprove} disabled={submitting}>
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </>
                    )}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
