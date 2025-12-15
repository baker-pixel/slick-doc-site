import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { 
  Package, 
  Star, 
  Download, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  FileText,
  Clock,
  Sparkles,
  FileImage,
  FileCode,
  Presentation,
  ChevronRight,
  Calendar,
} from "lucide-react";
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

const statusConfig: Record<string, { 
  label: string; 
  bgColor: string; 
  textColor: string; 
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  pending_review: { 
    label: "Awaiting Your Review", 
    bgColor: "bg-amber-500/10", 
    textColor: "text-amber-600 dark:text-amber-400",
    borderColor: "border-amber-500/30",
    icon: Clock 
  },
  approved: { 
    label: "Approved", 
    bgColor: "bg-emerald-500/10", 
    textColor: "text-emerald-600 dark:text-emerald-400",
    borderColor: "border-emerald-500/30",
    icon: CheckCircle2 
  },
  revision_requested: { 
    label: "Revision in Progress", 
    bgColor: "bg-blue-500/10", 
    textColor: "text-blue-600 dark:text-blue-400",
    borderColor: "border-blue-500/30",
    icon: RotateCcw 
  },
  rejected: { 
    label: "Rejected", 
    bgColor: "bg-red-500/10", 
    textColor: "text-red-600 dark:text-red-400",
    borderColor: "border-red-500/30",
    icon: XCircle 
  },
};

const categoryConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  report: { icon: FileText, label: "Report" },
  design: { icon: FileImage, label: "Design" },
  content: { icon: FileCode, label: "Content" },
  presentation: { icon: Presentation, label: "Presentation" },
  general: { icon: Package, label: "Deliverable" },
};

// Markdown renderer for audit reports
function renderMarkdown(content: string) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={key++} className="text-2xl font-bold text-foreground mt-6 mb-3 first:mt-0">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key++} className="text-lg font-semibold text-foreground mt-8 mb-3 pb-2 border-b border-border">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={key++} className="text-base font-medium text-foreground mt-5 mb-2">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <li key={key++} className="text-sm text-muted-foreground ml-4 mb-1 list-disc list-inside">
          {line.slice(2)}
        </li>
      );
    } else if (line.startsWith('**') && line.includes(':**')) {
      const [label, ...rest] = line.split(':**');
      const value = rest.join(':**');
      elements.push(
        <div key={key++} className="flex gap-2 text-sm mb-2 py-1">
          <span className="font-semibold text-foreground min-w-fit">{label.replace(/\*\*/g, '')}:</span>
          <span className="text-muted-foreground">{value.replace(/\*\*/g, '')}</span>
        </div>
      );
    } else if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      elements.push(
        <p key={key++} className="text-sm italic text-muted-foreground mb-3">
          {line.slice(1, -1)}
        </p>
      );
    } else if (line.trim()) {
      elements.push(
        <p key={key++} className="text-sm text-muted-foreground mb-2 leading-relaxed">
          {line}
        </p>
      );
    }
  }

  return elements;
}

function isMarkdownContent(content: string | null): boolean {
  if (!content) return false;
  return content.startsWith('# ') || content.includes('\n## ') || content.includes('\n### ');
}

export function ClientDeliverablesTab({ clientAccountId }: ClientDeliverablesTabProps) {
  const queryClient = useQueryClient();
  const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
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
      toast({ title: "Review submitted successfully" });
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

  const openReportDialog = (deliverable: Deliverable) => {
    setSelectedDeliverable(deliverable);
    setIsReportOpen(true);
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Deliverables</h2>
            <p className="text-muted-foreground text-sm mt-1">Review and approve your marketing assets</p>
          </div>
        </div>
        <div className="grid gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted rounded w-1/3 mb-4" />
                <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Deliverables</h2>
          <p className="text-muted-foreground text-sm mt-1">Review and approve your marketing assets</p>
        </div>
        {pendingCount > 0 && (
          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {pendingCount} awaiting review
          </Badge>
        )}
      </div>

      {/* Empty State */}
      {!deliverables || deliverables.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No deliverables yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                When your marketing team completes work, it will appear here for your review and approval.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {deliverables.map((deliverable) => {
            const status = statusConfig[deliverable.status] || statusConfig.pending_review;
            const StatusIcon = status.icon;
            const category = categoryConfig[deliverable.category] || categoryConfig.general;
            const CategoryIcon = category.icon;
            const hasMarkdown = isMarkdownContent(deliverable.description);
            const isPending = deliverable.status === "pending_review";

            return (
              <Card 
                key={deliverable.id} 
                className={`transition-all hover:shadow-md ${isPending ? 'ring-2 ring-amber-500/20' : ''}`}
              >
                <CardContent className="p-0">
                  <div className="flex">
                    {/* Left accent stripe */}
                    <div className={`w-1.5 rounded-l-lg ${status.bgColor.replace('/10', '/40')}`} />
                    
                    <div className="flex-1 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Title row */}
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`p-2 rounded-lg ${status.bgColor}`}>
                              <CategoryIcon className={`h-5 w-5 ${status.textColor}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-foreground text-lg truncate">
                                {deliverable.title}
                              </h3>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="text-xs font-normal">
                                  {category.label}
                                </Badge>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(deliverable.submitted_at), "MMM d, yyyy")}
                                </span>
                                {deliverable.revision_count > 0 && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <RotateCcw className="h-3 w-3" />
                                    v{deliverable.revision_count + 1}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Status badge */}
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${status.bgColor} ${status.textColor} border ${status.borderColor}`}>
                            <StatusIcon className="h-4 w-4" />
                            {status.label}
                          </div>

                          {/* Rating display */}
                          {deliverable.rating && (
                            <div className="flex items-center gap-1 mt-3">
                              <span className="text-xs text-muted-foreground mr-1">Your rating:</span>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`h-4 w-4 ${
                                    star <= deliverable.rating! 
                                      ? "fill-amber-400 text-amber-400" 
                                      : "text-muted-foreground/30"
                                  }`}
                                />
                              ))}
                            </div>
                          )}

                          {/* Feedback display */}
                          {deliverable.feedback && (
                            <p className="text-sm text-muted-foreground mt-2 italic">
                              "{deliverable.feedback}"
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-end gap-2">
                          {hasMarkdown && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openReportDialog(deliverable)}
                              className="gap-2"
                            >
                              <FileText className="h-4 w-4" />
                              View Report
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          )}
                          
                          <div className="flex items-center gap-2">
                            {deliverable.preview_url && (
                              <Button variant="outline" size="icon" asChild>
                                <a href={deliverable.preview_url} target="_blank" rel="noopener noreferrer">
                                  <Eye className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            {deliverable.file_url && (
                              <Button variant="outline" size="icon" asChild>
                                <a href={deliverable.file_url} download={deliverable.file_name}>
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            {isPending && (
                              <Button onClick={() => openReviewDialog(deliverable)} className="gap-2">
                                <CheckCircle2 className="h-4 w-4" />
                                Review
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Report Viewer Dialog */}
      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b bg-muted/30">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {selectedDeliverable?.title}
            </DialogTitle>
            <DialogDescription>
              Submitted on {selectedDeliverable && format(new Date(selectedDeliverable.submitted_at), "MMMM d, yyyy")}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(85vh-120px)]">
            <div className="p-6">
              {selectedDeliverable?.description && renderMarkdown(selectedDeliverable.description)}
            </div>
          </ScrollArea>
          <div className="px-6 py-4 border-t bg-muted/30 flex justify-between items-center">
            <Button variant="outline" onClick={() => setIsReportOpen(false)}>
              Close
            </Button>
            {selectedDeliverable?.status === "pending_review" && (
              <Button onClick={() => {
                setIsReportOpen(false);
                if (selectedDeliverable) openReviewDialog(selectedDeliverable);
              }}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Review This Deliverable
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Deliverable</DialogTitle>
            <DialogDescription>{selectedDeliverable?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-3">
              <Label className="text-sm font-medium">How would you rate this deliverable?</Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-primary rounded"
                  >
                    <Star
                      className={`h-8 w-8 transition-colors ${
                        star <= rating 
                          ? "fill-amber-400 text-amber-400" 
                          : "text-muted-foreground/40 hover:text-amber-300"
                      }`}
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
                placeholder="Share any comments about this deliverable..."
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="revisionNotes">Revision Notes</Label>
              <p className="text-xs text-muted-foreground">If you need changes, describe them below</p>
              <Textarea
                id="revisionNotes"
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="Describe what changes you'd like made..."
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={closeReviewDialog}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={handleRequestRevision}
                disabled={reviewMutation.isPending || !revisionNotes.trim()}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Request Revision
              </Button>
              <Button 
                onClick={handleApprove} 
                disabled={reviewMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
