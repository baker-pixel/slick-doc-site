ALTER TABLE public.client_accounts ADD COLUMN IF NOT EXISTS plan_tier text DEFAULT 'foundation';

ALTER TABLE public.client_accounts ADD CONSTRAINT client_accounts_plan_tier_check CHECK (plan_tier IN ('foundation', 'growth', 'transformation'));