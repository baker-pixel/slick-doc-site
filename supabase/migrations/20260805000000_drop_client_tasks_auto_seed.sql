-- Tear out the client_tasks-from-task_templates auto-seed pipeline.
-- It's the only thing that ever wrote to client_tasks, and every task it
-- created was unrunnable: TaskExecutionModal/ClientTasksPanel derived a
-- jobType by slugifying task_templates.name, and none of those slugs match
-- anything in run-automation/jobTypeAliases.ts. Live data: 4 clients, 68
-- tasks generated, 0 ever completed successfully. task_templates itself
-- stays -- generate-client-projects still reads it for LLM prompt context.
DROP TRIGGER IF EXISTS on_client_created_generate_tasks ON public.client_accounts;
DROP FUNCTION IF EXISTS public.trigger_generate_client_tasks();
DROP FUNCTION IF EXISTS public.generate_tasks_for_client(uuid);
