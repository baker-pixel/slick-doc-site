-- AI readiness score: free-tier, heuristic, computed synchronously at
-- report-generation time (no cron, no external LLM probe -- that's the
-- separate paid "AI visibility score", a later phase). Scored from real,
-- checkable on-page/site signals (schema richness, llms.txt/robots
-- crawlability, FAQ structure, NAP entity consistency, fact density) so the
-- number reflects the actual site, not an LLM's opinion of it.
--
-- Two lead types produce a report today: the full 11-step form
-- (gap_analysis_submissions) and the instant URL-scan (prospects, no
-- corresponding gap_analysis_submissions row) -- prospect_id lets the latter
-- get a score too without forcing a fake submission row into existence.
CREATE TABLE IF NOT EXISTS public.ai_readiness_scores (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                 UUID REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  submission_id             UUID REFERENCES public.gap_analysis_submissions(id) ON DELETE CASCADE,
  prospect_id               UUID REFERENCES public.prospects(id) ON DELETE CASCADE,
  schema_score              INTEGER NOT NULL CHECK (schema_score BETWEEN 0 AND 25),
  llms_txt_score            INTEGER NOT NULL CHECK (llms_txt_score BETWEEN 0 AND 10),
  faq_structure_score       INTEGER NOT NULL CHECK (faq_structure_score BETWEEN 0 AND 20),
  entity_consistency_score  INTEGER NOT NULL CHECK (entity_consistency_score BETWEEN 0 AND 20),
  crawlability_score        INTEGER NOT NULL CHECK (crawlability_score BETWEEN 0 AND 15),
  fact_density_score        INTEGER NOT NULL CHECK (fact_density_score BETWEEN 0 AND 10),
  total_score               INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  computed_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_readiness_scores_lineage_check
    CHECK (submission_id IS NOT NULL OR prospect_id IS NOT NULL)
);

ALTER TABLE public.ai_readiness_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ai_readiness_scores"
  ON public.ai_readiness_scores
  USING (true) WITH CHECK (true);

-- One current score per lead -- recomputing upserts rather than accumulating
-- history rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_readiness_submission_unique
  ON public.ai_readiness_scores (submission_id) WHERE submission_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_readiness_prospect_unique
  ON public.ai_readiness_scores (prospect_id) WHERE prospect_id IS NOT NULL;
