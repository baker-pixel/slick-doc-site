-- Closes two data-model continuity gaps:
-- 1) client_accounts had no FK back to the gap_analysis_submissions row that
--    originated it -- "which client came from which lead" was only
--    answerable by an ad-hoc email match.
-- 2) client_tasks had no link to the project_milestones row (the existing
--    per-finding object -- see _shared/seoProject.ts) that caused the task,
--    so "which engine did what because of which finding" wasn't queryable.

ALTER TABLE public.client_accounts
  ADD COLUMN lead_id uuid REFERENCES public.gap_analysis_submissions(id);

-- Backfill by email match: most recent completed submission per email wins.
WITH latest_submission AS (
  SELECT DISTINCT ON (lower(email)) id, email
  FROM public.gap_analysis_submissions
  ORDER BY lower(email), completed_at DESC NULLS LAST, created_at DESC
)
UPDATE public.client_accounts ca
SET lead_id = ls.id
FROM latest_submission ls
WHERE lower(ca.email) = lower(ls.email)
  AND ca.lead_id IS NULL;

ALTER TABLE public.client_tasks
  ADD COLUMN milestone_id uuid REFERENCES public.project_milestones(id);

CREATE INDEX idx_client_tasks_milestone_id ON public.client_tasks(milestone_id) WHERE milestone_id IS NOT NULL;
