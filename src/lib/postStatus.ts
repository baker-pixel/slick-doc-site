// One place that turns a content_calendar row into what the UI shows, so the
// portal and admin never print a raw internal status ("processing", "approved")
// or call a post Published before the platform has actually confirmed it.

export type PostDisplayKey = "draft" | "approved" | "scheduled" | "sending" | "published" | "failed";

export interface PostDisplay {
  key: PostDisplayKey;
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  // Extra context for a tooltip / small caption; undefined when nothing to add.
  note?: string;
}

interface PostLike {
  status: string;
  published_at?: string | null;
  scheduled_for?: string | null;
  metadata?: Record<string, unknown> | null;
}

// Post for Me accepts a post first and the platform answers shortly after.
// Inside this window an unconfirmed post is still "Sending", not "Published".
const CONFIRM_WINDOW_MS = 60 * 60 * 1000;

export function postDisplayStatus(post: PostLike, now: number = Date.now()): PostDisplay {
  const meta = post.metadata ?? {};

  switch (post.status) {
    case "failed":
      return { key: "failed", label: "Failed", variant: "destructive" };

    // "processing" is the internal claim while a publish run is in flight.
    case "processing":
      return { key: "sending", label: "Sending", variant: "secondary", note: "Being sent to the platform" };

    case "published": {
      if (meta.publish_confirmed_at) return { key: "published", label: "Published", variant: "default" };
      if (meta.publish_verification === "manual") {
        return { key: "published", label: "Posted manually", variant: "default", note: "An admin marked this as posted outside the system" };
      }
      // Never call a post Published while its slot is still in the future and
      // nothing confirms it went out -- it hasn't been posted yet.
      if (post.scheduled_for && new Date(post.scheduled_for).getTime() > now + CONFIRM_WINDOW_MS) {
        return { key: "scheduled", label: "Scheduled", variant: "secondary", note: "Goes out at its scheduled time" };
      }
      if (meta.publish_verification === "unavailable") {
        return { key: "published", label: "Published", variant: "default", note: "Sent, but the platform's confirmation isn't available" };
      }
      const sentAt = post.published_at ? new Date(post.published_at).getTime() : now;
      if (now - sentAt < CONFIRM_WINDOW_MS) {
        return { key: "sending", label: "Sending", variant: "secondary", note: "Accepted for publishing — waiting for the platform to confirm" };
      }
      return { key: "published", label: "Published", variant: "default", note: "Awaiting platform confirmation" };
    }

    case "scheduled":
      return { key: "scheduled", label: "Scheduled", variant: "secondary" };
    case "approved":
      return { key: "approved", label: "Approved", variant: "default" };
    default:
      return { key: "draft", label: "Draft", variant: "outline" };
  }
}
