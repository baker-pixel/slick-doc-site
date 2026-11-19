-- Admin-granted free access: a client with billing_bypass = true is treated as
-- entitled by the billing gate regardless of subscription_status, so engines
-- keep running (status stays 'active') without a Stripe subscription.
ALTER TABLE public.client_accounts
  ADD COLUMN IF NOT EXISTS billing_bypass boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_bypass_reason text;

-- Clients must not be able to grant themselves bypass: add it to the guard.
CREATE OR REPLACE FUNCTION public.guard_client_account_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.tier                   IS DISTINCT FROM OLD.tier
    OR NEW.plan_tier              IS DISTINCT FROM OLD.plan_tier
    OR NEW.status                 IS DISTINCT FROM OLD.status
    OR NEW.subscription_status    IS DISTINCT FROM OLD.subscription_status
    OR NEW.paused_for_billing     IS DISTINCT FROM OLD.paused_for_billing
    OR NEW.payment_failed_at      IS DISTINCT FROM OLD.payment_failed_at
    OR NEW.cancel_at_period_end   IS DISTINCT FROM OLD.cancel_at_period_end
    OR NEW.current_period_end     IS DISTINCT FROM OLD.current_period_end
    OR NEW.stripe_customer_id     IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
    OR NEW.stripe_price_id        IS DISTINCT FROM OLD.stripe_price_id
    OR NEW.billing_bypass         IS DISTINCT FROM OLD.billing_bypass
    OR NEW.billing_bypass_reason  IS DISTINCT FROM OLD.billing_bypass_reason
    THEN
      RAISE EXCEPTION 'Plan, status and billing fields can only be changed by an admin or by the billing system'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.client_accounts
SET billing_bypass = true, billing_bypass_reason = 'Complimentary access (admin-granted)'
WHERE id IN ('f0c7a878-818f-4fae-989d-64f53e6fd6cd', '6197de3a-ad41-4f94-85e6-72d9189f8791');
