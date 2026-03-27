
-- Step 1: Create client_workflows table
CREATE TABLE public.client_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.client_accounts(id) ON DELETE CASCADE NOT NULL,
  workflow_name text DEFAULT 'system_17_step',
  current_step integer DEFAULT 1,
  total_steps integer DEFAULT 17,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.client_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage client_workflows" ON public.client_workflows
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their workflows" ON public.client_workflows
  FOR SELECT TO public
  USING (client_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access client_workflows" ON public.client_workflows
  FOR ALL TO public
  USING (true);

-- Step 2: Create workflow_steps table
CREATE TABLE public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid REFERENCES public.client_workflows(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES public.client_accounts(id) NOT NULL,
  step_number integer NOT NULL,
  step_name text NOT NULL,
  task_type text NOT NULL,
  status text DEFAULT 'pending',
  depends_on integer DEFAULT NULL,
  task_id uuid REFERENCES public.workflow_tasks(id) DEFAULT NULL,
  payload jsonb DEFAULT '{}',
  result jsonb DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz DEFAULT NULL
);

ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workflow_steps" ON public.workflow_steps
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their workflow_steps" ON public.workflow_steps
  FOR SELECT TO public
  USING (client_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access workflow_steps" ON public.workflow_steps
  FOR ALL TO public
  USING (true);

-- Enable realtime for workflow_steps
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_workflows;
