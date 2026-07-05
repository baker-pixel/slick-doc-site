import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

// Custom automation handler for tasks with custom job types
export async function runCustomAutomation(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  const taskName = (inputData?.taskName as string) || "Custom Task";
  const taskDescription = (inputData?.description as string) || "A custom automation task was executed.";
  const reportDate = formatDate();

  await createDeliverable(
    supabase,
    client.id,
    `${taskName} - ${reportDate}`,
    `# ${taskName}

## Status: Complete

*Generated on ${reportDate} for ${client.business_name}*

## Details

${taskDescription}

## Input Parameters

${inputData ? Object.entries(inputData).map(([key, value]) => `- **${key}:** ${JSON.stringify(value)}`).join('\n') : 'No additional parameters provided.'}

## What's Next

This custom task has been completed and logged. Your team will follow up with any necessary actions.

*Task completed automatically.*`,
    "general"
  );

  return {
    completed: true,
    taskName,
    timestamp: new Date().toISOString(),
    deliverableCreated: true
  };
}
