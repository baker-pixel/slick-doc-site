
ALTER TABLE public.client_accounts DROP CONSTRAINT client_accounts_tier_check;

UPDATE public.client_accounts SET tier = 'transformation' WHERE tier IN ('scale', 'dominate');

ALTER TABLE public.client_accounts ADD CONSTRAINT client_accounts_tier_check CHECK (tier = ANY (ARRAY['foundation'::text, 'growth'::text, 'transformation'::text]));
