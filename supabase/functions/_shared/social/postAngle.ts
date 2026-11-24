import { callAIJson, MODELS } from "../ai/ai.ts";
import type { PostFormat } from "./postVariety.ts";

export interface PostBrief {
  angle: string;
  hook: string;
}

/**
 * A cheap "editor" step that runs before the caption is written: picks ONE
 * specific, fresh angle. Without it the writer model is handed the business
 * summary plus a vague pillar and lands on the product every time -- the topic
 * ledger can say "don't repeat these 30 labels" but the model can only avoid
 * them by rewording. Choosing the angle first, from the audience's side, is
 * what produces genuinely different posts.
 *
 * Best-effort: returns null on any failure and the post is written without a
 * brief (still shaped by format + opening rules).
 */
export async function planPostAngle(args: {
  clientId: string;
  businessName: string;
  industry: string | null;
  audience: string;
  facts: string;
  pillar?: string;
  pillarDescription?: string;
  format?: PostFormat;
  platform: string;
  recentTopics: string[];
  /** The business's real services/offerings, so the angle stays something it can actually help with. */
  services?: string[];
  /** Story-led pillar with no verified client story: the angle must be an illustrative scenario. */
  narrative?: boolean;
}): Promise<PostBrief | null> {
  try {
    const res = await callAIJson<{ angle?: unknown; hook?: unknown }>({
      source: "plan-post-angle",
      promptId: "post-angle.v1",
      clientId: args.clientId,
      model: MODELS.creative,
      fallbackModels: [MODELS.default, MODELS.fast],
      jsonMode: true,
      maxTokens: 220,
      temperature: 0.95,
      system:
        "You are the editor of a social feed. Choose ONE fresh, specific angle for the next post. " +
        "The angle starts from a concrete audience problem, question, situation, mistake, opinion or practical tip rather than a product description, BUT it must be something one of the business's specific services can help with (the hook may name that service). " +
        "and NOT a broad subject area like 'leadership development'. Good: 'why the debrief call matters more than the report'. Bad: 'assessment tools for coaches'. " +
        "It must be clearly different from every recent topic. Never invent statistics, client results, product features or integrations; stay inside the facts given. " +
        'Return ONLY {"angle":"6-16 words","hook":"one-sentence opening idea that does not start with a stock phrase"}.',
      prompt:
        `Business: ${args.businessName} (${args.industry || "business"})\nAudience: ${args.audience}\nPlatform: ${args.platform}\n` +
        (args.pillar ? `Pillar: ${args.pillar}${args.pillarDescription ? ` -- ${args.pillarDescription}` : ""}\n` : "") +
        (args.format ? `Post shape: ${args.format.label} -- ${args.format.instruction}\n` : "") +
        (args.services?.length ? `Services/offerings it can help with: ${args.services.slice(0, 8).join("; ")}\n` : "") +
        (args.narrative ? "This is a story-led pillar with no verified client story: make the angle a short ILLUSTRATIVE scenario premise (\"picture a coach who...\"), never a claimed real client story.\n" : "") +
        `\nFACTS:\n${args.facts.slice(0, 1500)}\n\n` +
        (args.recentTopics.length ? `RECENT TOPICS (do not revisit or reword any of these): ${args.recentTopics.slice(0, 30).join(" | ")}` : ""),
    });
    const angle = typeof res.angle === "string" ? res.angle.trim().replace(/\s+/g, " ") : "";
    const hook = typeof res.hook === "string" ? res.hook.trim().replace(/\s+/g, " ") : "";
    if (angle.length < 8 || angle.length > 200) return null;
    return { angle, hook: hook.slice(0, 220) };
  } catch (e) {
    console.warn("[post-angle] brief failed, writing without one:", e instanceof Error ? e.message : e);
    return null;
  }
}
