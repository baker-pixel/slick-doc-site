export interface ImagePromptClient {
  business_name: string;
  industry?: string | null;
  context_profile?: {
    differentiators?: string[];
    location?: string;
    tone?: string;
    target_audience?: string;
    services?: string[];
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

const ASPECT_RATIO: Record<string, string> = {
  instagram: "square (1:1)",
  facebook: "landscape (4:3)",
  linkedin: "landscape (4:3)",
  twitter: "landscape (16:9)",
};

/**
 * Builds a photography-style image prompt grounded in the client's actual
 * brand context and the specific post it's for, rather than a generic
 * "marketing image for {industry}" placeholder.
 */
export function buildSocialImagePrompt(client: ImagePromptClient, post: ImagePromptPost): string {
  const ctx = client.context_profile;
  const industry = client.industry || "local business";
  const mood = TONE_MOOD[ctx?.tone || ""] || "warm, professional, human";
  const ratio = ASPECT_RATIO[post.platform] || "square (1:1)";
  const differentiator = ctx?.differentiators?.[0];
  const location = ctx?.location;
  const audience = ctx?.target_audience;

  const sceneHints: string[] = [];
  if (differentiator) sceneHints.push(`subtly reflecting: ${differentiator}`);
  if (audience) sceneHints.push(`resonant with ${audience}`);
  if (location) sceneHints.push(`could plausibly be set in or near ${location}`);

  const subjectLine = post.title
    ? `The post this accompanies: "${post.title}". Content gist: ${post.content.slice(0, 220)}`
    : `Content gist: ${post.content.slice(0, 220)}`;

  return [
    `Photorealistic image for a ${industry} business called ${client.business_name}.`,
    subjectLine,
    sceneHints.length ? sceneHints.join("; ") + "." : "",
    `Mood: ${mood}. Natural lighting, editorial business-photography style, not stock-photo stiff.`,
    `Composition: ${ratio} aspect ratio, clean negative space suitable for a text overlay.`,
    `No text, no logos, no watermarks, no illegible signage.`,
  ].filter(Boolean).join(" ");
}
