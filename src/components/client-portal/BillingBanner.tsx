import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { graceDeadline, useBilling, useBillingActions } from "@/hooks/use-billing";

interface BillingBannerProps {
  clientAccountId: string;
  onOpenBilling: () => void;
}

/**
 * Portal-wide notice when billing needs attention: payment failed (still in
 * grace), services paused, or no subscription yet.
 */
export function BillingBanner({ clientAccountId, onOpenBilling }: BillingBannerProps) {
  const { data: billing } = useBilling(clientAccountId);
  const { busy, subscribe, manageBilling } = useBillingActions(clientAccountId);
  if (!billing) return null;
  // Pending signups haven't been activated yet and cancelled accounts are intentional.
  if (billing.status === "pending" || billing.status === "cancelled") return null;

  const paused = billing.status === "paused" && billing.paused_for_billing;
  const pastDue = billing.subscription_status === "past_due";
  const needsSubscription = ["none", "incomplete", "canceled", "unpaid"].includes(billing.subscription_status);
  if (!paused && !pastDue && !needsSubscription) return null;

  const deadline = graceDeadline(billing);
  let message: string;
  let action: { label: string; onClick: () => void; loading: boolean };

  if (paused) {
    message = "Your services are paused because payment hasn't been received. They resume automatically once you're subscribed.";
  } else if (pastDue) {
    message = deadline
      ? `Your last payment failed. Update your card by ${format(deadline, "MMM d, h:mm a")} to keep your services running.`
      : "Your last payment failed. Update your card to keep your services running.";
  } else {
    message = "Start your subscription to keep your services running.";
  }

  // Past-due/unpaid subscriptions are fixed by updating the card; everything
  // else needs a (new) checkout.
  if (billing.stripe_customer_id && (pastDue || billing.subscription_status === "unpaid")) {
    action = { label: "Update payment method", onClick: manageBilling, loading: busy === "portal" };
  } else {
    action = { label: "Subscribe now", onClick: () => subscribe(), loading: busy === "checkout" };
  }

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 sm:flex-row sm:items-center">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={action.onClick} disabled={action.loading}>
          {action.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
          {action.label}
        </Button>
        <Button size="sm" variant="outline" onClick={onOpenBilling}>
          View billing
        </Button>
      </div>
    </div>
  );
}
