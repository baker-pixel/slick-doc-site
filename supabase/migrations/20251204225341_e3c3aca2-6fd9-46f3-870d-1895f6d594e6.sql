-- Create table to track cleaned emails
CREATE TABLE public.email_cleanup_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  reason TEXT NOT NULL,
  cleaned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB
);

-- Enable RLS
ALTER TABLE public.email_cleanup_log ENABLE ROW LEVEL SECURITY;

-- Policy for service role access
CREATE POLICY "Service role can manage cleanup_log"
  ON public.email_cleanup_log
  FOR ALL
  USING (true);

-- Add index for faster lookups
CREATE INDEX idx_email_cleanup_log_email ON public.email_cleanup_log(email);
CREATE INDEX idx_email_cleanup_log_reason ON public.email_cleanup_log(reason);