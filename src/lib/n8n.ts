import { supabase } from "@/integrations/supabase/client";

/**
 * Triggers the auto-run-client-tasks edge function to execute
 * all FULL automation tasks sequentially for a given client.
 */
export async function runAutoTasks(clientId: string, password?: string): Promise<{
  success: boolean;
  completed: number;
  failed: number;
  results: { taskId: string; name: string; status: string; error?: string }[];
}> {
  const { data, error } = await supabase.functions.invoke("auto-run-client-tasks", {
    body: { clientId, password },
  });

  if (error) {
    throw new Error(error.message || "Failed to run automated tasks");
  }

  return data;
}

/**
 * Triggers a single task execution via run-automation.
 * Status updates are handled by run-automation itself — no duplicate writes here.
 */
export async function runSingleTask(
  clientId: string,
  taskId: string,
  jobType: string,
  password?: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("run-automation", {
    body: { clientId, taskId, jobType, password },
  });

  if (error) {
    throw new Error(error.message || "Task execution failed");
  }

  return data;
}
