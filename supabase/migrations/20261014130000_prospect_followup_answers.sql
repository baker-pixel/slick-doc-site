-- Optional second step of the free scan: tap-to-answer questions that unlock the two SYSTEM
-- categories a website can't reveal (Sequence & Nurture, Transaction Activation).
-- Written only by the submit-followup edge function (service role); same access as the rest of prospects.
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS followup_answers jsonb,
  ADD COLUMN IF NOT EXISTS followup_scores jsonb,
  ADD COLUMN IF NOT EXISTS followup_completed_at timestamptz;

COMMENT ON COLUMN public.prospects.followup_scores IS
  'Scores for Sequence & Nurture (S2) and Transaction Activation (T) from the follow-up questions, with the scoring version. When set, gap_score covers all six SYSTEM categories.';
