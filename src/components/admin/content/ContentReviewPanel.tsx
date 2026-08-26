import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Edit, Check, X, FileText, Mail, MessageSquare, Megaphone, Eye, Send, Loader2, Sparkles, Share2, ImageIcon, CalendarClock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AiFixCard } from "@/components/admin/shared/AiFixCard";
import { callAdminApi } from "@/lib/admin-api";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";

interface GeneratedContent {
  id: string;
  client_id: string;
  content_type: string;
  title: string | null;
  content: string;
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  client_accounts?: {
    business_name: string;
    email: string;
    first_name: string | null;
  };
}

interface ClientAccount {
  id: string;
  business_name: string;
  industry: string | null;
  tier: string;
}

// Scheduling/publishing state lives on content_calendar, keyed back to this
// row via content_calendar.content_id = generated_content.id -- not on
// generated_content itself, so the review panel can't show "did this
// actually go out" without joining it in separately.
interface CalendarLifecycleInfo {
  platform: string | null;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  error_message: string | null;
  image_url: string | null;
}

// The client's own decision lives in content_approvals, also keyed by
// content_id -- generated_content.status is kept roughly in sync by
// handle-approval, but publish_status (queued/published/failed) only
// exists here.
interface ApprovalLifecycleInfo {
  status: string;
  publish_status: string | null;
  reviewed_at: string | null;
  feedback: string | null;
}

interface LifecycleStep {
  label: string;
  done: boolean;
  detail?: string;
  failed?: boolean;
}

function buildLifecycle(
  content: GeneratedContent,
  cal: CalendarLifecycleInfo | undefined,
  appr: ApprovalLifecycleInfo | undefined,
): LifecycleStep[] {
  const qa = content.metadata?.qa as { score?: number } | undefined;
  const sentToClient = !!appr || ["approved", "client_approved", "changes_requested", "rejected", "published"].includes(content.status);
  const clientDecided = appr?.status === "approved" || appr?.status === "rejected" || ["client_approved", "rejected", "changes_requested"].includes(content.status);
  const clientRejected = appr?.status === "rejected" || content.status === "rejected" || content.status === "changes_requested";
  const scheduled = !!cal?.scheduled_for && cal.status !== "published";
  const published = cal?.status === "published" || content.status === "published";
  const failed = cal?.status === "failed";

  return [
    { label: "Drafted", done: true, detail: qa ? `QA ${qa.score}/10` : undefined },
    { label: "Sent to client", done: sentToClient },
    {
      label: clientRejected ? "Changes requested" : "Client approved",
      done: clientDecided,
      failed: clientRejected,
      detail: appr?.feedback || undefined,
    },
    { label: "Scheduled", done: scheduled || published, detail: cal?.scheduled_for ? new Date(cal.scheduled_for).toLocaleDateString() : undefined },
    {
      label: failed ? "Publish failed" : "Published",
      done: published || failed,
      failed,
      detail: failed ? (cal?.error_message ?? undefined) : cal?.published_at ? new Date(cal.published_at).toLocaleDateString() : undefined,
    },
  ];
}

// Compact step trail spanning generated_content -> content_approvals ->
// content_calendar, so admins can see where a piece actually is (sent to
// client? scheduled? published? did publishing fail?) without opening three
// different screens.
function LifecycleStrip({ content, cal, appr }: { content: GeneratedContent; cal?: CalendarLifecycleInfo; appr?: ApprovalLifecycleInfo }) {
  const steps = buildLifecycle(content, cal, appr);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] mb-1">
      {steps.map((step, i) => (
        <span key={step.label} className="flex items-center gap-1.5">
          <span
            className={
              step.failed
                ? "flex items-center gap-0.5 text-destructive"
                : step.done
                  ? "flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"
                  : "flex items-center gap-0.5 text-muted-foreground/50"
            }
            title={step.detail}
          >
            {step.failed ? <AlertTriangle className="w-3 h-3" /> : step.done ? <CheckCircle2 className="w-3 h-3" /> : null}
            {step.label}
          </span>
          {i < steps.length - 1 && <span className="text-muted-foreground/30">→</span>}
        </span>
      ))}
      {cal?.platform && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 ml-1">{cal.platform}</Badge>
      )}
    </div>
  );
}

export const ContentReviewPanel = ({ clientId, adminPassword }: { clientId?: string; adminPassword: string }) => {
  const [contents, setContents] = useState<GeneratedContent[]>([]);
  const [calendarByContentId, setCalendarByContentId] = useState<Record<string, CalendarLifecycleInfo>>({});
  const [approvalByContentId, setApprovalByContentId] = useState<Record<string, ApprovalLifecycleInfo>>({});
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>(clientId || "all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [editingContent, setEditingContent] = useState<GeneratedContent | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [previewContent, setPreviewContent] = useState<GeneratedContent | null>(null);
  const [publishingContent, setPublishingContent] = useState<GeneratedContent | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectingContent, setRejectingContent] = useState<GeneratedContent | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  
  // Content generation state
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateClientId, setGenerateClientId] = useState<string>("");
  const [generateContentType, setGenerateContentType] = useState<string>("blog_post");
  const [generateTopic, setGenerateTopic] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [contentsRes, clientsRes] = await Promise.all([
      supabase
        .from("generated_content")
        .select("*, client_accounts(business_name, email, first_name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("client_accounts")
        .select("id, business_name, industry, tier")
        .order("business_name"),
    ]);

    if (contentsRes.data) setContents(contentsRes.data as GeneratedContent[]);
    if (clientsRes.data) setClients(clientsRes.data);

    const contentIds = (contentsRes.data || []).map((c: any) => c.id);
    if (contentIds.length > 0) {
      const [calendarRes, approvalsRes] = await Promise.all([
        supabase
          .from("content_calendar")
          .select("content_id, platform, status, scheduled_for, published_at, error_message, metadata")
          .in("content_id", contentIds),
        supabase
          .from("content_approvals")
          .select("content_id, status, publish_status, reviewed_at, feedback")
          .in("content_id", contentIds),
      ]);

      const calendarMap: Record<string, CalendarLifecycleInfo> = {};
      for (const row of calendarRes.data || []) {
        if (!row.content_id) continue;
        calendarMap[row.content_id] = {
          platform: row.platform,
          status: row.status,
          scheduled_for: row.scheduled_for,
          published_at: row.published_at,
          error_message: row.error_message,
          image_url: (row.metadata as Record<string, unknown> | null)?.image_url as string | null ?? null,
        };
      }
      setCalendarByContentId(calendarMap);

      const approvalMap: Record<string, ApprovalLifecycleInfo> = {};
      for (const row of approvalsRes.data || []) {
        if (!row.content_id) continue;
        approvalMap[row.content_id] = {
          status: row.status,
          publish_status: row.publish_status,
          reviewed_at: row.reviewed_at,
          feedback: row.feedback,
        };
      }
      setApprovalByContentId(approvalMap);
    } else {
      setCalendarByContentId({});
      setApprovalByContentId({});
    }

    setLoading(false);
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case "blog_post":
        return <FileText className="w-4 h-4" />;
      case "email_sequence":
      case "email_copy":
      case "email":
        return <Mail className="w-4 h-4" />;
      case "social_post":
      case "social_media":
        return <Share2 className="w-4 h-4" />;
      case "ad_copy":
        return <Megaphone className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending_admin_review":
        return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">Needs Review</Badge>;
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "approved":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Sent to Client</Badge>;
      case "client_approved":
        return <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">Client Approved ✓</Badge>;
      case "changes_requested":
        return <Badge className="bg-orange-500/20 text-orange-600 border-orange-500/30">Changes Requested</Badge>;
      case "published":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Published</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatContentType = (type: string) => {
    return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const handleApprove = async (content: GeneratedContent) => {
    setApprovingId(content.id);
    try {
      const { error } = await callAdminApi(adminPassword, {
        action: "update",
        table: "generated_content",
        id: content.id,
        data: { status: "approved", updated_at: new Date().toISOString() },
      });
      if (error) throw new Error(error);
      toast({ title: "Approved", description: "Content approved internally. Use 'Send to Client' to request their sign-off." });
      fetchData();
    } catch {
      toast({ title: "Error", description: "Failed to approve content", variant: "destructive" });
    } finally {
      setApprovingId(null);
    }
  };

  const openRejectDialog = (content: GeneratedContent) => {
    setRejectingContent(content);
    setRejectReason("");
  };

  const handleReject = async () => {
    if (!rejectingContent) return;
    if (!rejectReason.trim()) {
      toast({ title: "Reason required", description: "Say what's wrong so future drafts can avoid it", variant: "destructive" });
      return;
    }
    setRejectingId(rejectingContent.id);
    try {
      const { error } = await callAdminApi(adminPassword, {
        action: "update",
        table: "generated_content",
        id: rejectingContent.id,
        data: {
          status: "rejected",
          rejection_reason: rejectReason.trim(),
          updated_at: new Date().toISOString(),
        },
      });
      if (error) throw new Error(error);
      toast({ title: "Rejected", description: "Content has been rejected — reason saved for future drafts" });
      setRejectingContent(null);
      fetchData();
    } catch {
      toast({ title: "Error", description: "Failed to reject content", variant: "destructive" });
    } finally {
      setRejectingId(null);
    }
  };

  const handleEdit = (content: GeneratedContent) => {
    setEditingContent(content);
    setEditedContent(content.content);
    setEditedTitle(content.title || "");
  };

  const handleSaveEdit = async () => {
    if (!editingContent) return;

    // If content was already sent to client or approved by client, reset to pending review
    // so it must be re-reviewed before being sent again.
    const resetStatus = ["approved", "client_approved", "changes_requested"].includes(editingContent.status)
      ? "pending_admin_review"
      : undefined;

    const { error } = await callAdminApi(adminPassword, {
      action: "update",
      table: "generated_content",
      id: editingContent.id,
      data: {
        content: editedContent,
        title: editedTitle || null,
        updated_at: new Date().toISOString(),
        ...(resetStatus ? { status: resetStatus } : {}),
      },
    });

    if (error) {
      toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
    } else {
      toast({
        title: "Saved",
        description: resetStatus
          ? "Content updated and reset to 'Needs Review' — re-approve before sending to client."
          : "Content has been updated",
      });
      setEditingContent(null);
      fetchData();
    }
  };

  const handlePublishClick = (content: GeneratedContent) => {
    setPublishingContent(content);
  };

  const handlePublish = async () => {
    if (!publishingContent) return;

    setIsPublishing(true);

    try {
      // Routed through the admin edge function (service role) rather than a
      // direct client insert -- content_approvals' RLS requires a real
      // Supabase Auth session with an admin role, which the
      // password-only admin login never establishes.
      const { data, error } = await callAdminApi<{ alreadyQueued?: boolean; status?: string; partialFailure?: boolean }>(
        adminPassword,
        { action: "publishContentForApproval", data: { contentId: publishingContent.id } },
      );

      if (error) throw new Error(error);

      if (data?.alreadyQueued) {
        toast({
          title: "Already in client queue",
          description: `This content is already in the client's approval queue (${data.status}).`,
        });
      } else if (data?.partialFailure) {
        toast({
          title: "Partial failure — action needed",
          description: "Content was added to client queue, but internal status could not be updated. Refresh and manually mark it approved.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sent for client approval",
          description: "Content is now in the client's approval queue.",
        });
      }

      setPublishingContent(null);
      fetchData();
    } catch (error: any) {
      console.error("Publish error:", error);
      toast({ title: "Error", description: error.message || "Failed to send content for approval", variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleGenerateContent = async () => {
    if (!generateClientId || !generateTopic.trim()) {
      toast({ title: "Please select a client and enter a topic", variant: "destructive" });
      return;
    }

    setIsGenerating(true);

    try {
      const client = clients.find(c => c.id === generateClientId);
      
      const { data, error } = await supabase.functions.invoke("run-automation", {
        body: {
          clientId: generateClientId,
          jobType: "content_generation",
          metadata: {
            contentType: generateContentType,
            topic: generateTopic,
            businessName: client?.business_name,
            industry: client?.industry,
          },
        },
      });
      if (error) {
        const msg = await getEdgeErrorMessage(error, data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to generate content");
      }

      toast({ title: "Content generated!", description: "New content has been created and is ready for review." });
      setGenerateModalOpen(false);
      setGenerateTopic("");
      setGenerateClientId("");
      fetchData();

    } catch (error: any) {
      toast({ title: "Error generating content", description: error.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredContents = contents.filter((c) => {
    if (selectedClient !== "all" && c.client_id !== selectedClient) return false;
    if (selectedType !== "all" && c.content_type !== selectedType) return false;
    if (selectedStatus !== "all" && c.status !== selectedStatus) return false;
    return true;
  });

  const contentTypes = [...new Set(contents.map((c) => c.content_type))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Content Review</h2>
        <div className="flex gap-2">
          <Button onClick={() => setGenerateModalOpen(true)} size="sm">
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Content
          </Button>
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
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
            {contentTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {formatContentType(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending_admin_review">Needs Review</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Sent to Client</SelectItem>
            <SelectItem value="client_approved">Client Approved</SelectItem>
            <SelectItem value="changes_requested">Changes Requested</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading content...</div>
      ) : filteredContents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No content found</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredContents.map((content) => (
            <Card key={content.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {getContentTypeIcon(content.content_type)}
                    <span className="text-xs">{formatContentType(content.content_type)}</span>
                  </div>
                  {getStatusBadge(content.status)}
                </div>
                <CardTitle className="text-base leading-tight mt-2">
                  {content.title || "Untitled"}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {content.client_accounts?.business_name} • {new Date(content.created_at).toLocaleDateString()}
                </p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {calendarByContentId[content.id]?.image_url && (
                  <img
                    src={calendarByContentId[content.id].image_url!}
                    alt=""
                    className="w-full h-32 object-cover rounded-md mb-3 border"
                  />
                )}
                <div className="flex-1 mb-3">
                  <p className="text-sm text-muted-foreground line-clamp-4">
                    {content.content.substring(0, 200)}...
                  </p>
                </div>
                <LifecycleStrip content={content} cal={calendarByContentId[content.id]} appr={approvalByContentId[content.id]} />
                <div className="flex gap-2 flex-wrap mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewContent(content)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(content)}
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  {(content.status === "draft" || content.status === "pending_admin_review" || content.status === "changes_requested") && (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                        disabled={approvingId === content.id}
                        onClick={() => handleApprove(content)}
                      >
                        {approvingId === content.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3 mr-1" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={rejectingId === content.id}
                        onClick={() => openRejectDialog(content)}
                      >
                        {rejectingId === content.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <X className="w-3 h-3 mr-1" />
                        )}
                        Reject
                      </Button>
                    </>
                  )}
                  {(content.status === "approved" || content.status === "draft" || content.status === "pending_admin_review" || content.status === "changes_requested") && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handlePublishClick(content)}
                    >
                      <Send className="w-3 h-3 mr-1" />
                      Send to Client
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewContent} onOpenChange={() => setPreviewContent(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              {previewContent && getContentTypeIcon(previewContent.content_type)}
              <span className="text-sm">{previewContent && formatContentType(previewContent.content_type)}</span>
              {previewContent && getStatusBadge(previewContent.status)}
            </div>
            <DialogTitle>{previewContent?.title || "Untitled"}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {previewContent?.client_accounts?.business_name} • {previewContent && new Date(previewContent.created_at).toLocaleDateString()}
            </p>
          </DialogHeader>

          {previewContent && (
            <div className="mt-2 p-3 rounded-lg border bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" /> Lifecycle
              </p>
              <LifecycleStrip
                content={previewContent}
                cal={calendarByContentId[previewContent.id]}
                appr={approvalByContentId[previewContent.id]}
              />
              {approvalByContentId[previewContent.id]?.feedback && (
                <p className="text-xs text-muted-foreground mt-1">
                  Client feedback: "{approvalByContentId[previewContent.id]?.feedback}"
                </p>
              )}
            </div>
          )}

          {previewContent && calendarByContentId[previewContent.id]?.image_url && (
            <div className="mt-3 flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <img
                src={calendarByContentId[previewContent.id].image_url!}
                alt=""
                className="max-h-64 rounded-md border object-contain"
              />
            </div>
          )}

          <div className="mt-4 prose prose-sm dark:prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-sm font-sans bg-muted/50 p-4 rounded-lg">
              {previewContent?.content}
            </pre>
          </div>
          {previewContent && (
            <div className="mt-4">
              <AiFixCard
                clientAccountId={previewContent.client_id}
                source="content"
                sourceReferenceId={previewContent.id}
                issueTitle={`Strengthen ${formatContentType(previewContent.content_type)}: ${previewContent.title || 'Untitled'}`}
                issueSummary="Get an AI critique with rewrite suggestions to boost engagement and clarity."
                severity={previewContent.status === 'rejected' ? 'high' : 'medium'}
                context={{ content_type: previewContent.content_type, title: previewContent.title, content_preview: previewContent.content?.slice(0, 1500) }}
                compact
              />
            </div>
          )}
          <DialogFooter className="mt-4 flex-wrap gap-2">
            {previewContent && (previewContent.status === "draft" || previewContent.status === "pending_admin_review" || previewContent.status === "changes_requested") && (
              <>
                <Button
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={approvingId === previewContent.id}
                  onClick={() => {
                    handleApprove(previewContent);
                    setPreviewContent(null);
                  }}
                >
                  {approvingId === previewContent.id ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  disabled={rejectingId === previewContent.id}
                  onClick={() => {
                    openRejectDialog(previewContent);
                    setPreviewContent(null);
                  }}
                >
                  {rejectingId === previewContent.id ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <X className="w-4 h-4 mr-2" />
                  )}
                  Reject
                </Button>
              </>
            )}
            {previewContent && (previewContent.status === "approved" || previewContent.status === "draft" || previewContent.status === "pending_admin_review" || previewContent.status === "changes_requested") && (
              <Button
                variant="default"
                onClick={() => {
                  handlePublishClick(previewContent);
                  setPreviewContent(null);
                }}
              >
                <Send className="w-4 h-4 mr-2" />
                Send to Client
              </Button>
            )}
            <Button variant="outline" onClick={() => setPreviewContent(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish Dialog */}
      <Dialog open={!!publishingContent} onOpenChange={() => setPublishingContent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send for Client Approval</DialogTitle>
            <DialogDescription>
              Approve this content internally and add it to the client's approval queue.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">{publishingContent?.title || "Untitled"}</p>
              <p className="text-sm text-muted-foreground">
                {formatContentType(publishingContent?.content_type || "")} for {publishingContent?.client_accounts?.business_name}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              The content will be marked as internally approved and placed in the client's Approvals tab for their sign-off before publishing.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishingContent(null)} disabled={isPublishing}>
              Cancel
            </Button>
            <Button onClick={handlePublish} disabled={isPublishing}>
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Approve &amp; Send to Client
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectingContent} onOpenChange={(open) => !open && setRejectingContent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Content</DialogTitle>
            <DialogDescription>
              Say what's wrong with this draft. The reason is saved and shown to the AI the next time it generates content for this client, so it can avoid the same mistake.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">{rejectingContent?.title || "Untitled"}</p>
              <p className="text-sm text-muted-foreground">
                {formatContentType(rejectingContent?.content_type || "")} for {rejectingContent?.client_accounts?.business_name}
              </p>
            </div>
            <Textarea
              placeholder="e.g. Too salesy, doesn't mention our new pricing, wrong tone for LinkedIn..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingContent(null)} disabled={rejectingId === rejectingContent?.id}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || rejectingId === rejectingContent?.id}
            >
              {rejectingId === rejectingContent?.id ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <X className="w-4 h-4 mr-2" />
                  Reject
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingContent} onOpenChange={() => setEditingContent(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Content</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Title</label>
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                placeholder="Content title"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Content</label>
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditingContent(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Content Dialog */}
      <Dialog open={generateModalOpen} onOpenChange={setGenerateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Generate New Content
            </DialogTitle>
            <DialogDescription>
              Create AI-generated content tailored to your client's industry and needs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Client</label>
              <Select value={generateClientId} onValueChange={setGenerateClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.business_name} {client.industry && `(${client.industry})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Content Type</label>
              <Select value={generateContentType} onValueChange={setGenerateContentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select content type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blog_post">Blog Post</SelectItem>
                  <SelectItem value="social_post">Social Media Post</SelectItem>
                  <SelectItem value="email_copy">Email Copy</SelectItem>
                  <SelectItem value="ad_copy">Ad Copy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Topic / Brief</label>
              <Textarea
                value={generateTopic}
                onChange={(e) => setGenerateTopic(e.target.value)}
                placeholder="Describe what the content should be about..."
                className="min-h-[100px]"
              />
            </div>
            
            {generateClientId && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">
                  Content will be generated for{" "}
                  <span className="font-medium text-foreground">
                    {clients.find(c => c.id === generateClientId)?.business_name}
                  </span>
                  {clients.find(c => c.id === generateClientId)?.industry && (
                    <> in the <span className="font-medium text-foreground">{clients.find(c => c.id === generateClientId)?.industry}</span> industry</>
                  )}
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setGenerateModalOpen(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button onClick={handleGenerateContent} disabled={isGenerating || !generateClientId || !generateTopic.trim()}>
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Content
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
