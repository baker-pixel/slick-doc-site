export interface ImagePromptClient {
  business_name: string;
  industry?: string | null;
  context_profile?: {
    differentiators?: string[];
    location?: string;
    tone?: string;
    target_audience?: string;
    services?: string[];
    business_summary?: string;
  } | null;
}

export interface ImagePromptPost {
  content: string;
  title?: string | null;
  platform: string;
}

const TONE_MOOD: Record<string, string> = {
  professional: "polished, confident, corporate",
  friendly: "warm, approachable, candid",
  casual: "relaxed, everyday, unposed",
  expert: "precise, focused, authoritative",
};

// gpt-image-1 canvas per platform. The prompt itself stays silent about
// aspect ratio -- the canvas decides it, and a ratio instruction that
// contradicts the canvas (the old hardcoded-square bug) just confuses the
// model.
const PLATFORM_SIZE: Record<string, string> = {
  instagram: "1024x1024",
  facebook: "1536x1024",
  linkedin: "1536x1024",
  twitter: "1536x1024",
};

export function imageSizeForPlatform(platform: string): string {
  return PLATFORM_SIZE[platform?.toLowerCase?.() || ""] || "1024x1024";
}

// Platforms that ever attach images. Instagram gets one every time; the
// rest get one every other post (see shouldGenerateImage) -- images cost
// real OpenAI spend per post, and IG is the platform where a bare-text post
// actually reads as broken.
export const IMAGE_ELIGIBLE_PLATFORMS = ["instagram", "facebook", "linkedin", "twitter"];

// Deterministic by post id, not run state, so generate-social-images-batch,
// sync-fill-missing-images, and postforme-publish-post's fallback all agree
// on the same posts without sharing any counter.
export function shouldGenerateImage(platform: string, contentCalendarId: string): boolean {
  const p = platform?.toLowerCase?.() || "";
  if (p === "instagram") return true;
  if (!IMAGE_ELIGIBLE_PLATFORMS.includes(p)) return false;
  const lastHexDigit = contentCalendarId.replace(/-/g, "").slice(-1);
  return parseInt(lastHexDigit, 16) % 2 === 0;
}

// Always the highest quality gpt-image-1 offers, on every platform.
export function imageQualityForPlatform(_platform: string): "medium" | "high" {
  return "high";
}

// Offerings you can't photograph (software, assessments, consulting, AI...)
// get conceptual renders of the offering itself; trades and physical
// services keep photorealistic photography. Matched against industry +
// services text, lowercase substring check.
const ABSTRACT_OFFERING_HINTS = [
  "software", "saas", " ai", "ai ", "artificial intelligence", "intelligence",
  "it service", "technology", "tech ", "digital", "consult", "assessment",
  "coaching", "training", "analytics", "data", "marketing", "advertis",
  "finance", "financial", "insurance", "legal", "accounting", "development",
  "engineering", "platform", "app ", "cyber", "cloud", "hr ", "recruit",
];

function isAbstractOffering(client: ImagePromptClient): boolean {
  const text = [client.industry || "", ...(client.context_profile?.services || [])]
    .join(" ")
    .toLowerCase();
  return ABSTRACT_OFFERING_HINTS.some((hint) => text.includes(hint));
}

// Rotated (not always the dashboard mockup) so abstract-offering clients don't
// get the same laptop-with-charts composition on every post. Any option that
// implies on-screen UI explicitly tells the model to render that text as
// blurred/abstract shapes -- gpt-image-1 invents garbled fake words otherwise.
// Each variant demands grounding in the client's actual services (injected
// separately below) -- without that, the model falls back to the same
// handful of universal "AI/business" stock clichés (glowing brain, scales of
// justice, lightbulb, gears) regardless of what the client actually does,
// which is generic and uninformative on every platform, not just one client.
const ABSTRACT_SUBJECTS = [
  `the product or report as a clean screen/document mockup, with any on-screen text rendered as soft blurred shapes and color blocks -- never legible words, letters, or numbers. Let the layout itself (chart shapes, data blocks, color-coded sections, a dashboard's structure) visually suggest what their specific offering shows or measures.`,
  `a premium conceptual 3D/isometric render of the service in action, built from objects and icons drawn from what they specifically do -- no screens, no legible text`,
  `a still-life composed ONLY of real objects, tools, or materials literally tied to their specific work -- considered composition, no screens, no legible text`,
  `an abstract macro/close-up shot of a texture, material, or object drawn from their specific work -- no screens, no legible text`,
  `a wide architectural or environmental shot of the kind of space this specific work happens in, empty of people and screens, evoking their work through setting alone`,
];

function pickAbstractSubject(post: ImagePromptPost): string {
  const seed = `${post.title || ""}${post.content}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return ABSTRACT_SUBJECTS[hash % ABSTRACT_SUBJECTS.length];
}

const VAGUE_LOCATIONS = new Set(["global", "worldwide", "online", "remote", "international"]);

/**
 * Builds an image prompt grounded in what the client actually sells (their
 * services / business summary) and the specific post it accompanies.
 *
 * Two subject modes:
 * - Abstract offerings (assessments, AI, software, consulting): depict the
 *   offering itself -- report mockups, charts, product UI, conceptual 3D
 *   renders -- and explicitly steer away from the generic-office-people
 *   imagery gpt-image-1 defaults to for "business photography".
 * - Physical services (remodeling, landscaping, restaurants...): keep
 *   photorealistic editorial photography of the work itself.
 */
export function buildSocialImagePrompt(client: ImagePromptClient, post: ImagePromptPost): string {
  const ctx = client.context_profile;
  const industry = client.industry || "local business";
  const mood = TONE_MOOD[ctx?.tone?.toLowerCase?.() || ""] || "warm, professional, modern";
  const services = (ctx?.services || []).slice(0, 3).join(", ");
  const summary = ctx?.business_summary;
  const differentiator = ctx?.differentiators?.[0];
  const audience = ctx?.target_audience;
  const location = ctx?.location && !VAGUE_LOCATIONS.has(ctx.location.toLowerCase()) ? ctx.location : undefined;
  const abstract = isAbstractOffering(client);

  const scene = [
    summary
      ? `Social media image for ${client.business_name}. ${summary}`
      : `Social media image for ${client.business_name}, a ${industry} business.`,
    post.title
      ? `The post this accompanies: "${post.title}". Content gist: ${post.content.slice(0, 220)}`
      : `Content gist: ${post.content.slice(0, 220)}`,
  ];

  const subject: string[] = [];
  const details: string[] = [];
  const constraints: string[] = [];

  if (abstract) {
    subject.push(
      services
        ? `Depict the offering itself using ONLY real objects, imagery, or visual metaphors drawn specifically from what they sell: ${services}. Every element in frame must trace back to something on this list -- do not substitute a generic symbol instead.`
        : `Depict the offering itself, tied to the post's topic -- grounded in specifics, not generic symbols.`,
      `Strong subject: ${pickAbstractSubject(post)}.`,
    );
    details.push(`Realistic materials, lighting, and reflections -- avoid a flat, plasticky, or uncanny CGI look.`);
    constraints.push(
      `Do not show generic office workers, posed businesspeople, or stock-photo meeting scenes unless the post is explicitly about people or teams.`,
      `Never fall back on generic AI/business stock clichés that could represent literally any company: no glowing or mechanical brain, no scales of justice, no lightbulb-as-idea, no gears/cogs, no handshake close-up, no circuit-board overlay on a head or body, no DNA helix, no floating abstract geometry with no real-world referent. If an object wouldn't plausibly be sitting on this specific business's desk or in their product, it doesn't belong in frame.`,
    );
  } else {
    subject.push(
      services ? `Show the work itself -- ${services} -- its craft, setting, or results.` : `Show the work itself: its craft, setting, or results.`,
      `If people appear: real, specific individuals caught in a genuine moment -- natural facial asymmetry, realistic skin texture with visible pores and minor imperfections, candid unposed expressions and body language, correct hand/limb anatomy, real fabric wrinkles, full bodies/hands framed naturally rather than cropped or posed for camera.`,
    );
    details.push(
      `Shot like a real camera photo -- natural/ambient light, true-to-life color and material texture, shallow depth of field, slight grain, candid editorial photojournalism style, not stock-photo stiff.`,
      `Contemporary setting and styling -- current clothing, decor, signage, and equipment, not dated or generic stock-photo staging.`,
    );
    constraints.push(`Avoid the telltale AI-generated look: no waxy/plastic skin, no over-smoothed or airbrushed surfaces, no perfectly symmetrical or vacant faces, no warped or extra fingers/limbs, no oversaturated HDR glow, no generic stock-photo grin.`);
    if (location) details.push(`Could plausibly be set in or near ${location}.`);
  }

  if (differentiator) details.push(`Subtly reflect what sets them apart: ${differentiator}.`);
  if (audience) details.push(`Made to appeal to ${audience} (aimed at them, not necessarily depicting them).`);
  details.push(`Mood: ${mood}. Modern, premium, uncluttered.`);

  constraints.push(
    `Composition: clean negative space suitable for a text overlay.`,
    `No extra text of any kind -- no on-screen copy, no logos, no watermarks, no illegible or garbled signage, no lettering on clothing/uniforms/props/buildings. If the subject would naturally include text (a screen, a sign, a page, a shirt), render it as soft out-of-focus shapes and color blocks, never as invented words or letters.`,
    `The business name, post title, and content gist above are background context only -- never render any of that wording as literal text, caption, or logo lettering anywhere in the image.`,
  );

  return [
    `Scene: ${scene.join(" ")}`,
    `Subject: ${subject.join(" ")}`,
    `Details: ${details.join(" ")}`,
    `Constraints: ${constraints.join(" ")}`,
  ].join("\n");
}
