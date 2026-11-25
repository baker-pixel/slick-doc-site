// Turns what a client does with images into stored taste, so the next image
// already knows it. Feedback becomes standing rules (`image_never`, shown and
// editable in the portal's company context card) and preferences
// (`image_prefer`); approved images leave their concept as a positive example
// (`image_liked`). The image concept writer reads all three.
import { callAIJson, MODELS } from "../ai/ai.ts";

export const MAX_NEVER = 15;
export const MAX_PREFER = 6;
export const MAX_LIKED = 6;

/** Adds `fresh` to `existing` without case-insensitive duplicates; when over the cap the oldest entries drop. */
export function mergeCapped(existing: unknown, fresh: string[], cap: number): string[] {
  const out = (Array.isArray(existing) ? existing : []).filter((x): x is string => typeof x === "string" && !!x.trim());
  for (const f of fresh.map((x) => x.trim()).filter(Boolean)) {
    if (!out.some((e) => e.toLowerCase() === f.toLowerCase())) out.push(f);
  }
  return out.slice(-cap);
}

async function updateProfile(supabase: any, clientId: string, change: (cp: Record<string, unknown>) => Record<string, unknown>) {
  // Re-read right before writing so a concurrent profile edit is not lost.
  const { data } = await supabase.from("client_accounts").select("context_profile").eq("id", clientId).maybeSingle();
  const cp = (data?.context_profile ?? {}) as Record<string, unknown>;
  const next = change(cp);
  await supabase.from("client_accounts").update({ context_profile: next }).eq("id", clientId);
}

const clean = (v: unknown, n: number): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim().slice(0, 80)).slice(0, n) : [];

/** Extracts standing image preferences from a client's note on one image. Never throws. */
export async function learnFromImageFeedback(supabase: any, clientId: string, feedback: string): Promise<{ never: string[]; prefer: string[] }> {
  const empty = { never: [] as string[], prefer: [] as string[] };
  try {
    const out = await callAIJson<{ never?: string[]; prefer?: string[] }>({
      prompt:
        `A client reviewed a generated image for their social post and said:\n"${feedback}"\n\n` +
        `Extract ONLY preferences that should apply to ALL their future images, not fixes specific to this one image.\n` +
        `- "never": things to never show, each a short noun phrase of at most 8 words (for example "people in suits", "stock handshake scenes", "dark moody lighting").\n` +
        `- "prefer": things to favour, each a short phrase (for example "bright natural light", "close-up objects instead of people").\n` +
        `Return JSON: {"never": [], "prefer": []}, at most 3 items each, empty arrays when the note is specific to this one image.`,
      model: MODELS.default,
      maxTokens: 250,
      source: "image-feedback-learning",
      clientId,
    });
    const learned = { never: clean(out?.never, 3), prefer: clean(out?.prefer, 3) };
    if (!learned.never.length && !learned.prefer.length) return empty;
    await updateProfile(supabase, clientId, (cp) => ({
      ...cp,
      image_never: mergeCapped(cp.image_never, learned.never, MAX_NEVER),
      image_prefer: mergeCapped(cp.image_prefer, learned.prefer, MAX_PREFER),
    }));
    return learned;
  } catch (e) {
    console.warn("[image-taste] feedback learning failed (non-fatal):", e instanceof Error ? e.message : e);
    return empty;
  }
}

/** Remembers the concept of an image the client approved, as a taste example. Never throws. */
export async function rememberLikedImage(supabase: any, clientId: string, generatedContentId: string | null): Promise<void> {
  if (!generatedContentId) return;
  try {
    const { data } = await supabase
      .from("content_calendar")
      .select("metadata")
      .eq("client_account_id", clientId)
      .eq("content_id", generatedContentId)
      .not("metadata->>image_concept", "is", null)
      .limit(1)
      .maybeSingle();
    const concept = (data?.metadata as Record<string, unknown> | undefined)?.image_concept;
    if (typeof concept !== "string" || !concept.trim()) return;
    await updateProfile(supabase, clientId, (cp) => ({ ...cp, image_liked: mergeCapped(cp.image_liked, [concept.trim().slice(0, 300)], MAX_LIKED) }));
  } catch (e) {
    console.warn("[image-taste] could not remember approved image (non-fatal):", e instanceof Error ? e.message : e);
  }
}
