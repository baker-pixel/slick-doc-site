-- Mid-funnel engagement signal for prospects: first-open and first-click
-- timestamps, populated by track-open/track-click. Deliberately separate
-- from `status` -- run-prospect-drip selects status='nurture' to send the
-- next drip step, so overloading status with an 'opened'/'clicked' value
-- would silently drop engaged prospects out of the send loop. These columns
-- are pure signal, safe to display or later feed into fit-scoring, without
-- touching the send pipeline.

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMP WITH TIME ZONE;
