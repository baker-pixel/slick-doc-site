-- Per-IP rate limiting for public unauthenticated endpoints (starting with
-- the self-serve signup form). No existing rate-limit mechanism in the
-- codebase (checked: no Deno KV usage, no rate_limit table) -- this follows
-- the same table + timestamp-window-count style as discoveryCooldown.ts's
-- client_usage check, just keyed by IP instead of client_id.
CREATE TABLE public.signup_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL DEFAULT 'signup',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_signup_rate_limits_lookup
  ON public.signup_rate_limits (ip_address, endpoint, created_at);

-- RLS enabled with no policies: only the service role (used exclusively by
-- the signup edge function) can read/write this table, matching the
-- lockdown pattern in 20260703000000_rls_lockdown_unused_public_policies.sql.
ALTER TABLE public.signup_rate_limits ENABLE ROW LEVEL SECURITY;
