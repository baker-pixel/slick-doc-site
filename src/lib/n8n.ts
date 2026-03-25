import { supabase } from "@/integrations/supabase/client";

/**
 * Triggers the auto-run-client-tasks edge function to execute
 * all FULL automation tasks sequentially for a given client.
 */
export async function runAutoTasks(clientId: string): Promise<{
  success: boolean;
  completed: number;
  failed: number;
  results: { taskId: string; name: string; status: string; error?: string }[];
}> {
  const { data, error } = await supabase.functions.invoke("auto-run-client-tasks", {
    body: { clientId },
  });

  if (error) {
    throw new Error(error.message || "Failed to run automated tasks");
  }

  return data;
}

/**
 * Triggers a single task execution via run-automation.
 */
export async function runSingleTask(
  clientId: string,
  taskId: string,
  jobType: string
): Promise<{ success: boolean; error?: string }> {
  // Mark task as in_progress
  await supabase
    .from("client_tasks")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", taskId);

  const { data, error } = await supabase.functions.invoke("run-automation", {
    body: { clientId, taskId, jobType },
  });

  if (error) {
    await supabase
      .from("client_tasks")
      .update({ status: "failed", notes: error.message })
      .eq("id", taskId);
    throw new Error(error.message || "Task execution failed");
  }

  // Mark completed
  await supabase
    .from("client_tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  return data;
}
