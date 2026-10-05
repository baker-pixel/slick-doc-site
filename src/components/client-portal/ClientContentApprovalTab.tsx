import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, FileCheck, CheckCheck, PartyPopper, Facebook, Instagram, Linkedin, Twitter, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { completeWorkflowStep } from "@/lib/completeWorkflowStep";
import { hasCaption } from "./approvals/ContentRenderer";
import { ApprovalCard } from "./approvals/ApprovalCard";
import { ApprovalReviewDialog, type ReviewItem } from "./approvals/ApprovalReviewDialog";
import { approvalDisplay, formatWhen, relativeUntil, type ApprovalBucket, type ApprovalLive } from "./approvals/approvalStatus";
import type { PreviewPlatform } from "./approvals/SocialPostPreview";

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
  publish_status: string | null;
  platform: string | null;
  content_id: string | null;
  scheduled_for: string | null;
}

interface CalendarRow {
  id: string;
  content_id: string | null;
  platform: string | null;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

interface ClientContentApprovalTabProps {
  clientAccountId: string;
  onTabChange?: (tab: string) => void;
}

type PlatformFilter = "all" | PreviewPlatform;

const PLATFORM_CONFIG: Record<PreviewPlatform, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  facebook: { label: "Facebook", icon: Facebook },
  instagram: { label: "Instagram", icon: Instagram },
  twitter: { label: "X", icon: Twitter },
  linkedin: { label: "LinkedIn", icon: Linkedin },
  other: { label: "Other", icon: LayoutGrid },
};

function normalizePlatform(platform: string | null): PreviewPlatform {
  const p = (platform || "").toLowerCase();
  if (p === "facebook" || p === "instagram" || p === "linkedin") return p;
  if (p === "twitter" || p === "x") return "twitter";
  return "other";
}

const BUCKETS: { key: ApprovalBucket; label: string; empty: string }[] = [
  { key: "review", label: "Needs review", empty: "You're all caught up — nothing is waiting for your review." },
  { key: "upcoming", label: "Upcoming", empty: "Nothing approved and waiting to go out." },
  { key: "live", label: "Published", empty: "Nothing published yet." },
  { key: "attention", label: "Needs attention", empty: "Nothing needs attention." },
];

const REFRESH_MS = 60_000;

export default function ClientContentApprovalTab({ clientAccountId, onTabChange }: ClientContentApprovalTabProps) {
  const queryClient = useQueryClient();
  const [approvals, setApprovals] = useState<ContentApproval[]>([]);
  const [calendar, setCalendar] = useState<CalendarRow[]>([]);
  const [businessName, setBusinessName] = useState("Your business");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [bucket, setBucket] = useState<ApprovalBucket | null>(null);
  // Whether the client_approval onboarding step is unlocked but not yet complete
  // (draft is being generated in the background — show helpful empty state instead of blank)
  const [approvalStepPending, setApprovalStepPending] = useState(false);

  useEffect(() => {
    supabase.from("client_accounts").select("business_name").eq("id", clientAccountId).maybeSingle()
      .then(({ data }) => { if (data?.business_name) setBusinessName(data.business_name); });
  }, [clientAccountId]);

  useEffect(() => {
    // Check if the client_approval workflow step is pending (onboarding step 5)
    supabase
      .from("client_workflows")
      .select("id")
      .eq("client_id", clientAccountId)
      .eq("status", "active")
      .maybeSingle()
      .then(({ data: wf }) => {
        if (!wf) return;
        supabase
          .from("workflow_steps")
          .select("status")
          .eq("workflow_id", wf.id)
          .eq("task_type", "client_approval")
          .maybeSingle()
          .then(({ data: step }) => {
            setApprovalStepPending(!!step && step.status !== "completed" && step.status !== "locked");
          });
      });
  }, [clientAccountId]);

  const fetchApprovals = useCallback(async () => {
    try {
      const [{ data, error }, { data: calRows, error: calError }] = await Promise.all([
        supabase.from("content_approvals").select("*").eq("client_account_id", clientAccountId).order("submitted_at", { ascending: false }),
        // content_approvals has no image or real publish state of its own --
        // both live on the calendar row (publish_status there is set to
        // "queued" once at approval time and never updated).
        supabase.from("content_calendar")
          .select("id, content_id, platform, status, scheduled_for, published_at, error_message, metadata")
          .eq("client_account_id", clientAccountId),
      ]);
      if (error) throw error;
      if (calError) throw calError;
      setApprovals((data || []) as ContentApproval[]);
      setCalendar((calRows || []) as CalendarRow[]);
    } catch (error) {
      console.error("Error fetching approvals:", error);
    } finally {
      setLoading(false);
    }
  }, [clientAccountId]);

  // Approvals arrive live; the calendar (publish results) is not in the
  // realtime publication, so refresh on a timer and whenever the tab regains focus.
  useEffect(() => {
    fetchApprovals();

    const channel = supabase
      .channel("content-approvals-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "content_approvals", filter: `client_account_id=eq.${clientAccountId}` }, () => fetchApprovals())
      .subscribe();

    const tick = () => { if (document.visibilityState === "visible") fetchApprovals(); };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [clientAccountId, fetchApprovals]);

  // Join each approval to the calendar row that will actually publish it.
  // Two link paths exist (see handle-approval): a content_id FK, or
  // metadata.content_approval_id for rows with no generated_content behind them.
  // One piece of content can fan out to several platforms, so a content_id match
  // must also agree on platform -- guessing across platforms would show the
  // wrong schedule.
  const items: ReviewItem[] = useMemo(() => {
    const byApproval = new Map<string, CalendarRow>();
    const byContent = new Map<string, CalendarRow[]>();
    for (const c of calendar) {
      const aid = (c.metadata as { content_approval_id?: string } | null)?.content_approval_id;
      if (aid) byApproval.set(aid, c);
      if (c.content_id) byContent.set(c.content_id, [...(byContent.get(c.content_id) ?? []), c]);
    }
    const findCal = (a: ContentApproval): CalendarRow | undefined => {
      const direct = byApproval.get(a.id);
      if (direct) return direct;
      const cands = a.content_id ? byContent.get(a.content_id) ?? [] : [];
      if (cands.length === 1 && (!a.platform || !cands[0].platform || cands[0].platform === a.platform)) return cands[0];
      return cands.find((c) => c.platform && c.platform === a.platform);
    };

    return approvals.map((a) => {
      const cal = findCal(a);
      const live: ApprovalLive | undefined = cal
        ? { calStatus: cal.status, scheduledFor: cal.scheduled_for, publishedAt: cal.published_at, metadata: cal.metadata, errorMessage: cal.error_message }
        : undefined;
      const meta = (cal?.metadata ?? {}) as { image_url?: string; platform_post_url?: string };
      return {
        id: a.id,
        title: a.title,
        content_type: a.content_type,
        content_preview: a.content_preview,
        full_content: a.full_content,
        status: a.status,
        feedback: a.feedback,
        submitted_at: a.submitted_at,
        reviewed_at: a.reviewed_at,
        platform: a.platform,
        image_url: meta.image_url ?? null,
        scheduledFor: cal?.scheduled_for ?? a.scheduled_for ?? null,
        postUrl: meta.platform_post_url ?? null,
        display: approvalDisplay(a, live, formatWhen),
        previewPlatform: normalizePlatform(a.platform ?? cal?.platform ?? null),
      };
    });
  }, [approvals, calendar]);

  const platformCounts = useMemo(() => {
    const acc: Record<PreviewPlatform, number> = { facebook: 0, instagram: 0, twitter: 0, linkedin: 0, other: 0 };
    for (const i of items) acc[i.previewPlatform] += 1;
    return acc;
  }, [items]);

  const visible = useMemo(
    () => (platformFilter === "all" ? items : items.filter((i) => i.previewPlatform === platformFilter)),
    [items, platformFilter],
  );

  // Soonest deadline first for the review queue; newest first for history.
  const byBucket = useMemo(() => {
    const out: Record<ApprovalBucket, ReviewItem[]> = { review: [], upcoming: [], live: [], attention: [] };
    for (const i of visible) out[i.display.bucket].push(i);
    const when = (i: ReviewItem) => (i.scheduledFor ? new Date(i.scheduledFor).getTime() : Number.MAX_SAFE_INTEGER);
    out.review.sort((a, b) => when(a) - when(b));
    out.upcoming.sort((a, b) => when(a) - when(b));
    return out;
  }, [visible]);

  const activeBucket: ApprovalBucket =
    bucket ?? (byBucket.review.length ? "review" : byBucket.upcoming.length ? "upcoming" : byBucket.attention.length ? "attention" : "live");

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const queue = byBucket.review;
  const queueIndex = selected ? queue.findIndex((i) => i.id === selected.id) : -1;

  const finishOnboardingStep = () => {
    completeWorkflowStep(clientAccountId, "client_approval")
      .then((completed) => {
        if (completed) {
          queryClient.invalidateQueries({ queryKey: ["onboarding-complete", clientAccountId] });
          queryClient.invalidateQueries({ queryKey: ["client-workflow", clientAccountId] });
          // Last onboarding step -- take them Home to see the "all done" state.
          onTabChange?.("activity");
        }
      })
      .catch((e) => console.error("Failed to complete approval workflow step:", e));
  };

  // After acting on a post, move straight to the next one waiting for review.
  const advanceFrom = (id: string) => {
    const idx = queue.findIndex((i) => i.id === id);
    const next = queue.find((i, n) => i.id !== id && n > idx) ?? queue.find((i) => i.id !== id);
    if (next) setSelectedId(next.id);
    else {
      setSelectedId(null);
      toast({ title: "All caught up", description: "Nothing else is waiting for your review." });
    }
  };

  const callHandleApproval = async (approvalId: string, action: "approved" | "changes_requested" | "rejected", feedback?: string) => {
    const { data, error } = await supabase.functions.invoke("handle-approval", { body: { approval_id: approvalId, action, feedback } });
    if (error || data?.error) {
      const msg = await getEdgeErrorMessage(error, data);
      throw new Error(msg ? friendlyEdgeMessage(msg) : "Something went wrong. Please try again.");
    }
  };

  const handleApprove = async (id: string) => {
    const target = approvals.find((a) => a.id === id);
    if (!target || !hasCaption(target)) return;
    setSubmitting(true);
    try {
      await callHandleApproval(id, "approved");
      setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: "approved", publish_status: "queued", reviewed_at: new Date().toISOString() } : a)));
      const planned = items.find((i) => i.id === id)?.scheduledFor;
      const pastDue = !planned || new Date(planned).getTime() <= Date.now();
      toast({ title: "Approved", description: pastDue ? "It will be published shortly." : "It's scheduled and will go out at its planned time." });
      advanceFrom(id);
      finishOnboardingStep();
      fetchApprovals();
    } catch (error) {
      toast({ title: "Couldn't approve", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestChanges = async (id: string, note: string) => {
    setSubmitting(true);
    try {
      await callHandleApproval(id, "changes_requested", note);
      setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: "changes_requested", feedback: note, reviewed_at: new Date().toISOString() } : a)));
      toast({ title: "Feedback sent", description: "Our team will revise it and send it back for your review." });
      advanceFrom(id);
    } catch (error) {
      toast({ title: "Couldn't send feedback", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async (id: string) => {
    setSubmitting(true);
    try {
      await callHandleApproval(id, "rejected");
      setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: "rejected", reviewed_at: new Date().toISOString() } : a)));
      toast({ title: "Won't be posted", description: "This post has been declined." });
      advanceFrom(id);
    } catch (error) {
      toast({ title: "Couldn't update", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Approves every post currently in the (platform-filtered) review queue that
  // has a real caption. Same handle-approval call as the single flow, fanned out.
  const approvable = queue.filter(hasCaption);
  const handleApproveAll = async () => {
    setConfirmBulk(false);
    if (approvable.length === 0) return;
    setBulkApproving(true);
    try {
      const results = await Promise.allSettled(approvable.map((a) => callHandleApproval(a.id, "approved")));
      const ok = new Set(approvable.filter((_, i) => results[i].status === "fulfilled").map((a) => a.id));
      const failed = approvable.length - ok.size;
      setApprovals((prev) => prev.map((a) => (ok.has(a.id) ? { ...a, status: "approved", publish_status: "queued", reviewed_at: new Date().toISOString() } : a)));
      if (ok.size > 0) {
        toast({
          title: failed > 0 ? `${ok.size} approved, ${failed} failed` : `${ok.size} post${ok.size === 1 ? "" : "s"} approved`,
          description: failed > 0 ? "Try again for the ones that failed." : "They'll go out at their planned times.",
          variant: failed > 0 ? "destructive" : "default",
        });
        finishOnboardingStep();
        fetchApprovals();
      } else {
        toast({ title: "Approval failed", description: "Nothing was approved. Please try again.", variant: "destructive" });
      }
    } finally {
      setBulkApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const nextDue = queue.find((i) => i.scheduledFor);
  const nextDueRel = nextDue?.scheduledFor ? relativeUntil(nextDue.scheduledFor) : null;
  const list = byBucket[activeBucket];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Content Approvals</h2>
        <p className="text-muted-foreground">
          {queue.length > 0
            ? `${queue.length} item${queue.length === 1 ? "" : "s"} waiting for your review${nextDueRel ? ` — the first is due ${nextDueRel.text}` : ""}.`
            : "Review and approve content before it goes live."}
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            {approvalStepPending ? (
              <>
                <Loader2 className="h-12 w-12 mx-auto text-primary mb-4 animate-spin" />
                <h3 className="text-lg font-medium text-foreground">Your First Draft is Being Prepared</h3>
                <p className="text-muted-foreground mt-1">We're generating your introductory content. It will appear here in a moment — refresh if it doesn't show up.</p>
              </>
            ) : (
              <>
                <FileCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground">No Content to Review</h3>
                <p className="text-muted-foreground">Content items will appear here when they need your approval.</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stage tabs */}
          <div role="tablist" aria-label="Approval stage" className="flex flex-wrap gap-1 border-b">
            {BUCKETS.map((b) => {
              const count = byBucket[b.key].length;
              const active = activeBucket === b.key;
              return (
                <button
                  key={b.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setBucket(b.key)}
                  className={cn(
                    "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2",
                    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {b.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      b.key === "review" && count > 0 ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Platform filter + bulk action */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(["all", ...(Object.keys(PLATFORM_CONFIG) as PreviewPlatform[])] as PlatformFilter[]).map((key) => {
                if (key !== "all" && platformCounts[key] === 0) return null;
                if (key === "all" && Object.values(platformCounts).filter((n) => n > 0).length < 2) return null;
                const Icon = key === "all" ? null : PLATFORM_CONFIG[key].icon;
                const active = platformFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setPlatformFilter(key)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
                    )}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    {key === "all" ? "All platforms" : PLATFORM_CONFIG[key].label}
                  </button>
                );
              })}
            </div>
            {activeBucket === "review" && approvable.length > 1 && (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={bulkApproving} onClick={() => setConfirmBulk(true)}>
                {bulkApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                Approve all ({approvable.length})
              </Button>
            )}
          </div>

          {list.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                {activeBucket === "review" ? <PartyPopper className="h-10 w-10 mx-auto text-emerald-600 mb-3" /> : <FileCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />}
                <p className="text-muted-foreground">{BUCKETS.find((b) => b.key === activeBucket)!.empty}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((item) => (
                <ApprovalCard key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />
              ))}
            </div>
          )}
        </>
      )}

      <ApprovalReviewDialog
        item={selected}
        businessName={businessName}
        position={queueIndex >= 0 ? queueIndex + 1 : 0}
        queueSize={queueIndex >= 0 ? queue.length : 0}
        busy={submitting}
        onClose={() => setSelectedId(null)}
        onPrev={queueIndex > 0 ? () => setSelectedId(queue[queueIndex - 1].id) : undefined}
        onNext={queueIndex >= 0 && queueIndex < queue.length - 1 ? () => setSelectedId(queue[queueIndex + 1].id) : undefined}
        onApprove={handleApprove}
        onRequestChanges={handleRequestChanges}
        onDecline={handleDecline}
      />

      <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {approvable.length} posts?</AlertDialogTitle>
            <AlertDialogDescription>
              Each one will be scheduled for its planned date.
              {queue.length > approvable.length && ` ${queue.length - approvable.length} without a finished caption will be skipped.`}
              {" "}You can open any of them first if you'd like to read it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveAll}>Approve all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
