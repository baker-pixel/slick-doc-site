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
import { RefreshCw, Edit, X, FileText, Mail, Megaphone, Eye, Send, Loader2, Sparkles, Share2, ImageIcon, CalendarClock, AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { AiFixCard } from "@/components/admin/shared/AiFixCard";
import { callAdminApi } from "@/lib/admin-api";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { contentStage, isAutoSent, STAGE_TABS, type StageInfo, type StageTone } from "@/lib/contentLifecycle";

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
  submitted_at: string | null;
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
  // "Sent" means a row exists in the client's approval queue -- not that
  // generated_content.status says "approved", which can be set without one.
  const sentToClient = !!appr;
  const clientRejected = appr?.status === "rejected" || appr?.status === "changes_requested";
  const clientApproved = appr?.status === "approved";
  const published = cal?.status === "published" || content.status === "published";
  const scheduled = clientApproved && !!cal?.scheduled_for && !published;
  const failed = cal?.status === "failed" || appr?.publish_status === "failed";

  return [
    { label: "Drafted", done: true, detail: qa ? `QA ${qa.score}/10` : undefined },
    { label: isAutoSent(content) ? "Auto-sent to client" : "Sent to client", done: sentToClient },
    {
      label: clientRejected ? (appr?.status === "rejected" ? "Client declined" : "Changes requested") : "Client approved",
      done: clientApproved || clientRejected,
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
  const [selectedTab, setSelectedTab] = useState<string>("action");
  const [editingContent, setEditingContent] = useState<GeneratedContent | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [previewContent, setPreviewContent] = useState<GeneratedContent | null>(null);
  const [publishingContent, setPublishingContent] = useState<GeneratedContent | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectingContent, setRejectingContent] = useState<GeneratedContent | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  
  // Content generation state
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateClientId, setGenerateClientId] = useState<string>("");
  const [generateContentType, setGenerateContentType] = useState<string>("social_post");
  const [generateTopic, setGenerateTopic] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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
          .select("content_id, status, publish_status, reviewed_at, feedback, submitted_at")
          .in("content_id", contentIds)
          .order("submitted_at", { ascending: true }),
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
          submitted_at: row.submitted_at,
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

  const stageOf = (c: GeneratedContent): StageInfo =>
    contentStage(c, approvalByContentId[c.id], calendarByContentId[c.id]);

  const toneClass: Record<StageTone, string> = {
    action: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    waiting: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
    good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    done: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    bad: "bg-destructive/15 text-destructive border-destructive/30",
    muted: "bg-muted text-muted-foreground",
  };

  const getStageBadge = (stage: StageInfo) => (
    <Badge variant="outline" className={toneClass[stage.tone]} title={stage.hint}>
      {stage.label}
    </Badge>
  );

  const formatContentType = (type: string) => {
    return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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
    if (!editedContent.trim()) {
      toast({ title: "Content can't be empty", variant: "destructive" });
      return;
    }
    setIsSavingEdit(true);
    try {
      // Server-side so the client's copy of the draft (and the calendar slot)
      // is updated in the same call -- see updateContentText in the admin fn.
      const { data, error } = await callAdminApi<{ syncedToClient?: boolean; resetToReview?: boolean }>(adminPassword, {
        action: "updateContentText",
        data: { contentId: editingContent.id, title: editedTitle, content: editedContent },
      });
      if (error) throw new Error(error);
      toast({
        title: "Saved",
        description: data?.syncedToClient
          ? "Updated — the client now sees the new version in their Approvals tab."
          : data?.resetToReview
            ? "Updated and moved back to 'Needs your review' — send it to the client when ready."
            : "Content updated.",
      });
      setEditingContent(null);
      fetchData();
    } catch (e: any) {
      toast({ title: "Couldn't save changes", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setIsSavingEdit(false);
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

  const inScope = contents.filter((c) => {
    if (selectedClient !== "all" && c.client_id !== selectedClient) return false;
    if (selectedType !== "all" && c.content_type !== selectedType) return false;
    return true;
  });
  const staged = inScope.map((c) => ({ c, stage: stageOf(c) }));
  const tabCounts: Record<string, number> = {};
  for (const t of STAGE_TABS) tabCounts[t.key] = staged.filter((x) => t.stages.includes(x.stage.stage)).length;
  const activeTab = STAGE_TABS.find((t) => t.key === selectedTab);
  const visible = selectedTab === "all" ? staged : staged.filter((x) => activeTab?.stages.includes(x.stage.stage));

  const contentTypes = [...new Set(contents.map((c) => c.content_type))];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Content Review</h2>
          <p className="text-sm text-muted-foreground">
            Social posts are drafted and sent to clients automatically. This list shows where each piece really is and what, if anything, needs you.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setGenerateModalOpen(true)} size="sm">
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Content
          </Button>
          <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stage tabs -- the primary navigation. Counts are live. */}
      <div className="flex flex-wrap gap-2" role="tablist">
        {STAGE_TABS.map((t) => {
          const n = tabCounts[t.key];
          const active = selectedTab === t.key;
          const attention = t.key === "action" && n > 0;
          return (
            <Button
              key={t.key}
              role="tab"
              aria-selected={active}
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => setSelectedTab(t.key)}
            >
              {t.label}
              <span className={`ml-2 rounded-full px-1.5 text-[11px] leading-5 ${active ? "bg-primary-foreground/20" : attention ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>
                {n}
              </span>
            </Button>
          );
        })}
        <Button size="sm" variant={selectedTab === "all" ? "default" : "ghost"} onClick={() => setSelectedTab("all")}>
          All <span className="ml-2 text-[11px] text-muted-foreground">{staged.length}</span>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
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
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading content...</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {selectedTab === "action" ? "Nothing needs your action right now." : "Nothing here."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map(({ c: content, stage }) => (
            <Card key={content.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {getContentTypeIcon(content.content_type)}
                    <span className="text-xs">{formatContentType(content.content_type)}</span>
                    {calendarByContentId[content.id]?.platform && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{calendarByContentId[content.id].platform}</Badge>
                    )}
                  </div>
                  {getStageBadge(stage)}
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
                    {content.content.length > 200 ? `${content.content.substring(0, 200)}…` : content.content}
                  </p>
                </div>
                <p className={`text-xs mb-2 ${stage.tone === "bad" ? "text-destructive" : stage.tone === "action" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                  {stage.hint}
                </p>
                <LifecycleStrip content={content} cal={calendarByContentId[content.id]} appr={approvalByContentId[content.id]} />
                <div className="flex gap-2 flex-wrap mt-3">
                  <Button size="sm" variant="outline" onClick={() => setPreviewContent(content)}>
                    <Eye className="w-3 h-3 mr-1" />
                    Preview
                  </Button>
                  {stage.canEdit ? (
                    <Button size="sm" variant="outline" onClick={() => handleEdit(content)}>
                      <Edit className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled title="The client already approved this — the text is locked.">
                      <Lock className="w-3 h-3 mr-1" />
                      Locked
                    </Button>
                  )}
                  {stage.canSend && (
                    <Button size="sm" onClick={() => handlePublishClick(content)}>
                      <Send className="w-3 h-3 mr-1" />
                      Send to client
                    </Button>
                  )}
                  {stage.canReject && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={rejectingId === content.id}
                      onClick={() => openRejectDialog(content)}
                    >
                      {rejectingId === content.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <X className="w-3 h-3 mr-1" />}
                      Reject
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
              {previewContent && getStageBadge(stageOf(previewContent))}
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
                severity={stageOf(previewContent).stage === "rejected" ? 'high' : 'medium'}
                context={{ content_type: previewContent.content_type, title: previewContent.title, content_preview: previewContent.content?.slice(0, 1500) }}
                compact
              />
            </div>
          )}
          <DialogFooter className="mt-4 flex-wrap gap-2">
            {previewContent && stageOf(previewContent).canReject && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  openRejectDialog(previewContent);
                  setPreviewContent(null);
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Reject
              </Button>
            )}
            {previewContent && stageOf(previewContent).canSend && (
              <Button
                onClick={() => {
                  handlePublishClick(previewContent);
                  setPreviewContent(null);
                }}
              >
                <Send className="w-4 h-4 mr-2" />
                Send to client
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
            <DialogTitle>Send to client</DialogTitle>
            <DialogDescription>
              Puts this in the client's Approvals tab. Nothing is published until they approve it.
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
              Once it's with the client you can still edit it — changes sync to their copy until they approve. After they approve, the text is locked.
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
                  Send to client
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
            {editingContent && (
              <DialogDescription>
                {stageOf(editingContent).stage === "with_client"
                  ? "This is already in the client's Approvals tab — saving updates the version they see."
                  : "Saving updates the draft. It isn't sent to the client until you press Send to client."}
              </DialogDescription>
            )}
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
            <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
              {isSavingEdit ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
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
