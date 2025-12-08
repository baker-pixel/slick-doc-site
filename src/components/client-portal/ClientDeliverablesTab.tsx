import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Package, Star, Download, Eye, MessageSquare, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { format } from "date-fns";

interface Deliverable {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string | null;
  file_name: string | null;
  preview_url: string | null;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  rating: number | null;
  feedback: string | null;
  revision_notes: string | null;
  revision_count: number;
}

interface ClientDeliverablesTabProps {
  clientAccountId: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<{ className?: string }> }> = {
  pending_review: { label: "Pending Review", variant: "secondary", icon: Package },
  approved: { label: "Approved", variant: "default", icon: CheckCircle },
  revision_requested: { label: "Revision Requested", variant: "destructive", icon: RotateCcw },
  rejected: { label: "Rejected", variant: "outline", icon: XCircle },
};

export function ClientDeliverablesTab({ clientAccountId }: ClientDeliverablesTabProps) {
  const queryClient = useQueryClient();
  const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [revisionNotes, setRevisionNotes] = useState("");

  const { data: deliverables, isLoading } = useQuery({
    queryKey: ["client-deliverables", clientAccountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      return data as Deliverable[];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, rating, feedback, revisionNotes }: { 
      id: string; 
      status: string; 
      rating?: number; 
      feedback?: string;
      revisionNotes?: string;
    }) => {
      const { error } = await supabase
        .from("deliverables")
        .update({
          status,
          rating: rating || null,
          feedback: feedback || null,
          revision_notes: status === "revision_requested" ? revisionNotes : null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-deliverables"] });
      toast({ title: "Review submitted" });
      closeReviewDialog();
    },
    onError: (error) => {
      toast({ title: "Error submitting review", description: String(error), variant: "destructive" });
    },
  });

  const openReviewDialog = (deliverable: Deliverable) => {
    setSelectedDeliverable(deliverable);
    setRating(deliverable.rating || 0);
    setFeedback(deliverable.feedback || "");
    setRevisionNotes("");
    setIsReviewOpen(true);
  };

  const closeReviewDialog = () => {
    setIsReviewOpen(false);
    setSelectedDeliverable(null);
    setRating(0);
    setFeedback("");
    setRevisionNotes("");
  };

  const handleApprove = () => {
    if (!selectedDeliverable) return;
    reviewMutation.mutate({
      id: selectedDeliverable.id,
      status: "approved",
      rating,
      feedback,
    });
  };

  const handleRequestRevision = () => {
    if (!selectedDeliverable || !revisionNotes.trim()) {
      toast({ title: "Please describe the revisions needed", variant: "destructive" });
      return;
    }
    reviewMutation.mutate({
      id: selectedDeliverable.id,
      status: "revision_requested",
      revisionNotes,
    });
  };

  const pendingCount = deliverables?.filter(d => d.status === "pending_review").length || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Deliverables</h2>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Deliverables</h2>
        {pendingCount > 0 && (
          <Badge variant="secondary">{pendingCount} awaiting review</Badge>
        )}
      </div>

      {!deliverables || deliverables.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No deliverables yet</p>
              <p className="text-sm">Completed work will appear here for your review.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {deliverables.map((deliverable) => {
            const config = statusConfig[deliverable.status] || statusConfig.pending_review;
            const StatusIcon = config.icon;

            return (
              <Card key={deliverable.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{deliverable.title}</h3>
                        <Badge variant={config.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                      </div>
                      {deliverable.description && (
                        <p className="text-sm text-muted-foreground mb-2">{deliverable.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Submitted {format(new Date(deliverable.submitted_at), "MMM d, yyyy")}</span>
                        <Badge variant="outline" className="text-xs">{deliverable.category}</Badge>
                        {deliverable.revision_count > 0 && (
                          <span className="flex items-center gap-1">
                            <RotateCcw className="h-3 w-3" />
                            {deliverable.revision_count} revision{deliverable.revision_count > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {deliverable.rating && (
                        <div className="flex items-center gap-1 mt-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${star <= deliverable.rating! ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {deliverable.preview_url && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={deliverable.preview_url} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {deliverable.file_url && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={deliverable.file_url} download={deliverable.file_name}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {deliverable.status === "pending_review" && (
                        <Button size="sm" onClick={() => openReviewDialog(deliverable)}>
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review: {selectedDeliverable?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rating</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`h-6 w-6 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-300"}`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback">Feedback (optional)</Label>
              <Textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Share your thoughts on this deliverable..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="revisionNotes">Revision Notes (if requesting changes)</Label>
              <Textarea
                id="revisionNotes"
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="Describe what changes you'd like..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={closeReviewDialog}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={handleRequestRevision}
                disabled={reviewMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Request Revision
              </Button>
              <Button onClick={handleApprove} disabled={reviewMutation.isPending}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
