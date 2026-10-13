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
      prompt: `Name what this ${platform} post is about in 3-8 words (the subject/angle, not a headline or hashtag). Return ONLY {"topic":"..."}.\n\nPOST:\n${content.slice(0, 1200)}`,
    });
    const topic = typeof res.topic === "string" ? res.topic.trim().replace(/\s+/g, " ") : "";
    return topic.length >= 3 && topic.length <= 90 ? topic : null;
  } catch (e) {
    console.error("extractTopic failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
