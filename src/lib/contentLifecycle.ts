// One place that decides where a piece of generated content actually is.
//
// The truth is spread over three tables -- generated_content (the draft),
// content_approvals (the client's queue + decision) and content_calendar
// (scheduling/publishing) -- and generated_content.status alone is
// overloaded: "approved" is written both by the auto-forward pipeline (after
// it queues the post for the client) and by a manual admin approve, and it
// can exist with no client approval row at all. The admin UI derives a single
// stage from all three so a label never claims more than has really happened.

export type ContentStage =
  | "needs_review"      // drafted, waiting on the admin
  | "changes_requested" // client asked for changes; admin must edit + resend
  | "not_sent"          // marked approved internally but never reached the client's queue
  | "with_client"       // in the client's Approvals tab, awaiting their decision
  | "scheduled"         // client approved; waiting to publish
  | "published"
  | "failed"            // publish attempt failed
  | "rejected";

export type StageTone = "action" | "waiting" | "good" | "done" | "bad" | "muted";

export interface StageInfo {
  stage: ContentStage;
  label: string;
  tone: StageTone;
  // One line telling the admin what is going on / what happens next.
  hint: string;
  // Admin can still change the text. With the client it syncs to their copy;
  // once the client has approved, the text is locked.
  canEdit: boolean;
  canSend: boolean;
  canReject: boolean;
}

export interface ContentLike {
  status: string;
  metadata?: Record<string, unknown> | null;
}
export interface ApprovalLike {
  status: string;
  publish_status?: string | null;
  feedback?: string | null;
}
export interface CalendarLike {
  status: string;
  error_message?: string | null;
}

export const STAGE_TABS: { key: string; label: string; stages: ContentStage[] }[] = [
  { key: "action", label: "Needs action", stages: ["needs_review", "changes_requested", "not_sent"] },
  { key: "with_client", label: "With client", stages: ["with_client"] },
  { key: "scheduled", label: "Scheduled", stages: ["scheduled"] },
  { key: "published", label: "Published", stages: ["published"] },
  { key: "problems", label: "Problems", stages: ["failed", "rejected"] },
];

export function isAutoSent(content: ContentLike): boolean {
  return content.metadata?.source === "fill-scheduled-content";
}

export function contentStage(
  content: ContentLike,
  appr: ApprovalLike | undefined,
  cal: CalendarLike | undefined,
): StageInfo {
  const none = { canEdit: false, canSend: false, canReject: false };

  if (cal?.status === "published" || content.status === "published") {
    return { stage: "published", label: "Published", tone: "done", hint: "Live on the platform.", ...none };
  }
  if (cal?.status === "failed" || appr?.publish_status === "failed") {
    return {
      stage: "failed",
      label: "Publish failed",
      tone: "bad",
      hint: cal?.error_message ? `${cal.error_message} — retry from Social Media Posts.` : "Retry from Social Media Posts.",
      ...none,
    };
  }
  if (appr?.status === "approved") {
    return {
      stage: "scheduled",
      label: cal?.status === "scheduled" ? "Scheduled" : "Approved by client",
      tone: "good",
      hint: "Client approved. It publishes automatically at the scheduled time — text is locked.",
      ...none,
    };
  }
  if (appr?.status === "pending") {
    return {
      stage: "with_client",
      label: isAutoSent(content) ? "Auto-sent to client" : "Sent to client",
      tone: "waiting",
      hint: "Waiting for the client to approve. Edits you make sync to their copy.",
      canEdit: true,
      canSend: false,
      canReject: false,
    };
  }
  if (appr?.status === "changes_requested" || content.status === "changes_requested") {
    return {
      stage: "changes_requested",
      label: "Client wants changes",
      tone: "action",
      hint: appr?.feedback ? `Client said: “${appr.feedback}”` : "Edit the draft, then send it back to the client.",
      canEdit: true,
      canSend: true,
      canReject: true,
    };
  }
  if (appr?.status === "rejected" || content.status === "rejected") {
    return { stage: "rejected", label: "Rejected", tone: "bad", hint: "Rejected — won't be published.", ...none };
  }
  // No approval row from here on.
  if (content.status === "approved" || content.status === "client_approved") {
    return {
      stage: "not_sent",
      label: "Not sent to client",
      tone: "action",
      hint: "Marked approved, but it never reached the client's Approvals tab. Send it to continue.",
      canEdit: true,
      canSend: true,
      canReject: true,
    };
  }
  return {
    stage: "needs_review",
    label: "Needs your review",
    tone: "action",
    hint: "Review it, then send it to the client for sign-off.",
    canEdit: true,
    canSend: true,
    canReject: true,
  };
}
