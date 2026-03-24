import { supabase } from "@/integrations/supabase/client";

interface N8NTask {
  id: string;
  name: string;
  category?: string;
  automation_type?: string;
  client_account_id?: string;
  [key: string]: unknown;
}

interface TriggerN8NOptions {
  clientId: string;
  tasks: N8NTask[];
  trigger?: string;
  metadata?: Record<string, unknown>;
}

interface TriggerN8NResult {
  success: boolean;
  message: string;
  taskIds: string[];
  n8nResponse?: unknown;
}

/**
 * Triggers N8N webhook via the trigger-n8n edge function.
 * All automation execution flows through N8N — no direct run-automation calls.
 */
export async function triggerN8N(options: TriggerN8NOptions): Promise<TriggerN8NResult> {
  const { clientId, tasks, trigger = "run_auto", metadata = {} } = options;

  const { data, error } = await supabase.functions.invoke("trigger-n8n", {
    body: { clientId, tasks, trigger, metadata },
  });

  if (error) {
    throw new Error(error.message || "Failed to trigger N8N");
  }

  return data as TriggerN8NResult;
}

/**
 * Trigger N8N for a single task.
 */
export async function triggerN8NTask(
  clientId: string,
  task: N8NTask,
  trigger = "single_task"
): Promise<TriggerN8NResult> {
  return triggerN8N({
    clientId,
    tasks: [task],
    trigger,
    metadata: { taskName: task.name, category: task.category },
  });
}
