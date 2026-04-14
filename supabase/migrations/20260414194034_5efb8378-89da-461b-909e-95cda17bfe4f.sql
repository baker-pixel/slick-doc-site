ALTER TABLE public.gap_analysis_submissions
  ADD COLUMN IF NOT EXISTS overall_score integer,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb;