
-- Unique business name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_accounts_business_name_unique
  ON public.client_accounts (lower(business_name));

-- Prevent duplicate active invitations for same email + account
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_invitations_active_unique
  ON public.client_invitations (email, client_account_id)
  WHERE accepted_at IS NULL;

-- Fix tier check constraint to match what the UI sends
ALTER TABLE public.client_accounts
  DROP CONSTRAINT IF EXISTS client_accounts_tier_check;
ALTER TABLE public.client_accounts
  ADD CONSTRAINT client_accounts_tier_check
  CHECK (tier IN ('foundation', 'growth', 'transformation'));

-- Drop plan_tier check if it exists
ALTER TABLE public.client_accounts
  DROP CONSTRAINT IF EXISTS client_accounts_plan_tier_check;
