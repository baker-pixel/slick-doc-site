-- Two new terminal/hold states for the outreach drip:
--   'replied' — the prospect answered (set manually by admin for now;
--               inbound-email ingestion can set it automatically later).
--   'paused'  — admin put outreach on hold without losing drip progress.
-- run-prospect-drip only picks status='nurture', so both stop sends
-- without any drip-side change.

ALTER TABLE public.prospects
  DROP CONSTRAINT IF EXISTS prospects_status_check;

ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_status_check CHECK (status = ANY (ARRAY[
    'discovered'::text,
    'pending'::text,
    'nurture'::text,
    'converted'::text,
    'rejected'::text,
    'exhausted'::text,
    'unsubscribed'::text,
    'bounced'::text,
    'replied'::text,
    'paused'::text
  ]));
