-- Abuse protection for the public Quick Analysis scan (analyze-website).
-- One row per anonymous scan attempt; counted per hashed IP / email / globally.
-- RLS on with no policies = service-role only. IPs are stored hashed, not raw.
CREATE TABLE IF NOT EXISTS public.scan_rate_limits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash    text,
  email      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scan_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS scan_rate_limits_ip_created_idx    ON public.scan_rate_limits (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS scan_rate_limits_email_created_idx ON public.scan_rate_limits (email, created_at DESC);
CREATE INDEX IF NOT EXISTS scan_rate_limits_created_idx       ON public.scan_rate_limits (created_at DESC);
