
-- Add date tracking columns to workflow_steps
ALTER TABLE public.workflow_steps
  ADD COLUMN IF NOT EXISTS estimated_completion date,
  ADD COLUMN IF NOT EXISTS actual_completion date;

-- Create trigger function to auto-set actual_completion on status = 'completed'
CREATE OR REPLACE FUNCTION public.trg_workflow_step_actual_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.actual_completion = CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Drop if exists to avoid duplicates
DROP TRIGGER IF EXISTS trg_workflow_step_actual_completion ON public.workflow_steps;

-- Create the trigger
CREATE TRIGGER trg_workflow_step_actual_completion
  BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_workflow_step_actual_completion();
