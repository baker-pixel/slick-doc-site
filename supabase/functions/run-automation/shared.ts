import { callAI, extractJson } from "../_shared/ai.ts";

// Helper to create a deliverable
export async function createDeliverable(
  supabase: any,
  clientId: string,
  title: string,
  description: string,
  category: string = "report"
) {
  const { error } = await supabase.from("deliverables").insert({
    client_account_id: clientId,
    title,
    description,
    category,
    status: "pending_review",
  });
  if (error) {
    console.error("Failed to create deliverable:", error);
  }
  return !error;
}

// Helper to format date
export function formatDate() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function callGroq(prompt: string, systemPrompt: string, maxTokens = 2048): Promise<string> {
  return callAI({ source: "run-automation", system: systemPrompt, prompt, maxTokens });
}

export function parseJsonFromAi(content: string): any {
  try {
    return extractJson(content);
  } catch {
    return null;
  }
}
