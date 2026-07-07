import { callAIJson, MODELS } from "./ai.ts";

export interface QaVerdict {
  score: number;
  brand_fit: boolean;
  issues: string[];
}

/**
 * Cheap second-model critique pass before a draft reaches admin review.
 * Best-effort: a QA failure must never block content from reaching the
 * admin queue, it only adds context to help them review faster.
 */
export async function critiqueContent(
  content: string,
  contentType: string,
  tone: string,
  clientId?: string,
): Promise<QaVerdict | null> {
  try {
    return await callAIJson<QaVerdict>({
      source: "content-qa",
      promptId: "content-qa-critique.v1",
      model: MODELS.fast,
      clientId,
      system:
        "You are a strict marketing content editor. Score the draft honestly. " +
        "Return JSON only: { \"score\": 1-10, \"brand_fit\": boolean, \"issues\": string[] }. " +
        "issues should be empty if there are none — do not invent problems.",
      prompt: `Content type: ${contentType}\nExpected tone: ${tone}\n\nDraft:\n${content}`,
      maxTokens: 300,
      temperature: 0,
      retries: 0,
    });
  } catch (e) {
    console.warn("[content-qa] critique failed (non-fatal):", e instanceof Error ? e.message : e);
    return null;
  }
}

/** True if the verdict is bad enough that a human reviewer should be flagged. */
export function qaNeedsAttention(qa: QaVerdict | null): boolean {
  return !!qa && (qa.score < 6 || !qa.brand_fit || qa.issues.length > 0);
}
