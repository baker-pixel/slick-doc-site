CREATE OR REPLACE FUNCTION public.set_workflow_step_actual_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.actual_completion := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workflow_step_actual_completion
  BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_workflow_step_actual_completion();