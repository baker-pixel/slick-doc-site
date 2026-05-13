-- Seed default Calendly URL into admin_settings (idempotent)
INSERT INTO public.admin_settings (key, value, description)
VALUES (
  'calendly_url',
  'https://calendly.com/baker-orangedoor',
  'Calendly booking link shown to clients during onboarding (Step 2: Schedule Kickoff Call)'
)
ON CONFLICT (key) DO NOTHING;

-- Fix existing clients: automation workflow steps incorrectly seeded as 'pending'
-- Any non-client step that is 'pending' but whose dependency is not yet 'completed'
-- should be 'locked'. Safe to run multiple times (idempotent).
UPDATE public.workflow_steps ws
SET status = 'locked'
WHERE
  ws.task_type NOT IN (
    'client_form', 'client_upload', 'client_oauth',
    'client_calendar', 'client_approval'
  )
  AND ws.status = 'pending'
  AND ws.depends_on IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.workflow_steps dep
    WHERE dep.workflow_id = ws.workflow_id
      AND dep.step_number = ws.depends_on
      AND dep.status != 'completed'
  );
