ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();