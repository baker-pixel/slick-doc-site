import { useEffect, useState } from "react";
import { ArrowRight, Clock, CreditCard, Loader2, PauseCircle, Rocket, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { graceDeadline, useBilling, useBillingActions } from "@/hooks/use-billing";

interface BillingBannerProps {
  clientAccountId: string;
  onOpenBilling: () => void;
}

type Tone = "critical" | "warning" | "info";

// One palette per severity: soft gradient surface, tinted icon tile, and a
// solid primary button in the same hue. Dark-mode variants keep contrast.
const TONES: Record<Tone, { surface: string; accent: string; tile: string; chip: string; button: string; link: string }> = {
  critical: {
    surface: "border-rose-200 bg-gradient-to-r from-rose-50 via-white to-white dark:border-rose-900/60 dark:from-rose-950/40 dark:via-card dark:to-card",
    accent: "bg-rose-500",
    tile: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
    button: "bg-rose-600 text-white shadow-sm shadow-rose-600/25 hover:bg-rose-700 focus-visible:ring-rose-500",
    link: "text-rose-700 hover:text-rose-800 dark:text-rose-300 dark:hover:text-rose-200",
  },
  warning: {
    surface: "border-amber-200 bg-gradient-to-r from-amber-50 via-white to-white dark:border-amber-900/60 dark:from-amber-950/40 dark:via-card dark:to-card",
    accent: "bg-amber-500",
    tile: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    button: "bg-amber-500 text-white shadow-sm shadow-amber-500/30 hover:bg-amber-600 focus-visible:ring-amber-500",
    link: "text-amber-800 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-200",
  },
  info: {
    surface: "border-orange-200 bg-gradient-to-r from-orange-50 via-white to-white dark:border-orange-900/60 dark:from-orange-950/40 dark:via-card dark:to-card",
    accent: "bg-primary",
    tile: "bg-orange-100 text-primary dark:bg-orange-900/40 dark:text-orange-300",
    chip: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
    button: "bg-primary text-primary-foreground shadow-sm shadow-primary/30 hover:bg-primary/90",
    link: "text-orange-700 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200",
  },
};

/** "1d 4h left" / "5h 12m left" / "under 1m left" until the grace window closes. */
function timeLeft(deadline: Date, now: number): string {
  const ms = deadline.getTime() - now;
  if (ms <= 0) return "Grace period ended";
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return m > 0 ? `${m}m left` : "under 1m left";
}

/**
 * Portal-wide notice when billing needs attention: services paused, payment
 * failed (still in grace), or no subscription yet.
 */
export function BillingBanner({ clientAccountId, onOpenBilling }: BillingBannerProps) {
  const { data: billing } = useBilling(clientAccountId);
  const { busy, subscribe, manageBilling } = useBillingActions(clientAccountId);
  const [now, setNow] = useState(() => Date.now());

  // Keep the countdown fresh without re-fetching.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  if (!billing) return null;
  // Pending signups haven't been activated yet and cancelled accounts are intentional.
  if (billing.status === "pending" || billing.status === "cancelled") return null;

  const paused = billing.status === "paused" && billing.paused_for_billing;
  const pastDue = billing.subscription_status === "past_due";
  const needsSubscription = ["none", "incomplete", "canceled", "unpaid"].includes(billing.subscription_status);
  if (!paused && !pastDue && !needsSubscription) return null;

  const deadline = pastDue ? graceDeadline(billing) : null;

  let tone: Tone;
  let Icon = ShieldAlert;
  let title: string;
  let message: string;

  if (paused) {
    tone = "critical";
    Icon = PauseCircle;
    title = "Your services are paused";
    message = "We haven't received payment, so your agents have stopped working. They restart automatically the moment you're subscribed.";
  } else if (pastDue) {
    tone = "warning";
    Icon = ShieldAlert;
    title = "Your last payment didn't go through";
    message = deadline
      ? `Update your card by ${format(deadline, "MMM d 'at' h:mm a")} to keep everything running without interruption.`
      : "Update your card to keep everything running without interruption.";
  } else {
    tone = "info";
    Icon = Rocket;
    title = "Start your subscription";
    message = "Subscribe to activate your agents and keep your services running.";
  }

  // Past-due/unpaid subscriptions are fixed by updating the card; everything
  // else needs a (new) checkout.
  const fixCard = !!billing.stripe_customer_id && (pastDue || billing.subscription_status === "unpaid");
  const action = fixCard
    ? { label: "Update payment method", onClick: manageBilling, loading: busy === "portal" }
    : { label: paused ? "Reactivate services" : "Subscribe now", onClick: () => subscribe(), loading: busy === "checkout" };

  const t = TONES[tone];

  return (
    <div
      role="alert"
      className={cn("relative mb-6 overflow-hidden rounded-xl border shadow-sm", t.surface)}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", t.accent)} aria-hidden />
      <div className="flex flex-col gap-4 py-4 pl-6 pr-4 sm:flex-row sm:items-center sm:gap-5">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", t.tile)}>
          <Icon className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold leading-tight text-foreground">{title}</h3>
            {deadline && (
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", t.chip)}>
                <Clock className="h-3 w-3" />
                {timeLeft(deadline, now)}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Button
            onClick={action.onClick}
            disabled={action.loading || busy !== null}
            className={cn("h-10 w-full rounded-lg px-5 font-semibold transition-all sm:w-auto", t.button)}
          >
            {action.loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-2 h-4 w-4" />
            )}
            {action.label}
          </Button>
          <button
            type="button"
            onClick={onOpenBilling}
            className={cn("group inline-flex items-center justify-center gap-1 text-sm font-medium transition-colors sm:justify-end", t.link)}
          >
            View billing details
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
