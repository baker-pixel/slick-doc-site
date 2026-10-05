import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  ChevronLeft, ChevronRight, Check, Clock, Copy, Eye, MousePointerClick, Monitor, Reply, Send,
  Smartphone, UserRound, PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export interface OutreachEmail {
  drip_step: number | null;
  subject: string;
  html_content: string;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
}

export interface OutreachSender {
  name: string;
  /** null when sending from the shared Orange Door sender (no connected inbox). */
  address: string | null;
}

export interface LeadActivity {
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  reply_snippet: string | null;
}

interface Props {
  prospectName: string;
  /** The whole sequence, in send order. Only sent emails can be opened. */
  emails: OutreachEmail[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onBack: () => void;
  sender: OutreachSender;
  /** The signature name from Outreach settings; null/empty = not set up yet. */
  signatureName: string | null;
  onEditSignature: () => void;
  activity: LeadActivity;
}

const TOTAL_STEPS = 4;

const isViewable = (e: OutreachEmail) => e.status === "sent" && !!e.sent_at && !!e.html_content;

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Readable plain text from the email's HTML, for "Copy text".
function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n");
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

export function OutreachEmailViewer({
  prospectName, emails, activeIndex, onSelect, onBack, sender, signatureName, onEditSignature, activity,
}: Props) {
  const email = emails[activeIndex];
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [bodyHeight, setBodyHeight] = useState(240);
  const [copied, setCopied] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const viewableIdx = useMemo(
    () => emails.map((e, i) => (isViewable(e) ? i : -1)).filter((i) => i >= 0),
    [emails],
  );
  const pos = viewableIdx.indexOf(activeIndex);
  const prevIdx = pos > 0 ? viewableIdx[pos - 1] : null;
  const nextIdx = pos >= 0 && pos < viewableIdx.length - 1 ? viewableIdx[pos + 1] : null;
  const isLastSent = viewableIdx.length > 0 && activeIndex === viewableIdx[viewableIdx.length - 1];

  // sandbox="allow-same-origin" (no scripts) lets us measure the email's own
  // height so the whole message shows on a canvas, instead of a small box that
  // scrolls inside a dialog -- while scripts in the email still cannot run.
  const measure = () => {
    const doc = frameRef.current?.contentDocument;
    // body, not documentElement: the latter can never be shorter than the frame itself.
    if (doc?.body) setBodyHeight(Math.max(200, Math.ceil(doc.body.scrollHeight) + 24));
  };
  useEffect(() => {
    const t = setTimeout(measure, 60); // re-measure after the width change reflows the text
    return () => clearTimeout(t);
  }, [device, activeIndex]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${htmlToText(email.html_content)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Couldn't copy", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  };

  const sentAt = email.sent_at ? new Date(email.sent_at) : null;
  const senderLabel = sender.address ? `${sender.name} <${sender.address}>` : sender.name;
  const hasSignature = !!signatureName?.trim();

  const activityItems = [
    activity.opened_at && { icon: Eye, label: "Opened", at: activity.opened_at, tone: "text-sky-700 bg-sky-50 border-sky-200" },
    activity.clicked_at && { icon: MousePointerClick, label: "Clicked a link", at: activity.clicked_at, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    activity.replied_at && { icon: Reply, label: "Replied", at: activity.replied_at, tone: "text-emerald-800 bg-emerald-50 border-emerald-300" },
  ].filter(Boolean) as { icon: typeof Eye; label: string; at: string; tone: string }[];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar: back + step pager */}
      <div className="shrink-0 border-b px-5 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3 pr-8">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Back to {prospectName}
          </button>
          <div className="flex items-center gap-1">
            <Button
              type="button" variant="ghost" size="icon" className="h-7 w-7"
              disabled={prevIdx === null} onClick={() => prevIdx !== null && onSelect(prevIdx)}
              aria-label="Previous email"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button" variant="ghost" size="icon" className="h-7 w-7"
              disabled={nextIdx === null} onClick={() => nextIdx !== null && onSelect(nextIdx)}
              aria-label="Next email"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Sequence progress: sent steps are clickable, upcoming ones are not */}
        <ol className="flex items-center gap-1.5" aria-label="Email sequence">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const step = i + 1;
            const idx = emails.findIndex((e) => e.drip_step === step);
            const e = idx >= 0 ? emails[idx] : null;
            const viewable = !!e && isViewable(e);
            const current = idx === activeIndex;
            return (
              <li key={step} className="flex-1">
                <button
                  type="button"
                  disabled={!viewable}
                  onClick={() => viewable && onSelect(idx)}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "w-full rounded-md border px-2 py-1.5 text-left transition-colors",
                    current ? "border-primary bg-primary/5" : viewable ? "hover:bg-muted/50" : "opacity-60 cursor-default",
                  )}
                >
                  <div className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium">
                    {viewable ? <Check className="h-3 w-3 text-emerald-600" aria-hidden /> : <Clock className="h-3 w-3 text-muted-foreground" aria-hidden />}
                    Step {step}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {viewable && e?.sent_at
                      ? format(new Date(e.sent_at), "MMM d")
                      : e ? `Scheduled ${format(new Date(e.scheduled_for), "MMM d")}` : "Not scheduled"}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Scrollable reading area */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40 px-3 py-5 sm:px-6">
        <div className="mx-auto" style={{ maxWidth: device === "phone" ? 390 : 680 }}>
          {/* Signature nudge: the signature is what makes a cold email read as a person */}
          {!hasSignature && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="flex-1 space-y-2">
                <p className="font-medium">This email isn&apos;t signed by a person yet</p>
                <p className="text-xs text-amber-800">
                  Add your name and title in Outreach settings so new emails end with a real sign-off instead of the business name. Cold emails get more replies when they read like they came from someone.
                </p>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 border-amber-300 bg-white text-xs" onClick={onEditSignature}>
                  <PenLine className="h-3.5 w-3.5" />
                  Set up signature
                </Button>
              </div>
            </div>
          )}

          {/* Message header, like a mail client */}
          <div className="rounded-t-xl border border-b-0 bg-background px-5 pt-5 pb-4">
            <h2 className="text-lg font-semibold leading-snug">{email.subject}</h2>
            <div className="mt-3 flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                aria-hidden
              >
                {initialsOf(sender.name)}
              </span>
              <div className="min-w-0 flex-1 text-xs leading-relaxed">
                <div className="truncate"><span className="text-muted-foreground">From </span><span className="font-medium">{senderLabel}</span></div>
                <div className="truncate"><span className="text-muted-foreground">To </span><span className="font-medium">{prospectName}</span></div>
                {!sender.address && (
                  <div className="text-muted-foreground">Sent from the shared Orange Door sender. Connect your own inbox on the Lead Outreach page to send from your address.</div>
                )}
              </div>
              {sentAt && (
                <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                  <div>{format(sentAt, "MMM d, yyyy")}</div>
                  <div>{format(sentAt, "h:mm a")}</div>
                </div>
              )}
            </div>
          </div>

          {/* The message itself, exactly as the lead received it */}
          <div className="rounded-b-xl border bg-white shadow-sm">
            <iframe
              ref={frameRef}
              title={email.subject}
              sandbox="allow-same-origin"
              srcDoc={email.html_content}
              onLoad={measure}
              style={{ height: bodyHeight }}
              className="block w-full rounded-b-xl bg-white"
            />
          </div>

          {/* Toolbar under the message */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border bg-background p-0.5" role="group" aria-label="Preview size">
              {([["desktop", Monitor, "Desktop"], ["phone", Smartphone, "Phone"]] as const).map(([key, Icon, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDevice(key)}
                  aria-pressed={device === key}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    device === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={copyText}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy text"}
            </Button>
          </div>

          {/* What the lead did */}
          {activityItems.length > 0 && (
            <section className="mt-4" aria-label="Lead activity">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lead activity</h3>
              <ul className="flex flex-wrap gap-2">
                {activityItems.map(({ icon: Icon, label, at, tone }) => (
                  <li key={label} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", tone)}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label} · {format(new Date(at), "MMM d")}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Their reply, shown after the last email we sent */}
          {isLastSent && activity.reply_snippet && (
            <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4" aria-label="Their reply">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium text-emerald-800">
                <Reply className="h-4 w-4" aria-hidden />
                {prospectName} replied
                {activity.replied_at && (
                  <span className="text-xs font-normal text-emerald-700/80">{format(new Date(activity.replied_at), "MMM d, yyyy 'at' h:mm a")}</span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-emerald-950">{activity.reply_snippet}</p>
            </section>
          )}

          <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Send className="h-3 w-3" aria-hidden />
            This is the exact email your lead received.
          </p>
        </div>
      </div>
    </div>
  );
}
