import { Facebook, Instagram, Linkedin, Twitter, Clock, ImageIcon, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContentTypeConfig } from "./ContentRenderer";
import { extractSocialCopy } from "./SocialPostPreview";
import { TONE_CLASSES, formatWhen, relativeUntil } from "./approvalStatus";
import type { ReviewItem } from "./ApprovalReviewDialog";

const PLATFORM_ICON: Record<ReviewItem["previewPlatform"], React.ComponentType<{ className?: string }>> = {
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
  twitter: Twitter,
  other: LayoutGrid,
};

export function ApprovalCard({ item, onOpen }: { item: ReviewItem; onOpen: () => void }) {
  const PlatformIcon = PLATFORM_ICON[item.previewPlatform];
  const typeConfig = getContentTypeConfig(item.content_type);
  const raw = item.full_content || item.content_preview;
  const excerpt = ["social_post", "social_media"].includes(item.content_type) ? extractSocialCopy(raw).text : (item.content_preview ?? "");
  const pending = item.status === "pending";
  const when = pending && item.scheduledFor ? relativeUntil(item.scheduledFor) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group text-left w-full rounded-xl border bg-card overflow-hidden flex flex-col transition-all",
        "hover:shadow-md hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pending && when?.urgent && "border-amber-300 dark:border-amber-700",
      )}
    >
      <div className="flex gap-3 p-3">
        {item.image_url ? (
          <img src={item.image_url} alt="" loading="lazy" className="h-24 w-24 rounded-lg object-cover border shrink-0 bg-muted" />
        ) : (
          <div className="h-24 w-24 rounded-lg border bg-muted shrink-0 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-6 w-6" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <PlatformIcon className="h-3.5 w-3.5" aria-hidden />
            <span className="truncate">{item.previewPlatform === "other" ? typeConfig.label : item.platform ? item.platform.replace(/^\w/, (c) => c.toUpperCase()) : typeConfig.label}</span>
          </div>
          <p className="font-medium text-sm leading-snug line-clamp-1">{item.title}</p>
          <p className="text-sm text-muted-foreground line-clamp-2 break-words">{excerpt || "No caption yet"}</p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2">
        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", TONE_CLASSES[item.display.tone])}>
          {item.display.label}
        </span>
        {item.scheduledFor && (
          <span className={cn("inline-flex items-center gap-1 text-xs", when?.urgent ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground")}>
            <Clock className="h-3 w-3" aria-hidden />
            {pending && when ? (when.past ? "Planned time passed" : `Due ${when.text}`) : formatWhen(item.scheduledFor)}
          </span>
        )}
      </div>
    </button>
  );
}
