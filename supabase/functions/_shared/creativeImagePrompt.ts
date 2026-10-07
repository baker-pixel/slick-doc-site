import { callAI, MODELS } from "./ai.ts";
import { buildSocialImagePrompt, type ImagePromptClient, type ImagePromptPost } from "./socialImagePrompt.ts";

// Concept-first image prompts. The older builder (buildSocialImagePrompt)
// stages the PRODUCT -- for an assessment company that is the same colored
// blocks, charts and clipboards on a desk every time. Here a cheap model
// first turns the post's single idea into a visual concept, and a rotating
// art-direction style decides how it is rendered, so the feed varies and each
// image actually relates to its post. Any failure falls back to the old
// builder, so an image is never blocked by this step.

export interface ImageStyle {
  id: string;
  label: string;
  direction: string;
  people: boolean;
}

export const IMAGE_STYLES: ImageStyle[] = [
  {
    id: "human_moment",
    label: "Candid human moment",
    direction: "A candid editorial photograph of real people in a genuine moment that embodies the idea (a conversation, a pause, a breakthrough). Documentary feel, natural light, shallow depth of field, real skin texture and imperfect framing. Nothing posed.",
    people: true,
  },
  {
    id: "visual_metaphor",
    label: "Conceptual metaphor",
    direction: "A conceptual photograph built around ONE striking real-world visual metaphor for the idea -- surprising but instantly readable. Cinematic lighting, a single clear focal point, rich color.",
    people: false,
  },
  {
    id: "editorial_illustration",
    label: "Editorial illustration",
    direction: "A bold contemporary editorial illustration -- flat expressive shapes, a limited confident palette, a clever composition like a magazine feature spread. Illustration, not photography.",
    people: true,
  },
  {
    id: "paper_collage",
    label: "Paper collage",
    direction: "A tactile layered cut-paper collage with visible paper grain, torn edges and soft cast shadows. Handmade, playful, graphic.",
    people: true,
  },
  {
    id: "isometric_3d",
    label: "Playful 3D scene",
    direction: "A playful isometric 3D scene in matte clay-like materials that stages the idea as a small self-contained world. Soft studio lighting, tidy and charming.",
    people: true,
  },
  {
    id: "macro_texture",
    label: "Macro close-up",
    direction: "A dramatic macro close-up of one material or object that embodies the idea, with very shallow depth of field, rich texture and moody directional light.",
    people: false,
  },
  {
    id: "environment",
    label: "Atmospheric place",
    direction: "An atmospheric wide shot of a place that evokes the idea (a studio, a workshop, a lit window at dusk, a quiet room before a big meeting). People small or absent. Cinematic, calm, considered.",
    people: false,
  },
];

export interface CreativeImagePrefs {
  /** Allowed style ids. Empty or missing means all styles. */
  image_styles?: string[];
  /** Things the client never wants shown. */
  image_never?: string[];
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

export function pickImageStyle(post: ImagePromptPost, prefs: CreativeImagePrefs | undefined): ImageStyle {
  const allowed = Array.isArray(prefs?.image_styles) && prefs!.image_styles!.length
    ? IMAGE_STYLES.filter((s) => prefs!.image_styles!.includes(s.id))
    : IMAGE_STYLES;
  const pool = allowed.length ? allowed : IMAGE_STYLES;
  return pool[hashSeed(`${post.title || ""}${post.content}`) % pool.length];
}

const CLICHES =
  "glowing or mechanical brain, scales of justice, lightbulb-as-idea, gears/cogs, handshake close-up, circuit-board overlays, DNA helix, floating abstract geometry, generic posed businesspeople at a meeting table, laptops with charts, stacks of coloured blocks on a desk";

async function writeConcept(
  client: ImagePromptClient,
  post: ImagePromptPost,
  style: ImageStyle,
  never: string[],
): Promise<string | null> {
  const cp = client.context_profile ?? {};
  const facts = [
    cp.business_summary,
    cp.services?.length ? `Services: ${cp.services.join(", ")}` : "",
    (cp as { verified_facts?: string[] }).verified_facts?.length
      ? `Verified facts: ${(cp as { verified_facts?: string[] }).verified_facts!.join("; ")}`
      : "",
  ].filter(Boolean).join("\n");

  try {
    const out = await callAI({
      source: "creative-image-concept",
      promptId: "creative-image-concept.v1",
      model: MODELS.fast,
      clientId: client.id,
      system:
        "You are a creative director for social media imagery. Turn the post's ONE core idea into a single vivid visual concept " +
        "a photographer or illustrator could execute, in 1-2 sentences. Be concrete and specific (what is in frame, where, doing what). " +
        "It must relate to this post's message, not just the company's product. Do NOT depict software screens, dashboards, AI visuals, " +
        "integrations or product features unless the facts explicitly state them. No text, letters, numbers or logos anywhere in the image. " +
        `Avoid clichés: ${CLICHES}.` +
        (never.length ? ` The client never wants to see: ${never.join("; ")}.` : "") +
        " Return ONLY the concept.",
      prompt: `Business: ${client.business_name} (${client.industry || "business"})\n${facts}\n\nPost${post.title ? ` "${post.title}"` : ""}:\n${post.content.slice(0, 600)}\n\nRender style: ${style.direction}`,
      maxTokens: 160,
      temperature: 0.9,
    });
    const concept = out.trim().replace(/^["']|["']$/g, "");
    return concept.length >= 20 ? concept : null;
  } catch (e) {
    console.warn("[creative-image] concept step failed, using fallback prompt:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function buildCreativeImagePrompt(
  client: ImagePromptClient,
  post: ImagePromptPost,
): Promise<string> {
  const prefs = (client.context_profile ?? {}) as CreativeImagePrefs;
  const never = Array.isArray(prefs.image_never) ? prefs.image_never : [];
  const style = pickImageStyle(post, prefs);
  const concept = await writeConcept(client, post, style, never);
  if (!concept) return buildSocialImagePrompt(client, post);

  const constraints = [
    `No text of any kind: no letters, numbers, captions, signage, logos or watermarks. Anything that would normally carry text (a screen, page, sign, shirt) is soft out-of-focus shapes instead.`,
    `Keep the bottom 15% of the frame visually calm and uncluttered (a brand bar is added there afterwards).`,
    `Avoid clichés: ${CLICHES}.`,
    style.people
      ? `If people appear they must look real: natural facial asymmetry, correct hands and limbs, realistic skin, candid expressions -- no waxy, over-smoothed or stock-photo-grin look.`
      : `Do not include people.`,
    ...(never.length ? [`Never show: ${never.join("; ")}.`] : []),
  ];

  return [
    `Scene: Social media image for ${client.business_name}${client.industry ? ` (${client.industry})` : ""}.${post.title ? ` Post: "${post.title}".` : ""}`,
    `Visual concept: ${concept}`,
    `Style: ${style.direction}`,
    `Mood: modern, premium, considered.`,
    `Constraints: ${constraints.join(" ")}`,
  ].join("\n");
}
