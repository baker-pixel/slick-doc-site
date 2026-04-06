ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS estimated_completion date,
  ADD COLUMN IF NOT EXISTS actual_completion date;