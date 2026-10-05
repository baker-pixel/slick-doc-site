import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle, ChevronLeft, ChevronRight, Loader2, MessageSquare, AlertTriangle, Clock, ExternalLink, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ContentRenderer, getContentTypeConfig, hasCaption } from "./ContentRenderer";
import { SocialPostPreview, extractSocialCopy, type PreviewPlatform } from "./SocialPostPreview";
import { TONE_CLASSES, formatWhen, relativeUntil, type ApprovalDisplay } from "./approvalStatus";

export interface ReviewItem {
  id: string;
  title: string;
  content_type: string;
  content_preview: string | null;
  full_content: string | null;
  status: string;
  feedback: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  platform: string | null;
  image_url?: string | null;
  // Resolved by the tab from the calendar row (falls back to the approval's own value).
  scheduledFor: string | null;
  postUrl: string | null;
  display: ApprovalDisplay;
  previewPlatform: PreviewPlatform;
}

interface Props {
  item: ReviewItem | null;
  businessName: string;
  // 1-based position within the review queue (0 when the item isn't in it).
  position: number;
  queueSize: number;
  busy: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onApprove: (id: string) => void;
  onRequestChanges: (id: string, note: string) => void;
  onDecline: (id: string) => void;
}

const QUICK_REASONS = ["Tone doesn't sound like us", "Wrong or poor image", "Facts need fixing", "Too long", "Wrong timing", "Off-topic"];

const isSocial = (t: string) => ["social_post", "social_media"].includes(t.toLowerCase().replace(/\s+/g, "_"));

export function ApprovalReviewDialog({
  item, businessName, position, queueSize, busy, onClose, onPrev, onNext, onApprove, onRequestChanges, onDecline,
}: Props) {
  const [mode, setMode] = useState<"review" | "changes">("review");
  const [note, setNote] = useState("");
  const [confirmDecline, setConfirmDecline] = useState(false);

  // Fresh state whenever a different post comes up (e.g. auto-advance).
  useEffect(() => {
    setMode("review");
    setNote(item?.feedback ?? "");
    setConfirmDecline(false);
  }, [item?.id]);

  // ← / → move through the queue. Deliberately no key for Approve: a stray
  // keypress must never publish something.
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onPrev, onNext]);

  const social = item ? isSocial(item.content_type) : false;
  const copy = useMemo(() => (item && social ? extractSocialCopy(item.full_content || item.content_preview) : null), [item, social]);

  if (!item) return null;

  const typeConfig = getContentTypeConfig(item.content_type);
  const pending = item.status === "pending";
  const canApprove = hasCaption(item);
  const when = item.scheduledFor ? relativeUntil(item.scheduledFor) : null;
  const noteOk = note.trim().length > 0;

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-5xl w-[calc(100vw-1.5rem)] p-0 gap-0 max-h-[92vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <DialogTitle className="text-lg leading-snug truncate">{item.title}</DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className={cn("border-0", typeConfig.bgColor, typeConfig.color)}>{typeConfig.label}</Badge>
                <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 font-medium", TONE_CLASSES[item.display.tone])}>
                  {item.display.label}
                </span>
                <span className="text-muted-foreground">Submitted {format(new Date(item.submitted_at), "MMM d 'at' h:mm a")}</span>
              </DialogDescription>
            </div>
            {pending && queueSize > 1 && (
              <div className="flex items-center gap-1 shrink-0 mr-6">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrev} disabled={!onPrev || busy} aria-label="Previous post">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums min-w-[3.5rem] text-center">{position} of {queueSize}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext} disabled={!onNext || busy} aria-label="Next post">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid md:grid-cols-[minmax(0,1fr)_320px]">
              <div className="p-5 bg-muted/30">
                {social && copy ? (
                  <SocialPostPreview
                    platform={item.previewPlatform}
                    businessName={businessName}
                    text={copy.text}
                    hashtags={copy.hashtags}
                    imageUrl={item.image_url}
                    whenLabel={item.scheduledFor ? formatWhen(item.scheduledFor) : null}
                  />
                ) : (
                  <div className="rounded-xl border bg-card p-4 max-w-2xl mx-auto">
                    <ContentRenderer content={item.full_content || item.content_preview} contentType={item.content_type} />
                  </div>
                )}
              </div>

              <aside className="p-5 space-y-5 border-t md:border-t-0 md:border-l">
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">When it goes out</h4>
                  {item.scheduledFor ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {formatWhen(item.scheduledFor)}
                      </p>
                      {pending && when && (
                        <p className={cn("text-xs", when.urgent ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground")}>
                          {when.past ? "The planned time has passed — approve to publish it." : `Review needed — it's due ${when.text}.`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">We'll pick the best time once you approve.</p>
                  )}
                  {!pending && item.display.detail && <p className="text-xs text-muted-foreground mt-2">{item.display.detail}</p>}
                  {item.postUrl && (
                    <a href={item.postUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                      View live post <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </section>

                {!canApprove && pending && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    The caption is still being written, so this can't be approved yet. It will update here automatically.
                  </div>
                )}

                {item.feedback && !pending && (
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Your feedback</h4>
                    <div className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{item.feedback}</div>
                    {item.reviewed_at && <p className="text-xs text-muted-foreground mt-1.5">Sent {format(new Date(item.reviewed_at), "MMM d 'at' h:mm a")}</p>}
                  </section>
                )}

                {pending && mode === "changes" && (
                  <section className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" /> What should change?
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setNote((n) => (n.includes(r) ? n : n ? `${n}\n${r}` : r))}
                          className="text-xs rounded-full border px-2.5 py-1 hover:bg-muted transition-colors"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <Textarea
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Tell us what to change — we'll revise it and send it back to you."
                      rows={5}
                      className="resize-none"
                    />
                  </section>
                )}
              </aside>
            </div>
          </div>

          {/* Sticky action bar */}
          {pending && (
            <div className="border-t bg-background px-5 py-3 flex flex-wrap items-center gap-2 justify-between">
              {mode === "review" ? (
                <>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setMode("changes")} disabled={busy}>
                      <MessageSquare className="h-4 w-4 mr-2" /> Request changes
                    </Button>
                    <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirmDecline(true)} disabled={busy}>
                      <Ban className="h-4 w-4 mr-2" /> Don't post this
                    </Button>
                  </div>
                  <Button onClick={() => onApprove(item.id)} disabled={busy || !canApprove} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    {item.scheduledFor && !(when?.past) ? "Approve & schedule" : "Approve"}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setMode("review")} disabled={busy}>Back</Button>
                  <Button onClick={() => onRequestChanges(item.id, note.trim())} disabled={busy || !noteOk}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Send feedback
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDecline} onOpenChange={setConfirmDecline}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Don't post this?</AlertDialogTitle>
            <AlertDialogDescription>
              It won't be published and our team won't revise it. If you'd like a different version instead, choose "Request changes".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmDecline(false); onDecline(item.id); }}>Don't post</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
