-- Removes the n8n_post_social/n8n_post_blog onboarding-workflow steps for
-- clients already mid-onboarding (seed-tier-workflow.ts no longer creates
-- these for new clients -- real publishing already runs on its own
-- continuous schedule, not as a one-time checklist gate, and these steps'
-- own dispatch to trigger-n8n never sends the client OAuth token or the
-- actual generated content, so they can't function as a real publish step
-- anyway). All 16 affected rows across 4 in-flight workflows are still
-- 'pending' or 'locked' -- none have run -- so this is safe.
--
-- Repoint any step that depended on one of these (bridge over it to its own
-- dependency) before deleting, so downstream steps don't reference a
-- step_number that no longer exists.

update public.workflow_steps ws
set depends_on = n8n.depends_on
from public.workflow_steps n8n
where n8n.task_type in ('n8n_post_social', 'n8n_post_blog')
  and ws.workflow_id = n8n.workflow_id
  and ws.depends_on = n8n.step_number;

delete from public.workflow_steps
where task_type in ('n8n_post_social', 'n8n_post_blog');
