-- Quick Analysis report email is now sent server-side by analyze-website.
-- report_sent_at is the idempotency stamp: send-prospect-report claims it
-- atomically before sending, so a retry or double-call never emails twice.
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS report_sent_at timestamptz;

COMMENT ON COLUMN public.prospects.report_sent_at IS
  'When the Quick Analysis report email (PDF) was sent to this prospect. NULL = not sent yet.';
