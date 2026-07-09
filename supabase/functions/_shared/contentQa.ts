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

export interface QaBatchItem {
  content: string;
  contentType: string;
}

/**
 * Same critique as critiqueContent, but for a whole batch of drafts that
 * were all generated in one AI call (e.g. ai-automation's content_pieces /
 * emails arrays) -- one model call instead of N, since the drafts already
 * share tone/client context. Falls back to critiqueContent for a single
 * item so callers don't pay batch-prompt overhead for the common case.
 */
export async function critiqueContentBatch(
  items: QaBatchItem[],
  tone: string,
  clientId?: string,
): Promise<(QaVerdict | null)[]> {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [await critiqueContent(items[0].content, items[0].contentType, tone, clientId)];
  }

  try {
    const result = await callAIJson<{ verdicts: QaVerdict[] }>({
      source: "content-qa",
      promptId: "content-qa-critique-batch.v1",
      model: MODELS.fast,
      clientId,
      system:
        "You are a strict marketing content editor. Score each draft honestly and independently. " +
        "Return JSON only: { \"verdicts\": [{ \"score\": 1-10, \"brand_fit\": boolean, \"issues\": string[] }, ...] } " +
        "with exactly one verdict per draft, in the same order as the drafts. " +
        "issues should be empty if there are none — do not invent problems.",
      prompt: `Expected tone: ${tone}\n\n${items.map((it, i) => `--- Draft ${i + 1} (${it.contentType}) ---\n${it.content}`).join("\n\n")}`,
      maxTokens: Math.min(300 * items.length, 4000),
      temperature: 0,
      retries: 0,
    });
    if (!Array.isArray(result.verdicts) || result.verdicts.length !== items.length) {
      throw new Error(`expected ${items.length} verdicts, got ${result.verdicts?.length ?? 0}`);
    }
    return result.verdicts;
  } catch (e) {
    console.warn("[content-qa] batch critique failed (non-fatal):", e instanceof Error ? e.message : e);
    return items.map(() => null);
  }
}
