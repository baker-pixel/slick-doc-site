import { useState } from "react";
import { Facebook, Instagram, Linkedin, Twitter, Globe, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { cleanMarkdownMarks, parseContentSafely } from "./ContentRenderer";

export type PreviewPlatform = "facebook" | "instagram" | "linkedin" | "twitter" | "other";

// Pulls the human-readable post text (and hashtags) out of either a plain
// caption or the JSON shape some generators store.
export function extractSocialCopy(raw: string | null): { text: string; hashtags: string[] } {
  if (!raw) return { text: "", hashtags: [] };
  const parsed = parseContentSafely(raw);
  if (typeof parsed === "string") return { text: cleanMarkdownMarks(parsed).trim(), hashtags: [] };
  const text = parsed?.caption ?? parsed?.post ?? parsed?.content ?? parsed?.text ?? "";
  const tags = parsed?.hashtags
    ? (Array.isArray(parsed.hashtags) ? parsed.hashtags : String(parsed.hashtags).split(/\s+/))
    : [];
  return {
    text: cleanMarkdownMarks(String(text)).trim(),
    hashtags: tags.filter(Boolean).map((t: string) => (t.startsWith("#") ? t : `#${t}`)),
  };
}

const PLATFORM_META: Record<PreviewPlatform, { label: string; Icon: React.ComponentType<{ className?: string }>; limit?: number; imageRatio: string; collapseAt: number }> = {
  facebook: { label: "Facebook", Icon: Facebook, imageRatio: "aspect-[1.91/1]", collapseAt: 480 },
  instagram: { label: "Instagram", Icon: Instagram, imageRatio: "aspect-square", collapseAt: 125 },
  linkedin: { label: "LinkedIn", Icon: Linkedin, imageRatio: "aspect-[1.91/1]", collapseAt: 210 },
  twitter: { label: "X", Icon: Twitter, limit: 280, imageRatio: "aspect-[16/9]", collapseAt: 10_000 },
  other: { label: "Post", Icon: Globe, imageRatio: "aspect-[1.91/1]", collapseAt: 10_000 },
};

interface Props {
  platform: PreviewPlatform;
  businessName: string;
  text: string;
  hashtags: string[];
  imageUrl?: string | null;
  whenLabel?: string | null;
}

// A faithful-enough mock of how the post will appear, so a client judges the
// real thing (caption length, image crop, character limit) instead of a wall
// of raw text. Non-interactive: the only controls on this screen are the
// approval actions.
export function SocialPostPreview({ platform, businessName, text, hashtags, imageUrl, whenLabel }: Props) {
  const meta = PLATFORM_META[platform];
  const [expanded, setExpanded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const fullText = hashtags.length && !hashtags.every((h) => text.includes(h)) ? `${text}\n\n${hashtags.join(" ")}` : text;
  const overLimit = meta.limit ? fullText.length > meta.limit : false;
  const collapsible = fullText.length > meta.collapseAt;
  const shown = collapsible && !expanded ? `${fullText.slice(0, meta.collapseAt).trimEnd()}…` : fullText;
  const initial = (businessName.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden max-w-xl mx-auto w-full" aria-label={`${meta.label} preview`}>
      <div className="flex items-center gap-3 p-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight truncate">{businessName}</p>
          <p className="text-xs text-muted-foreground truncate">{whenLabel ?? "Draft"} · {meta.label}</p>
        </div>
        <meta.Icon className="h-5 w-5 text-muted-foreground shrink-0" />
      </div>

      <div className="px-3 pb-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
        {shown || <span className="text-muted-foreground italic">No caption yet</span>}
        {collapsible && (
          <button type="button" className="ml-1 text-muted-foreground hover:text-foreground font-medium" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : "See more"}
          </button>
        )}
      </div>

      {imageUrl && !imgFailed ? (
        <img src={imageUrl} alt="Image attached to this post" className={cn("w-full object-cover bg-muted", meta.imageRatio)} onError={() => setImgFailed(true)} />
      ) : imageUrl && imgFailed ? (
        <div className={cn("w-full bg-muted flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground", meta.imageRatio)}>
          <ImageOff className="h-5 w-5" /> Image couldn't be loaded
        </div>
      ) : platform === "instagram" ? (
        <div className={cn("w-full bg-muted flex items-center justify-center text-xs text-muted-foreground", meta.imageRatio)}>
          Instagram needs an image — one is still being created
        </div>
      ) : null}

      {meta.limit && (
        <div className={cn("px-3 py-2 border-t text-xs", overLimit ? "text-destructive font-medium" : "text-muted-foreground")}>
          {fullText.length}/{meta.limit} characters{overLimit ? " — over the limit, this will be shortened" : ""}
        </div>
      )}
    </div>
  );
}
