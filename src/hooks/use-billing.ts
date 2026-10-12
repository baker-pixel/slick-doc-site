import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { toast } from "@/hooks/use-toast";

// Keep in sync with GRACE_DAYS in supabase/functions/_shared/billingGate.ts.
export const BILLING_GRACE_DAYS = 2;

export interface BillingState {
  tier: string;
  status: string;
  subscription_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  payment_failed_at: string | null;
  paused_for_billing: boolean;
  stripe_customer_id: string | null;
}

export function hasLiveSubscription(b: BillingState | null | undefined): boolean {
  return b?.subscription_status === "active" || b?.subscription_status === "trialing" ||
    b?.subscription_status === "past_due";
}

export function graceDeadline(b: BillingState): Date | null {
  if (!b.payment_failed_at) return null;
  return new Date(new Date(b.payment_failed_at).getTime() + BILLING_GRACE_DAYS * 86400000);
}

/** `poll` re-reads quickly after returning from Stripe, while the webhook lands. */
export function useBilling(clientAccountId: string | undefined, poll = false) {
  return useQuery({
    queryKey: ["billing", clientAccountId],
    enabled: !!clientAccountId,
    refetchInterval: poll ? 3000 : 60000,
    queryFn: async (): Promise<BillingState> => {
      const { data, error } = await supabase
        .from("client_accounts")
        .select(
          "tier, status, subscription_status, current_period_end, cancel_at_period_end, payment_failed_at, paused_for_billing, stripe_customer_id",
        )
        .eq("id", clientAccountId!)
        .single();
      if (error) throw error;
      return data as BillingState;
    },
  });
}

export function useBillingActions(clientAccountId: string) {
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const queryClient = useQueryClient();

  const redirectVia = async (fn: "stripe-create-checkout" | "stripe-billing-portal", kind: "checkout" | "portal", extra = {}) => {
    setBusy(kind);
    try {
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { client_account_id: clientAccountId, origin: window.location.origin, ...extra },
      });
      const msg = await getEdgeErrorMessage(error, data);
      if (msg || !data?.url) {
        toast({ title: "Couldn't open billing", description: friendlyEdgeMessage(msg || "No billing link returned"), variant: "destructive" });
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      console.error(`${fn} failed:`, e);
      toast({ title: "Couldn't open billing", description: "Please try again.", variant: "destructive" });
    } finally {
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: ["billing", clientAccountId] });
    }
  };

  return {
    busy,
    subscribe: (tier?: string) => redirectVia("stripe-create-checkout", "checkout", tier ? { tier } : {}),
    manageBilling: () => redirectVia("stripe-billing-portal", "portal"),
  };
}
