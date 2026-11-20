import { CheckCircle, CreditCard, Loader2, Settings2 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { pricingData, type TierId } from "@/lib/pricingData";
import { graceDeadline, hasLiveSubscription, useBilling, useBillingActions } from "@/hooks/use-billing";

const TIER_LABELS: Record<string, string> = {
  foundation: "SYSTEM Foundation",
  growth: "SYSTEM Growth",
  transformation: "SYSTEM Transformation",
};

function statusBadge(status: string, pausedForBilling: boolean) {
  if (pausedForBilling) return <Badge className="bg-red-100 text-red-800">Services paused</Badge>;
  switch (status) {
    case "active":
      return <Badge className="bg-green-100 text-green-800">Active</Badge>;
    case "trialing":
      return <Badge className="bg-blue-100 text-blue-800">Trial</Badge>;
    case "past_due":
      return <Badge className="bg-red-100 text-red-800">Payment failed</Badge>;
    case "canceled":
      return <Badge className="bg-gray-100 text-gray-800">Cancelled</Badge>;
    default:
      return <Badge className="bg-yellow-100 text-yellow-800">No subscription</Badge>;
  }
}

interface BillingCardProps {
  clientAccountId: string;
  /** True right after returning from Stripe Checkout: poll until the webhook lands. */
  justCheckedOut: boolean;
}

export function BillingCard({ clientAccountId, justCheckedOut }: BillingCardProps) {
  const { data: billing, isLoading } = useBilling(clientAccountId, justCheckedOut);
  const { busy, subscribe, manageBilling } = useBillingActions(clientAccountId);

  if (isLoading || !billing) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const live = hasLiveSubscription(billing);
  const price = pricingData[billing.tier as TierId]?.price;
  const deadline = billing.subscription_status === "past_due" ? graceDeadline(billing) : null;
  const confirming = justCheckedOut && !live;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold">{TIER_LABELS[billing.tier] ?? "Your plan"}</h3>
              {statusBadge(billing.subscription_status, billing.paused_for_billing)}
            </div>
            {confirming ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Confirming your payment...
              </p>
            ) : live ? (
              <p className="text-sm text-muted-foreground">
                {billing.cancel_at_period_end
                  ? `Cancels on ${billing.current_period_end ? format(new Date(billing.current_period_end), "MMM d, yyyy") : "period end"}`
                  : billing.current_period_end
                  ? `Renews ${format(new Date(billing.current_period_end), "MMM d, yyyy")}`
                  : "Subscription active"}
                {price ? ` · $${price}/month` : ""}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Subscribe to activate your {TIER_LABELS[billing.tier] ?? "plan"} services.
              </p>
            )}
            {deadline && (
              <p className="text-sm font-medium text-red-700">
                Update your card by {format(deadline, "MMM d, h:mm a")} to avoid a pause in services.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {billing.stripe_customer_id && (
              <Button variant={live ? "default" : "outline"} onClick={manageBilling} disabled={busy !== null}>
                {busy === "portal" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Settings2 className="mr-2 h-4 w-4" />
                )}
                Manage payment methods
              </Button>
            )}
            {!live && !confirming && (
              <Button onClick={() => subscribe()} disabled={busy !== null}>
                {busy === "checkout" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                Subscribe
              </Button>
            )}
          </div>
        </div>
        {live && (
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            Update your card, switch plans, cancel, or download receipts from Manage payment methods.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
