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
      silent: true,
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
      silent: true,
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

/**
 * Fact-check a draft against the facts we actually hold about the business.
 * Returns the concrete claims (product features, technology, integrations,
 * stats, awards, results) the facts do not support. Generic advice, questions
 * and audience-problem framing are fine. Best-effort: null means "couldn't
 * check", which callers must treat as "no verdict", not "clean".
 */
export async function findUnsupportedClaims(
  content: string,
  facts: string,
  clientId?: string,
): Promise<string[] | null> {
  try {
    const r = await callAIJson<{ unsupported_claims: string[] }>({
      source: "content-claims-check",
      promptId: "content-claims-check.v1",
      model: MODELS.fast,
      clientId,
      system:
        "You are a strict fact-checker for marketing copy. List every concrete claim in the draft about the company's own " +
        "product, features, technology (AI, automation, real-time anything), dashboards, integrations, statistics, awards, " +
        "customers, guarantees or results that is NOT supported by the FACTS. Generic advice, questions, and statements about " +
        "the audience's problems are fine and must not be listed. Return JSON only: { \"unsupported_claims\": string[] } " +
        "(empty array if every claim is supported). Do not invent problems.",
      prompt: `FACTS:\n${facts}\n\nDRAFT:\n${content}`,
      maxTokens: 300,
      temperature: 0,
      retries: 0,
      silent: true,
    });
    return Array.isArray(r.unsupported_claims) ? r.unsupported_claims.filter((c) => typeof c === "string" && c.trim()) : [];
  } catch (e) {
    console.warn("[claims-check] failed (non-fatal):", e instanceof Error ? e.message : e);
    return null;
  }
}
