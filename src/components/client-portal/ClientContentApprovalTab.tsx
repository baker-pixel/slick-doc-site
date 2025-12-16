import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { 
  Loader2, FileCheck, CheckCircle, XCircle, Clock, MessageSquare,
  FileText, Image, Mail, Share2, PenTool, Video, Megaphone, Calendar,
  ClipboardList, Sparkles, Target
} from "lucide-react";
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

// Content type configurations with icons, colors, and descriptions
const contentTypeConfig: Record<string, { 
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  "blog_post": { 
    icon: FileText, 
    label: "Blog Post", 
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    description: "A blog article written for your website to improve SEO and engage visitors"
  },
  "social_media": { 
    icon: Share2, 
    label: "Social Media Post", 
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    description: "Content designed for your social media channels"
  },
  "email": { 
    icon: Mail, 
    label: "Email Campaign", 
    color: "text-green-600",
    bgColor: "bg-green-100",
    description: "Email content for your marketing campaigns or newsletters"
  },
  "ad_copy": { 
    icon: Megaphone, 
    label: "Ad Copy", 
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    description: "Advertising copy for paid campaigns on Google, Facebook, etc."
  },
  "website_copy": { 
    icon: PenTool, 
    label: "Website Copy", 
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
    description: "Content for your website pages to improve conversions"
  },
  "video_script": { 
    icon: Video, 
    label: "Video Script", 
    color: "text-red-600",
    bgColor: "bg-red-100",
    description: "Script for video content production"
  },
  "graphic_design": { 
    icon: Image, 
    label: "Graphic Design", 
    color: "text-pink-600",
    bgColor: "bg-pink-100",
    description: "Visual design assets for marketing materials"
  },
  "content_calendar": { 
    icon: Calendar, 
    label: "Content Calendar", 
    color: "text-teal-600",
    bgColor: "bg-teal-100",
    description: "Planned content schedule for upcoming campaigns"
  },
  "strategy": { 
    icon: Target, 
    label: "Strategy Document", 
    color: "text-amber-600",
    bgColor: "bg-amber-100",
    description: "Marketing strategy and planning documentation"
  },
  "report": { 
    icon: ClipboardList, 
    label: "Performance Report", 
    color: "text-cyan-600",
    bgColor: "bg-cyan-100",
    description: "Analytics and performance reporting"
  },
  "default": { 
    icon: FileCheck, 
    label: "Content", 
    color: "text-primary",
    bgColor: "bg-primary/10",
    description: "Marketing content for your review"
  }
};

function getContentTypeConfig(type: string) {
  const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
  return contentTypeConfig[normalizedType] || contentTypeConfig.default;
}

export default function ClientContentApprovalTab({ clientAccountId }: ClientContentApprovalTabProps) {
  const [approvals, setApprovals] = useState<ContentApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<ContentApproval | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchApprovals();

    const channel = supabase
      .channel('content-approvals-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_approvals',
          filter: `client_account_id=eq.${clientAccountId}`,
        },
        () => {
          console.log('Content approvals updated, refreshing...');
          fetchApprovals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
        return <Badge className="bg-green-100 text-green-800 border-green-200">Approved</Badge>;
      case "changes_requested":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Changes Requested</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 border-red-200">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending Review</Badge>;
    }
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
                {pendingApprovals.map((approval) => {
                  const typeConfig = getContentTypeConfig(approval.content_type);
                  const IconComponent = typeConfig.icon;
                  
                  return (
                    <Card 
                      key={approval.id} 
                      className="cursor-pointer hover:shadow-md transition-all border-l-4 border-l-yellow-500 hover:border-l-yellow-600"
                      onClick={() => {
                        setSelectedApproval(approval);
                        setFeedback("");
                      }}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${typeConfig.bgColor}`}>
                              <IconComponent className={`h-5 w-5 ${typeConfig.color}`} />
                            </div>
                            <div>
                              <CardTitle className="text-base">{approval.title}</CardTitle>
                              <CardDescription className="text-xs">
                                {typeConfig.label} • Submitted {format(new Date(approval.submitted_at), "MMM d, yyyy 'at' h:mm a")}
                              </CardDescription>
                            </div>
                          </div>
                          {getStatusBadge(approval.status)}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <p className="text-xs text-muted-foreground mb-2">{typeConfig.description}</p>
                        {approval.content_preview && (
                          <div className="bg-muted/50 rounded-md p-3 mt-2">
                            <p className="text-sm text-foreground line-clamp-3">
                              {approval.content_preview}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-3">
                          <Button size="sm" variant="default" className="text-xs">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Review Now
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
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
                {reviewedApprovals.map((approval) => {
                  const typeConfig = getContentTypeConfig(approval.content_type);
                  const IconComponent = typeConfig.icon;
                  
                  return (
                    <Card 
                      key={approval.id} 
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => {
                        setSelectedApproval(approval);
                        setFeedback(approval.feedback || "");
                      }}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${typeConfig.bgColor} opacity-75`}>
                              <IconComponent className={`h-5 w-5 ${typeConfig.color}`} />
                            </div>
                            <div>
                              <CardTitle className="text-base">{approval.title}</CardTitle>
                              <CardDescription className="text-xs">
                                {typeConfig.label} • Reviewed {approval.reviewed_at ? format(new Date(approval.reviewed_at), "MMM d, yyyy 'at' h:mm a") : "N/A"}
                              </CardDescription>
                            </div>
                          </div>
                          {getStatusBadge(approval.status)}
                        </div>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Enhanced Review Dialog */}
      <Dialog open={!!selectedApproval} onOpenChange={() => setSelectedApproval(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedApproval && (() => {
            const typeConfig = getContentTypeConfig(selectedApproval.content_type);
            const IconComponent = typeConfig.icon;
            
            return (
              <>
                <DialogHeader className="pb-2">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-3 rounded-lg ${typeConfig.bgColor}`}>
                      <IconComponent className={`h-6 w-6 ${typeConfig.color}`} />
                    </div>
                    <div>
                      <DialogTitle className="text-xl">{selectedApproval.title}</DialogTitle>
                      <p className="text-sm text-muted-foreground mt-1">{typeConfig.description}</p>
                    </div>
                  </div>
                </DialogHeader>
                
                <div className="space-y-5">
                  {/* Status and Meta Info */}
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="outline" className={`${typeConfig.bgColor} ${typeConfig.color} border-0`}>
                      {typeConfig.label}
                    </Badge>
                    {getStatusBadge(selectedApproval.status)}
                    <span className="text-xs text-muted-foreground">
                      Submitted: {format(new Date(selectedApproval.submitted_at), "MMMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>

                  <Separator />

                  {/* What Was Completed Section */}
                  <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg p-4">
                    <h4 className="font-semibold text-foreground flex items-center gap-2 mb-3">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      What Was Completed
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Created {typeConfig.label.toLowerCase()} based on your brand guidelines</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Optimized for your target audience and marketing goals</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>Ready for your review and approval before publishing</span>
                      </div>
                    </div>
                  </div>

                  {/* Full Content Preview */}
                  {selectedApproval.full_content && (
                    <div>
                      <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Content Preview
                      </h4>
                      <div className="bg-muted/30 border rounded-lg p-4 max-h-64 overflow-y-auto">
                        <div 
                          className="prose prose-sm max-w-none text-foreground"
                          dangerouslySetInnerHTML={{ __html: selectedApproval.full_content }} 
                        />
                      </div>
                    </div>
                  )}

                  {/* Content Summary if no full content */}
                  {!selectedApproval.full_content && selectedApproval.content_preview && (
                    <div>
                      <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Content Summary
                      </h4>
                      <div className="bg-muted/30 border rounded-lg p-4">
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {selectedApproval.content_preview}
                        </p>
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Feedback Section for Pending */}
                  {selectedApproval.status === "pending" && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-foreground flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Your Feedback
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Optional for approval, required if requesting changes
                      </p>
                      <Textarea
                        placeholder="Share any thoughts, suggestions, or specific changes you'd like to see..."
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        rows={4}
                        className="resize-none"
                      />
                    </div>
                  )}

                  {/* Previous Feedback Display */}
                  {selectedApproval.feedback && selectedApproval.status !== "pending" && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-foreground flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Your Feedback
                      </h4>
                      <div className="bg-muted p-4 rounded-lg">
                        <p className="text-sm text-foreground whitespace-pre-wrap">{selectedApproval.feedback}</p>
                        {selectedApproval.reviewed_at && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Submitted on {format(new Date(selectedApproval.reviewed_at), "MMMM d, yyyy 'at' h:mm a")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {selectedApproval.status === "pending" && (
                  <DialogFooter className="gap-2 mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={handleRequestChanges}
                      disabled={submitting}
                      className="border-orange-200 text-orange-700 hover:bg-orange-50"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Request Changes
                    </Button>
                    <Button onClick={handleApprove} disabled={submitting} className="bg-green-600 hover:bg-green-700">
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve Content
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}