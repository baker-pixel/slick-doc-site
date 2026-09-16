-- ai_readiness_scores was only ever written by the one-time onboarding scan
-- (submission_id/prospect_id), so a client's AEO score went stale forever
-- after signup while seo_audits kept recomputing. seo-audit now recomputes
-- readiness every run and upserts by client_id, so it needs the same
-- plain UNIQUE constraint the submission_id/prospect_id fix already applies
-- (partial indexes can't back supabase-js .upsert()'s ON CONFLICT, see
-- 20260807130000_ai_readiness_scores_unique_fix.sql).
ALTER TABLE public.ai_readiness_scores
  DROP CONSTRAINT IF EXISTS ai_readiness_scores_lineage_check;
ALTER TABLE public.ai_readiness_scores
  ADD CONSTRAINT ai_readiness_scores_lineage_check
    CHECK (submission_id IS NOT NULL OR prospect_id IS NOT NULL OR client_id IS NOT NULL);

ALTER TABLE public.ai_readiness_scores
  ADD CONSTRAINT ai_readiness_scores_client_id_key UNIQUE (client_id);
