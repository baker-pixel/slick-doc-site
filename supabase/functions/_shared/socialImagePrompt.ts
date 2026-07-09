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

// LinkedIn is the audience most likely to judge a client by visual polish;
// everything else stays on medium (half the cost, fine at feed sizes).
export function imageQualityForPlatform(platform: string): "medium" | "high" {
  return platform?.toLowerCase?.() === "linkedin" ? "high" : "medium";
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

  const whoLine = summary
    ? `Social media image for ${client.business_name}. ${summary}`
    : `Social media image for ${client.business_name}, a ${industry} business.`;

  const subjectLine = post.title
    ? `The post this accompanies: "${post.title}". Content gist: ${post.content.slice(0, 220)}`
    : `Content gist: ${post.content.slice(0, 220)}`;

  const parts: string[] = [whoLine, subjectLine];

  if (abstract) {
    parts.push(
      services
        ? `Depict the offering itself, drawn from what they sell: ${services}.`
        : `Depict the offering itself, tied to the post's topic.`,
      `Strong subjects: the product or report as a clean screen/document mockup, charts and diagrams that represent the concept, or a premium conceptual 3D/isometric render of the service in action.`,
      `Do not show generic office workers, posed businesspeople, or stock-photo meeting scenes unless the post is explicitly about people or teams.`,
    );
  } else {
    parts.push(
      services ? `Show the work itself -- ${services} -- its craft, setting, or results.` : `Show the work itself: its craft, setting, or results.`,
      `Photorealistic, natural lighting, editorial business-photography style, not stock-photo stiff.`,
    );
    if (location) parts.push(`Could plausibly be set in or near ${location}.`);
  }

  if (differentiator) parts.push(`Subtly reflect what sets them apart: ${differentiator}.`);
  if (audience) parts.push(`Made to appeal to ${audience} (aimed at them, not necessarily depicting them).`);

  parts.push(
    `Mood: ${mood}. Modern, premium, uncluttered.`,
    `Composition: clean negative space suitable for a text overlay.`,
    `No text, no logos, no watermarks, no illegible signage.`,
  );

  return parts.filter(Boolean).join(" ");
}
