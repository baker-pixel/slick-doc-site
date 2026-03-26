
-- Add tone and website_summary columns to client_accounts if missing
ALTER TABLE public.client_accounts ADD COLUMN IF NOT EXISTS tone text;
ALTER TABLE public.client_accounts ADD COLUMN IF NOT EXISTS website_summary text;

-- Create workflow_tasks table
CREATE TABLE public.workflow_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_workflow_task_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'running', 'completed', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_workflow_task_status
  BEFORE INSERT OR UPDATE ON public.workflow_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_workflow_task_status();

-- Enable RLS
ALTER TABLE public.workflow_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: clients can see their own tasks
CREATE POLICY "Clients can view own workflow tasks"
  ON public.workflow_tasks
  FOR SELECT
  TO authenticated
  USING (client_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  ));

-- Policy: service role can do everything (edge functions)
CREATE POLICY "Service role full access to workflow tasks"
  ON public.workflow_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_tasks;
