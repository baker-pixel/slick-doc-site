-- Prospect engine: ICP-driven discovery + drip compliance.
--
-- icp_fit_reason: one-line LLM explanation next to icp_fit_score so the
-- admin review queue can show *why* a prospect scored the way it did.
--
-- New prospect status values used by run-prospect-drip (status is plain
-- text, no enum to alter): 'exhausted' (finished all 4 drip steps),
-- 'unsubscribed' (email_preferences opt-out), 'bounced' (hard bounce or
-- spam complaint recorded in email_logs).

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS icp_fit_reason text;

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
    'bounced'::text
  ]));
