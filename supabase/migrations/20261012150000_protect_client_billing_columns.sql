-- Security fix: the "Clients can update their own account" RLS policy lets a
-- portal user UPDATE any column of their own client_accounts row, so a client
-- could mark themselves paid (subscription_status), upgrade tier/plan_tier,
-- un-pause themselves, or repoint stripe_* ids straight from the browser.
--
-- RLS can't restrict columns, so guard them with a trigger: any caller that is
-- a signed-in non-admin may not change plan, status or billing fields.
-- Service-role/server code (auth.uid() is null) and admins are unaffected, as
-- are the fields clients legitimately edit (name, website, industry,
-- onboarded_at, ...).
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
    THEN
      RAISE EXCEPTION 'Plan, status and billing fields can only be changed by an admin or by the billing system'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_client_account_protected_columns ON public.client_accounts;
CREATE TRIGGER guard_client_account_protected_columns
  BEFORE UPDATE ON public.client_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_account_protected_columns();
