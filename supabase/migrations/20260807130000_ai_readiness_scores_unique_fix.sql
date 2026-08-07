-- The partial unique indexes from the prior migration can't back an
-- ON CONFLICT target (Postgres only matches a partial index if the same
-- WHERE predicate is repeated in the ON CONFLICT clause, which the
-- supabase-js .upsert() client doesn't support -- every upsert call failed
-- with 42P10 "no unique or exclusion constraint matching". A plain UNIQUE
-- constraint works instead: Postgres already treats every NULL as distinct
-- under standard unique semantics, so unlimited prospect_id-only rows and
-- unlimited submission_id-only rows still coexist without colliding.
DROP INDEX IF EXISTS public.idx_ai_readiness_submission_unique;
DROP INDEX IF EXISTS public.idx_ai_readiness_prospect_unique;

ALTER TABLE public.ai_readiness_scores
  ADD CONSTRAINT ai_readiness_scores_submission_id_key UNIQUE (submission_id);
ALTER TABLE public.ai_readiness_scores
  ADD CONSTRAINT ai_readiness_scores_prospect_id_key UNIQUE (prospect_id);
