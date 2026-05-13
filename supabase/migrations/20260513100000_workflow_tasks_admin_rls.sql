-- Allow admin users to insert and update workflow tasks (needed for full-site audit trigger from admin UI)
CREATE POLICY "Admins can insert workflow tasks"
  ON public.workflow_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update workflow tasks"
  ON public.workflow_tasks
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can select all workflow tasks"
  ON public.workflow_tasks
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
