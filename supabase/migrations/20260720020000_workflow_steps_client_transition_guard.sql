-- Tighten the client-writable workflow_steps policy: a client could
-- previously update ANY column on ANY of their own rows to ANY value,
-- including flipping an automation step (website_analysis, seo_audit,
-- report, ...) to "completed" without the automation ever running, or
-- reverting an already-completed step. Restrict to the 5 legitimate
-- client-driven task_types, require the row to actually be in the
-- client-actionable "pending" state beforehand, and only allow the
-- transition to "completed".
DROP POLICY IF EXISTS "Clients can update their own workflow steps" ON public.workflow_steps;

CREATE POLICY "Clients can complete their own onboarding steps"
ON public.workflow_steps
FOR UPDATE
TO authenticated
USING (
  client_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
  AND task_type IN ('client_form', 'client_upload', 'client_oauth', 'client_calendar', 'client_approval')
  AND status = 'pending'
)
WITH CHECK (
  client_id IN (
    SELECT client_account_id FROM public.client_portal_users WHERE user_id = auth.uid()
  )
  AND task_type IN ('client_form', 'client_upload', 'client_oauth', 'client_calendar', 'client_approval')
  AND status = 'completed'
);
