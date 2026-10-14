-- The free scan used to recommend an "optimization" tier, which is not a plan we sell.
-- Plans are SYSTEM Foundation / Growth / Transformation. Rename the label on existing
-- leads and tighten the constraint so the old name can't come back.
ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_recommended_tier_check;
UPDATE public.prospects SET recommended_tier = 'foundation' WHERE recommended_tier = 'optimization';
ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_recommended_tier_check
  CHECK (recommended_tier IS NULL OR recommended_tier IN ('foundation', 'growth', 'transformation'));
