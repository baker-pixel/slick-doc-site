import { callAI, MODELS } from "../ai/ai.ts";
import { buildSocialImagePrompt, type ImagePromptClient, type ImagePromptPost } from "./socialImagePrompt.ts";

// Concept-first, photo-real image prompts.
//
// How this avoids the "AI stock image" look:
//  1. Every default style is a real photographic genre, briefed the way a
//     photographer would be briefed (lens, light, framing, colour), with
//     explicit realism cues and a list of known AI tells to avoid.
//  2. Each client gets one consistent colour grade so their feed looks
//     cohesive. Genre, lens, light, framing and concept rotate per post.
//  3. Recent history (style ids + concepts), when passed in, makes the next
//     post skip the last few styles, tells the concept writer what was already
//     used, and picks the least-similar of three candidate concepts.
//  4. Any failure falls back to the old builder (with the client's "never"
//     list appended), so this step never blocks an image.

export type PeopleMode = "full" | "hands" | "none";

export interface ImageStyle {
  id: string;
  label: string;
  direction: string;
  people: PeopleMode;
  photographic: boolean;
  /** Used only when the client explicitly lists it in image_styles. */
  optIn?: boolean;
}

export const IMAGE_STYLES: ImageStyle[] = [
  {
    id: "candid_documentary",
    label: "Candid documentary",
    direction:
      "Candid documentary photograph of real people in an unposed moment that embodies the idea, caught mid-action or mid-conversation, nobody looking at the camera. Photojournalistic, like a well-shot magazine feature.",
    people: "full",
    photographic: true,
  },
  {
    id: "environmental_portrait",
    label: "Environmental portrait",
    direction:
      "Environmental portrait of one person in the place where the idea happens, relaxed rather than posed, with the surroundings telling half the story.",
    people: "full",
    photographic: true,
  },
  {
    id: "hands_at_work",
    label: "Hands at work",
    direction:
      "Close detail photograph of hands doing the work the idea is about, with the real tools and materials of the task. Faces out of frame.",
    people: "hands",
    photographic: true,
  },
  {
    id: "still_life",
    label: "Natural still life",
    direction:
      "Still-life photograph of a few real, everyday objects that tell the idea, on a real surface where they would naturally sit, arranged casually rather than styled to perfection.",
    people: "none",
    photographic: true,
  },
  {
    id: "place",
    label: "Atmospheric place",
    direction:
      "Atmospheric photograph of a place that evokes the idea, with no one present, as if taken just before or just after the moment happened.",
    people: "none",
    photographic: true,
  },
  {
    id: "over_shoulder",
    label: "Over-the-shoulder",
    direction:
      "Over-the-shoulder photograph that puts the viewer inside the moment: the foreground person soft and out of focus, the thing they are looking at sharp.",
    people: "full",
    photographic: true,
  },
  {
    id: "outdoor_lifestyle",
    label: "Outdoor lifestyle",
    direction:
      "Natural outdoor lifestyle photograph on a real street, in a park or neighbourhood, where the idea plays out in everyday life.",
    people: "full",
    photographic: true,
  },
  // Non-photographic styles: only used when a client opts in via image_styles.
  {
    id: "editorial_illustration",
    label: "Editorial illustration",
    direction:
      "Bold contemporary editorial illustration: flat expressive shapes, a limited confident palette, a clever magazine-feature composition.",
    people: "full",
    photographic: false,
    optIn: true,
  },
  {
    id: "paper_collage",
    label: "Paper collage",
    direction:
      "Tactile layered cut-paper collage with visible paper grain, torn edges and soft cast shadows. Handmade and graphic.",
    people: "full",
    photographic: false,
    optIn: true,
  },
  {
    id: "isometric_3d",
    label: "Playful 3D scene",
    direction:
      "Playful isometric 3D scene in matte clay-like materials that stages the idea as a small self-contained world. Soft studio lighting.",
    people: "full",
    photographic: false,
    optIn: true,
  },
];

// Rotated per post, each on its own hash so combinations vary independently.
const LENSES = [
  "35mm lens at f/2, eye level, handheld",
  "50mm lens at f/1.8",
  "28mm lens at f/4, with some environment in frame",
  "85mm lens at f/2, compressed background",
  "40mm lens at f/2.8, from a slightly low angle",
];

const LIGHT = [
  "soft window light from one side, falling off into natural shadow",
  "overcast daylight, even and soft",
  "low late-afternoon sun with long shadows",
  "mixed light: cool daylight from a window and a warm lamp indoors",
  "open shade outdoors, gentle and directional",
  "quiet early-morning light",
];

const FRAMING = [
  "subject off-centre, rule of thirds",
  "layered composition with something soft in the foreground",
  "simple composition with generous negative space",
  "loose handheld framing, not perfectly level",
];

// One per client (hashed on client id) unless the client sets image_grade.
const GRADES = [
  "natural colour like Kodak Portra 400, fine film grain",
  "muted, slightly desaturated colour with soft blacks, like Fuji Pro 400H",
  "true-to-life colour and neutral white balance, like a full-frame digital camera file",
  "warm soft colour with gentle highlight halation, like Cinestill 50D in daylight",
];

const REALISM =
  "Must look like a real photograph from a professional shoot, not a render: genuine optical depth of field, real lens character, " +
  "believable materials with wear, scuffs and fingerprints, a lived-in setting with ordinary everyday clutter, " +
  "and small natural imperfections in focus and framing.";

const AI_TELLS =
  "plastic or airbrushed skin, glowing rim light, over-saturated HDR colour, teal-and-orange grading, perfect symmetry, " +
  "everything razor-sharp front to back, floating dust motes and bokeh orbs, lens flares, spotless showroom-tidy spaces, " +
  "identical-looking faces, extra or fused fingers, garbled lettering";

const CLICHES =
  "glowing or mechanical brain, scales of justice, lightbulb-as-idea, gears/cogs, handshake close-up, circuit-board overlays, DNA helix, " +
  "floating abstract geometry, posed businesspeople at a meeting table, laptops with charts, stacks of coloured blocks on a desk";

export interface CreativeImagePrefs {
  /** Allowed style ids. Empty or missing means all non-opt-in styles. */
  image_styles?: string[];
  /** Things the client never wants shown. */
  image_never?: string[];
  /** Overrides the per-client colour grade. */
  image_grade?: string;
  /** Colour names work better than hex codes ("deep teal", not "#0F6B6B"). */
  brand_colors?: string[];
  /** City or region, so settings and people look local. */
  location?: string;
  /** false for digital-only businesses with no storefront or office. */
  has_public_location?: boolean;
  services?: string[];
  business_summary?: string;
  verified_facts?: string[];
}

/** Newest first. Store image_style_id and image_concept on each post to build this. */
export interface RecentImage {
  styleId?: string | null;
  concept?: string | null;
}

export interface CreativeImageResult {
  prompt: string;
  styleId: string | null;
  concept: string | null;
  usedFallback: boolean;
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: readonly T[], seed: string, salt: string): T {
  return arr[hashSeed(`${salt}:${seed}`) % arr.length];
}

function postSeed(post: ImagePromptPost): string {
  return `${post.title || ""}${post.content || ""}`;
}

export function pickImageStyle(
  post: ImagePromptPost,
  prefs: CreativeImagePrefs | undefined,
  recent: RecentImage[] = [],
): ImageStyle {
  const wanted = Array.isArray(prefs?.image_styles) ? prefs!.image_styles!.filter(Boolean) : [];
  const unknown = wanted.filter((id) => !IMAGE_STYLES.some((s) => s.id === id));
  if (unknown.length) console.warn("[creative-image] unknown image_styles ignored:", unknown);

  let pool = wanted.length
    ? IMAGE_STYLES.filter((s) => wanted.includes(s.id))
    : IMAGE_STYLES.filter((s) => !s.optIn);
  if (!pool.length) pool = IMAGE_STYLES.filter((s) => !s.optIn);

  // Skip the styles used in the last few posts when there are others to choose from.
  const recentIds = new Set(recent.slice(0, 3).map((r) => r.styleId).filter(Boolean));
  const fresh = pool.filter((s) => !recentIds.has(s.id));
  const finalPool = fresh.length ? fresh : pool;

  return finalPool[hashSeed(postSeed(post)) % finalPool.length];
}

// ---------- setting variety ----------

// Where the scene happens. Rotated per post (hash of the post) so one client's
// feed moves between worlds instead of living in one café. The concept writer
// may adapt it when it makes no sense for the post's message.
const SETTINGS = [
  "a working space where the trade actually happens (workshop, studio, kitchen, shop floor, garage, job site)",
  "outdoors in a real neighbourhood: a street, market, park, porch or parking lot",
  "inside someone's home: a doorstep, hallway, living room or home office",
  "a venue or event: a pop-up, class, meetup, fitting, rehearsal or the wings of a stage",
  "on the move: a car, a train platform, a walk between places, a loading dock",
  "behind or in front of a local shop counter, with the day's ordinary activity around it",
  "a tight detail of a real task with its surroundings falling out of focus",
  "a place at a specific time of day with nobody in it yet, or no longer",
];

// Scenes the concept writer falls into by default, whatever the business.
const DEFAULT_SCENES =
  "a café or coffee shop, a steaming mug or cup, a notebook and pen, a laptop, or a phone resting on a wooden table by a window";

// Motifs worth steering away from once they show up in a client's recent images.
const MOTIFS: { label: string; re: RegExp }[] = [
  { label: "a café or coffee shop", re: /\b(caf[eé]s?|coffee)\b/i },
  { label: "a mug, cup or latte", re: /\b(mugs?|cups?|latte|teacup)\b/i },
  { label: "a notebook, journal or pen", re: /\b(notebooks?|journals?|pens?)\b/i },
  { label: "a laptop", re: /\blaptops?\b/i },
  { label: "a smartphone", re: /\b(smartphones?|phones?)\b/i },
  { label: "a wooden table, desk or counter", re: /\bwooden (table|desk|counter)s?\b/i },
  { label: "a window with soft light", re: /\bwindows?\b/i },
];

/** Motifs that already appear in two or more of a client's recent concepts. */
export function overusedMotifs(recentConcepts: string[]): string[] {
  return MOTIFS
    .filter((m) => recentConcepts.filter((c) => m.re.test(c)).length >= 2)
    .map((m) => m.label);
}

/**
 * A client's most recent images (newest first), so the next one can avoid their
 * styles, concepts and overused motifs. Reads what the image pipeline already
 * stores on each post (image_style_id, image_concept).
 */
export async function loadRecentImageLedger(
  supabase: any,
  clientId: string,
  excludeId?: string,
  limit = 8,
): Promise<RecentImage[]> {
  try {
    const { data } = await supabase
      .from("content_calendar")
      .select("id, metadata")
      .eq("client_account_id", clientId)
      .not("metadata->>image_concept", "is", null)
      .order("updated_at", { ascending: false })
      .limit(limit + 1);
    return (data ?? [])
      .filter((r: any) => r.id !== excludeId)
      .slice(0, limit)
      .map((r: any) => ({
        styleId: (r.metadata?.image_style_id as string | undefined) ?? null,
        concept: (r.metadata?.image_concept as string | undefined) ?? null,
      }));
  } catch (e) {
    console.warn("[creative-image] could not load recent images:", e instanceof Error ? e.message : e);
    return [];
  }
}

// ---------- concept novelty ----------

const STOP = new Set([
  "with", "that", "this", "from", "into", "their", "they", "there", "while", "where", "which", "about",
  "under", "over", "some", "each", "just", "like", "than", "then", "them", "have", "been", "were", "onto",
]);

function tokens(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)));
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

function pickFreshest(candidates: string[], recent: string[]): string {
  const recentTokens = recent.map(tokens);
  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const t = tokens(c);
    const score = recentTokens.reduce((m, r) => Math.max(m, similarity(t, r)), 0);
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function parseConcepts(raw: string): string[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let list: unknown;
  try {
    list = JSON.parse(cleaned)?.concepts;
  } catch {
    list = cleaned.split(/\n+/);
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((c) =>
      String(c)
        .trim()
        .replace(/^[-*•]\s*/, "")
        .replace(/^\d+[.)]\s*/, "")
        .replace(/^concept\s*\d*\s*:\s*/i, "")
        .replace(/^["']|["']$/g, "")
        .trim()
    )
    // Reject fragments and anything cut off by the token limit.
    .filter((c) => c.length >= 40 && /[.!?]["')]?$/.test(c));
}

// ---------- concept writer ----------

async function writeConcept(
  client: ImagePromptClient,
  post: ImagePromptPost,
  style: ImageStyle,
  prefs: CreativeImagePrefs,
  never: string[],
  recentConcepts: string[],
  setting: string,
): Promise<string | null> {
  const overused = overusedMotifs(recentConcepts);
  const facts = [
    prefs.business_summary,
    prefs.services?.length ? `Services: ${prefs.services.join(", ")}` : "",
    prefs.verified_facts?.length ? `Verified facts: ${prefs.verified_facts.join("; ")}` : "",
    prefs.location ? `Location: ${prefs.location}` : "",
  ].filter(Boolean).join("\n");

  const peopleRule =
    style.people === "none"
      ? "The scene contains no people and no body parts."
      : style.people === "hands"
      ? "Only hands and forearms may appear, never faces."
      : "If people appear, say specifically who they are (rough age, role) and what they are doing.";

  const rules = [
    "You are the creative director of a top social media agency briefing a photographer.",
    "Turn the post's ONE core idea into a concrete visual concept: what is in frame, where, what is happening, at what moment.",
    "It must relate to this post's specific message, not just the company's product category.",
    "Favour specific, observed, slightly unexpected real-life details over generic scenes. A concept a stock site would already have is a failure.",
    "It must stop a thumb in under a second: ONE idea, ONE clear focal point that still reads at thumbnail size, strong contrast or a bold colour. Make it unexpected through the angle, the scale, a telling juxtaposition, or the moment just before or after the obvious one.",
    "Do not default to two or three people sitting and talking at a table, people laughing at a laptop, handshakes or generic teamwork. Prefer a single subject, a specific action, or an object that tells the story.",
    peopleRule,
    "Depict a situation the audience recognises, not the client's actual staff, office, customers or branded products, because this is a generated image and must not pass as a photo of them.",
    prefs.has_public_location === false
      ? "This business has no storefront or office open to the public; do not show one as theirs. Set the scene where their customers or the work actually are."
      : "",
    prefs.location ? `Setting, people, architecture and objects must plausibly belong in ${prefs.location}.` : "",
    "Do NOT depict software screens, dashboards, AI visuals or product UIs. No text, letters, numbers or logos anywhere. Nothing that needs readable writing to make sense: no signs, chalkboards, handwritten notes or screens.",
    `Do not default to ${DEFAULT_SCENES}. Use any of those only when the post is genuinely about it.`,
    `For variety, set it in or around: ${setting}. Adapt if that makes no sense for this post's message.`,
    overused.length ? `This client's recent images already leaned on ${overused.join(", ")}. Do not use them again.` : "",
    `Avoid clichés: ${CLICHES}.`,
    never.length ? `The client never wants to see: ${never.join("; ")}.` : "",
    recentConcepts.length
      ? `Recent images for this client used these concepts. Yours must clearly differ in setting, subject and composition:\n- ${recentConcepts.join("\n- ")}`
      : "",
    'Return JSON only, no prose: {"concepts": ["...", "...", "..."]} with three concepts of three different kinds, each one or two complete sentences and each a concrete scene: (1) a specific human moment, (2) a close detail or object that tells the whole story, (3) an unexpected perspective, scale or juxtaposition. All three must fit the genre you were given.',
  ].filter(Boolean).join("\n");

  try {
    const out = await callAI({
      source: "creative-image-concept",
      promptId: "creative-image-concept.v3",
      model: MODELS.creative,
      fallbackModels: [MODELS.default, MODELS.fast],
      clientId: client.id,
      system: rules,
      prompt:
        `Business: ${client.business_name} (${client.industry || "business"})\n${facts}\n\n` +
        `Post${post.title ? ` "${post.title}"` : ""}:\n${(post.content || "").slice(0, 600)}\n\n` +
        `Photographic genre to shoot it in: ${style.direction}`,
      maxTokens: 450,
      temperature: 0.9,
    });
    const candidates = parseConcepts(out);
    if (!candidates.length) {
      console.warn("[creative-image] no usable concepts parsed, using fallback prompt");
      return null;
    }
    return pickFreshest(candidates, recentConcepts);
  } catch (e) {
    console.warn("[creative-image] concept step failed, using fallback prompt:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ---------- prompt assembly ----------

function peopleConstraint(style: ImageStyle): string {
  if (style.people === "none") return "No people and no body parts anywhere in frame.";
  if (style.people === "hands") {
    return "Only hands and forearms in frame, no faces. Hands anatomically correct with five fingers, natural nails, real skin texture and creases.";
  }
  if (!style.photographic) return "If people appear, keep anatomy coherent (correct hands and limbs) in the illustration's own style.";
  return (
    "People look like ordinary real people, not models: varied ages and body types that fit the business's audience, " +
    "natural facial asymmetry, visible skin texture, flyaway hair, creased clothing, caught mid-action or mid-expression " +
    "rather than smiling at the camera. Hands anatomically correct with five fingers."
  );
}

/** A concept saved from an earlier attempt, reused so a retry skips the LLM call. */
export interface FixedConcept {
  concept: string;
  styleId?: string | null;
}

export async function buildCreativeImage(
  client: ImagePromptClient,
  post: ImagePromptPost,
  recent: RecentImage[] = [],
  fixed?: FixedConcept,
): Promise<CreativeImageResult> {
  const prefs = (client.context_profile ?? {}) as CreativeImagePrefs;
  const never = Array.isArray(prefs.image_never) ? prefs.image_never.filter(Boolean) : [];
  const fixedStyle = fixed?.styleId ? IMAGE_STYLES.find((s) => s.id === fixed.styleId) : undefined;
  const style = fixedStyle ?? pickImageStyle(post, prefs, recent);
  const recentConcepts = recent
    .map((r) => r.concept)
    .filter((c): c is string => typeof c === "string" && c.length > 0)
    .slice(0, 6);

  const concept = fixed?.concept?.trim() || await writeConcept(client, post, style, prefs, never, recentConcepts, pick(SETTINGS, postSeed(post), "setting"));
  if (!concept) {
    const base = await buildSocialImagePrompt(client, post);
    const prompt = never.length ? `${base}\nNever show: ${never.join("; ")}.` : base;
    return { prompt, styleId: null, concept: null, usedFallback: true };
  }

  const seed = postSeed(post);
  const shared = [
    `No text of any kind: no letters, numbers, captions, signage, logos or watermarks. Anything that would normally carry text (a screen, page, sign, label, shirt) shows only soft out-of-focus shapes.`,
    ...(never.length ? [`Never show: ${never.join("; ")}.`] : []),
  ];

  let lines: string[];
  if (style.photographic) {
    const grade = prefs.image_grade || pick(GRADES, String(client.id ?? client.business_name), "grade");
    const accent = prefs.brand_colors?.length
      ? `A quiet accent of ${prefs.brand_colors.slice(0, 2).join(" or ")} may appear naturally in a prop, garment or surrounding, never dominant and never as a logo.`
      : "";
    lines = [
      `Photograph for a social media post by ${client.business_name}${client.industry ? ` (${client.industry})` : ""}.`,
      `Scene: ${concept}`,
      `Genre: ${style.direction}`,
      `Camera: ${pick(LENSES, seed, "lens")}; ${pick(FRAMING, seed, "framing")}.`,
      `Light: ${pick(LIGHT, seed, "light")}.`,
      `Colour: ${grade}.`,
      `Realism: ${REALISM}`,
      `People: ${peopleConstraint(style)}`,
      prefs.location ? `Place: the setting, architecture and people plausibly belong in ${prefs.location}.` : "",
      accent,
      `Avoid: ${AI_TELLS}; ${CLICHES}.`,
      ...shared,
    ];
  } else {
    lines = [
      `Image for a social media post by ${client.business_name}${client.industry ? ` (${client.industry})` : ""}.`,
      `Visual concept: ${concept}`,
      `Style: ${style.direction}`,
      `People: ${peopleConstraint(style)}`,
      `Avoid: ${CLICHES}.`,
      ...shared,
    ];
  }

  return {
    prompt: lines.filter(Boolean).join("\n"),
    styleId: style.id,
    concept,
    usedFallback: false,
  };
}

/** Backwards-compatible wrapper for existing call sites. */
export async function buildCreativeImagePrompt(
  client: ImagePromptClient,
  post: ImagePromptPost,
  recent: RecentImage[] = [],
): Promise<string> {
  return (await buildCreativeImage(client, post, recent)).prompt;
}
