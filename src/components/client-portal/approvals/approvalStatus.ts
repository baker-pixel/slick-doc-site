import { postDisplayStatus } from "@/lib/postStatus";

// What the calendar row behind an approval says. content_approvals.publish_status
// is set to "queued" once at approval time and never updated, so it can't be
// trusted for "is this live?" -- the calendar row is the source of truth.
export interface ApprovalLive {
  calStatus?: string | null;
  scheduledFor?: string | null;
  publishedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

export type ApprovalKey =
  | "needs_review"
  | "scheduled"
  | "sending"
  | "published"
  | "failed"
  | "changes_requested"
  | "declined"
  | "approved";

export type ApprovalBucket = "review" | "upcoming" | "live" | "attention";

export interface ApprovalDisplay {
  key: ApprovalKey;
  bucket: ApprovalBucket;
  label: string;
  tone: "amber" | "blue" | "green" | "red" | "orange" | "gray";
  detail?: string;
}

export function approvalDisplay(
  approval: { status: string; scheduled_for?: string | null },
  live: ApprovalLive | undefined,
  formatWhen: (iso: string) => string,
): ApprovalDisplay {
  switch (approval.status) {
    case "pending":
      return { key: "needs_review", bucket: "review", label: "Needs your review", tone: "amber" };
    case "changes_requested":
      return { key: "changes_requested", bucket: "attention", label: "Changes requested", tone: "orange", detail: "Our team is revising this based on your notes." };
    case "rejected":
      return { key: "declined", bucket: "attention", label: "Declined", tone: "gray", detail: "This post won't be published." };
  }

  // Approved from here on: what happens next depends on the real calendar row.
  if (live?.calStatus === "failed") {
    return {
      key: "failed",
      bucket: "attention",
      label: "Couldn't publish",
      tone: "red",
      detail: "The platform rejected this post. Our team has been alerted.",
    };
  }

  if (live?.calStatus === "published" || live?.calStatus === "processing") {
    const d = postDisplayStatus({ status: live.calStatus, published_at: live.publishedAt, metadata: live.metadata });
    if (d.key === "sending") return { key: "sending", bucket: "upcoming", label: "Sending", tone: "blue", detail: d.note };
    return { key: "published", bucket: "live", label: "Published", tone: "green", detail: live.publishedAt ? `Went live ${formatWhen(live.publishedAt)}` : undefined };
  }

  const when = live?.scheduledFor ?? approval.scheduled_for ?? null;
  if (when) return { key: "scheduled", bucket: "upcoming", label: "Scheduled", tone: "blue", detail: `Goes live ${formatWhen(when)}` };
  return { key: "approved", bucket: "upcoming", label: "Approved", tone: "green", detail: "Approved — we'll schedule it shortly." };
}

export const TONE_CLASSES: Record<ApprovalDisplay["tone"], string> = {
  amber: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  blue: "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  green: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
  red: "bg-red-100 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
  orange: "bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800",
  gray: "bg-muted text-muted-foreground border-border",
};

// "Tue, Oct 27 at 9:00 AM PDT" in the viewer's own timezone.
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${day} at ${time}`;
}

// "in 2 days" / "in 5 hours" / "overdue" for urgency hints on the review queue.
export function relativeUntil(iso: string, now: number = Date.now()): { text: string; urgent: boolean; past: boolean } {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { text: "planned time has passed", urgent: true, past: true };
  const hours = ms / 3_600_000;
  if (hours < 1) return { text: "in under an hour", urgent: true, past: false };
  if (hours < 24) return { text: `in ${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`, urgent: true, past: false };
  const days = Math.round(hours / 24);
  return { text: `in ${days} day${days === 1 ? "" : "s"}`, urgent: days <= 2, past: false };
}
