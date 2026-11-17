import { callAIJson, MODELS } from "./ai.ts";

/**
 * One short topic phrase for a finished post, from the fast model. Best-effort:
 * returns null on any failure (the post still ships, it just isn't in the ledger).
 */
export async function extractTopic(content: string, platform: string, clientId: string): Promise<string | null> {
  try {
    const res = await callAIJson<{ topic?: unknown }>({
      source: "extract-post-topic",
      clientId,
      model: MODELS.fast,
      jsonMode: true,
      maxTokens: 60,
      promptId: "post-topic.v1",
      prompt: `Name the SPECIFIC angle of this ${platform} post in 3-10 words, narrow enough to tell it apart from a sibling post (e.g. "why the debrief call matters more than the report", not "coaching tools"). Not a headline or hashtag. Return ONLY {"topic":"..."}.\n\nPOST:\n${content.slice(0, 1200)}`,
    });
    const topic = typeof res.topic === "string" ? res.topic.trim().replace(/\s+/g, " ") : "";
    return topic.length >= 3 && topic.length <= 90 ? topic : null;
  } catch (e) {
    console.error("extractTopic failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
