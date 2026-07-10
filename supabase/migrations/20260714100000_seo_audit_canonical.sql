-- Canonical SEO audit shape (architecture v2). The findings / subscores /
-- pages_analyzed all live inside results (jsonb) so no column churn there;
-- these three top-level columns are what the engine and the diff/trend logic
-- need as first-class, queryable fields.
--
--   previous_audit_id : links each audit to the prior one for this client,
--                       so findings can be diffed (resolved / new / regressed)
--                       and score trends stay coherent.
--   rubric_version    : scores are only comparable within the same rubric
--                       version; stamping it keeps trend lines honest when the
--                       rubric changes.
--   status            : 'complete' vs 'inconclusive' -- a site we couldn't
--                       crawl/render is inconclusive, NOT a low score.

ALTER TABLE public.seo_audits
  ADD COLUMN IF NOT EXISTS previous_audit_id uuid REFERENCES public.seo_audits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rubric_version text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'complete';

CREATE INDEX IF NOT EXISTS idx_seo_audits_client_created
  ON public.seo_audits (client_account_id, created_at DESC);