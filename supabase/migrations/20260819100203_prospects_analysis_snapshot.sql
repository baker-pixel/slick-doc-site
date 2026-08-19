-- send-prospect-report (the emailed PDF for a Quick Analysis lead) was
-- reading prospects.seo_score / conversion_score / technical_score /
-- summary / quick_wins -- none of which exist on this table. Every emailed
-- report has always rendered those categories as 0/Critical, silently,
-- because Supabase-js doesn't error on selecting a nonexistent column via
-- `select("*")`; it's just undefined in the result.
--
-- analyze-website computes a full, real analysis (SEO/conversion/technical
-- LLM scores, engagement/metrics ground-truth signals, quick wins, action
-- plan, summary) but never persisted it anywhere after returning it in the
-- HTTP response -- it only lived in the browser's React state. This column
-- gives it somewhere durable to land so the emailed PDF can render the same
-- real numbers the on-screen report shows, instead of a zeroed-out shell.
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS analysis_snapshot JSONB;

COMMENT ON COLUMN public.prospects.analysis_snapshot IS
  'Full analyze-website output (seo/conversion/technical/engagement/metrics/quickWins/actionPlan/summary) for this prospect''s Quick Analysis run. Source of truth for send-prospect-report''s emailed PDF.';
