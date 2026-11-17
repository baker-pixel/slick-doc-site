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
  /** Real-camera look. Photo styles are the default pool; the rest are opt-in only. */
  photo: boolean;
}

// The default mix is PHOTOGRAPHIC and deliberately unglamorous: what reads as
// "AI" is the glossy, cinematic, perfectly-lit, perfectly-tidy look, not the
// subject. Each direction describes how a real person with a real camera would
// have captured it (and where the imperfections are), and a rotating light +
// camera line (below) keeps consecutive images from sharing one look. The
// illustration / collage / 3D styles stay available when a client picks them
// in the portal, but are never part of the "mix it up" default.
export const IMAGE_STYLES: ImageStyle[] = [
  {
    id: "phone_snapshot",
    label: "Phone snapshot",
    direction: "Looks like an authentic smartphone photo taken by someone on the team and posted without editing: slightly off-center framing, available light only, mild noise in the shadows, a little real-world clutter in the background. No retouching, no filters.",
    people: true,
    photo: true,
  },
  {
    id: "human_moment",
    label: "Candid human moment",
    direction: "A candid documentary photograph of real people mid-moment (talking, thinking, laughing, working it out). Nobody is looking at the camera or posing. Real skin texture, ordinary clothes, imperfect framing, a bit of motion or focus softness.",
    people: true,
    photo: true,
  },
  {
    id: "hands_at_work",
    label: "Hands at work",
    direction: "A tight crop on hands doing one specific real task of this work (writing, handing something over, adjusting, pointing, sorting). Faces out of frame. Shallow depth of field, natural light, fine film grain, correct anatomy.",
    people: true,
    photo: true,
  },
  {
    id: "environmental_portrait",
    label: "Environmental portrait",
    direction: "An environmental portrait of one person in their actual workplace, relaxed and mid-activity or glancing away, framed with the surroundings that tell their story. 35mm lens, soft side window light, honest skin and wrinkles in the clothes.",
    people: true,
    photo: true,
  },
  {
    id: "documentary_wide",
    label: "Documentary wide",
    direction: "A handheld documentary wide shot of a small group of people caught mid-activity in a real space, shot in available light with slight motion blur and uneven exposure. Feels like a photographer was in the room, not a set.",
    people: true,
    photo: true,
  },
  {
    id: "overhead_desk",
    label: "Lived-in desk",
    direction: "An overhead shot of a genuinely lived-in work surface with the real tools and materials of this work, a coffee cup, handwritten notes (only unreadable scribbles), items not arranged neatly. Natural window light, soft shadows, slight mess.",
    people: false,
    photo: true,
  },
  {
    id: "visual_metaphor",
    label: "Conceptual metaphor",
    direction: "A plain, real photograph of ONE ordinary physical object or small arrangement that quietly stands for the idea (not a stock symbol). Simple unglamorous background, natural light, a single clear focal point, true-to-life color.",
    people: false,
    photo: true,
  },
  {
    id: "macro_texture",
    label: "Macro close-up",
    direction: "A close-up photograph of one real material or object from this work, shallow depth of field, honest texture and wear, soft directional daylight. Documentary, not product-ad glamour.",
    people: false,
    photo: true,
  },
  {
    id: "environment",
    label: "Atmospheric place",
    direction: "A photograph of a real-feeling place that evokes the idea (a studio, a workshop, a window at dusk, a quiet room before a meeting), people small or absent. Natural light, ordinary details, nothing staged or showroom-perfect.",
    people: false,
    photo: true,
  },
  // Opt-in only (client picks them in the portal); never in the default mix.
  {
    id: "editorial_illustration",
    label: "Editorial illustration",
    direction: "A bold contemporary editorial illustration -- flat expressive shapes, a limited confident palette, a clever composition like a magazine feature spread. Illustration, not photography.",
    people: true,
    photo: false,
  },
  {
    id: "paper_collage",
    label: "Paper collage",
    direction: "A tactile layered cut-paper collage with visible paper grain, torn edges and soft cast shadows. Handmade, playful, graphic.",
    people: true,
    photo: false,
  },
  {
    id: "isometric_3d",
    label: "Playful 3D scene",
    direction: "A playful isometric 3D scene in matte clay-like materials that stages the idea as a small self-contained world. Soft studio lighting, tidy and charming.",
    people: true,
    photo: false,
  },
];

// Rotated per image so even two shots in the same style differ in how they were
// "taken". Photo styles only.
const LIGHT_SETUPS = [
  "overcast daylight through a large window, soft and a little flat",
  "low late-afternoon sun coming in from the side, warm but not orange",
  "mixed office lighting and daylight, slightly uneven color temperature",
  "a single warm desk lamp in a dim room, natural falloff into shadow",
  "bright midday open shade, neutral color, honest highlights",
  "early-morning cool light with a hint of warmth at the edges",
];
const CAMERA_SETUPS = [
  "shot on a 35mm lens at f/2, subtle grain",
  "shot on a phone main camera, mild digital noise",
  "shot on a 50mm lens at f/2.8, natural color, no stylized grading",
  "shot on a 28mm lens, handheld, slightly imperfect horizon",
  "shot on a compact film-style camera, soft contrast, fine grain",
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

/**
 * Least-recently-used style among the allowed ones. Picking by content hash
 * (the old behaviour) was random, so one client could get the same look three
 * posts running. Never-used styles go first, then the one used longest ago;
 * the content hash only breaks ties.
 *
 * With no client preference the pool is the photographic styles only.
 */
export function pickImageStyle(
  post: ImagePromptPost,
  prefs: CreativeImagePrefs | undefined,
  recentStyleIds: Array<string | null | undefined> = [],
): ImageStyle {
  const chosen = Array.isArray(prefs?.image_styles) && prefs!.image_styles!.length
    ? IMAGE_STYLES.filter((s) => prefs!.image_styles!.includes(s.id))
    : IMAGE_STYLES.filter((s) => s.photo);
  const pool = chosen.length ? chosen : IMAGE_STYLES.filter((s) => s.photo);
  // recentStyleIds is newest-first: index = how recently the style was used.
  const age = (id: string) => {
    const i = recentStyleIds.indexOf(id);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  let best = -Infinity;
  let tied: ImageStyle[] = [];
  for (const st of pool) {
    const a = age(st.id);
    if (a > best) { best = a; tied = [st]; } else if (a === best) tied.push(st);
  }
  return tied[hashSeed(`${post.title || ""}${post.content}`) % tied.length];
}

/** Past image plans for a client (newest first), read from calendar metadata. */
export interface ImageLedgerEntry {
  style?: string | null;
  concept?: string | null;
}

export async function loadRecentImageLedger(supabase: any, clientId: string, limit = 8): Promise<ImageLedgerEntry[]> {
  try {
    const { data } = await supabase
      .from("content_calendar")
      .select("metadata")
      .eq("client_account_id", clientId)
      .not("metadata->>image_style", "is", null)
      .order("updated_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((r: any) => ({ style: r.metadata?.image_style ?? null, concept: r.metadata?.image_concept ?? null }));
  } catch (e) {
    console.warn("[creative-image] ledger load failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

const CLICHES =
  "glowing or mechanical brain, scales of justice, lightbulb-as-idea, gears/cogs, handshake close-up, circuit-board overlays, DNA helix, floating abstract geometry, generic posed businesspeople at a meeting table, laptops with charts, stacks of coloured blocks on a desk, people pointing at a whiteboard or sticky notes, a person staring thoughtfully out of a window";

// The visual tells of AI imagery. Stated as constraints on every photo prompt.
const AI_TELLS =
  "glossy or waxy skin, over-smoothed surfaces, teal-and-orange cinematic grading, HDR glow, uniformly perfect lighting, creamy bokeh on everything, showroom-tidy rooms, perfectly symmetrical composition, vacant stock-photo smiles, hyper-saturated color";

async function writeConcept(
  client: ImagePromptClient,
  post: ImagePromptPost,
  style: ImageStyle,
  never: string[],
  recentConcepts: string[] = [],
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
        (recentConcepts.length
          ? ` This client's recent images already used these concepts -- yours must differ in subject, setting AND composition: ${recentConcepts.map((c) => `"${c.slice(0, 120)}"`).join(" | ")}.`
          : "") +
        (never.length ? ` The client never wants to see: ${never.join("; ")}.` : "") +
        " Return ONLY the concept.",
      prompt: `Business: ${client.business_name} (${client.industry || "business"})\n${facts}\n\nPost${post.title ? ` "${post.title}"` : ""}:\n${post.content.slice(0, 600)}\n\nRender style: ${style.direction}`,
      maxTokens: 160,
      temperature: 1,
    });
    const concept = out.trim().replace(/^["']|["']$/g, "");
    return concept.length >= 20 ? concept : null;
  } catch (e) {
    console.warn("[creative-image] concept step failed, using fallback prompt:", e instanceof Error ? e.message : e);
    return null;
  }
}

export interface CreativeImagePlan {
  prompt: string;
  /** Style id to stamp on the calendar row (metadata.image_style) so the next image rotates. */
  styleId: string;
  /** The concept sentence (metadata.image_concept), or null when the fallback prompt was used. */
  concept: string | null;
}

/**
 * Plans one post image. `ledger` is the client's recent image plans (newest
 * first, see loadRecentImageLedger); callers generating several images in one
 * run should unshift each returned plan into it so siblings differ too.
 */
export async function planCreativeImage(
  client: ImagePromptClient,
  post: ImagePromptPost,
  ledger: ImageLedgerEntry[] = [],
): Promise<CreativeImagePlan> {
  const prefs = (client.context_profile ?? {}) as CreativeImagePrefs;
  const never = Array.isArray(prefs.image_never) ? prefs.image_never : [];
  const style = pickImageStyle(post, prefs, ledger.map((l) => l.style));
  const recentConcepts = ledger.map((l) => l.concept).filter((c): c is string => !!c).slice(0, 6);
  const concept = await writeConcept(client, post, style, never, recentConcepts);
  if (!concept) return { prompt: buildSocialImagePrompt(client, post), styleId: style.id, concept: null };

  const h = hashSeed(`${post.content}${ledger.length}`);
  const capture = style.photo
    ? ` Light: ${LIGHT_SETUPS[h % LIGHT_SETUPS.length]}. Capture: ${CAMERA_SETUPS[(h >> 3) % CAMERA_SETUPS.length]}.`
    : "";

  const constraints = [
    `No text of any kind: no letters, numbers, captions, signage, logos or watermarks. Anything that would normally carry text (a screen, page, sign, shirt) is soft out-of-focus shapes instead.`,
    `Keep the bottom 15% of the frame visually calm and uncluttered (a brand bar is added there afterwards).`,
    `Avoid clichés: ${CLICHES}.`,
    ...(style.photo ? [`It must not look AI-generated or like stock photography. Avoid: ${AI_TELLS}.`] : []),
    style.people
      ? `If people appear they must look real: natural facial asymmetry, correct hands and limbs, realistic skin with pores, candid expressions, ordinary everyday clothes -- no waxy, over-smoothed or stock-photo-grin look.`
      : `Do not include people.`,
    ...(never.length ? [`Never show: ${never.join("; ")}.`] : []),
  ];

  const prompt = [
    `Scene: Social media image for ${client.business_name}${client.industry ? ` (${client.industry})` : ""}.${post.title ? ` Post: "${post.title}".` : ""}`,
    `Visual concept: ${concept}`,
    `Style: ${style.direction}${capture}`,
    style.photo
      ? `Mood: natural, lived-in and authentic. Imperfect on purpose; never glossy, polished or "premium".`
      : `Mood: considered, contemporary, distinctive.`,
    `Constraints: ${constraints.join(" ")}`,
  ].join("\n");
  return { prompt, styleId: style.id, concept };
}

/** Prompt-only wrapper kept for callers that don't track a ledger. */
export async function buildCreativeImagePrompt(
  client: ImagePromptClient,
  post: ImagePromptPost,
  ledger: ImageLedgerEntry[] = [],
): Promise<string> {
  return (await planCreativeImage(client, post, ledger)).prompt;
}
