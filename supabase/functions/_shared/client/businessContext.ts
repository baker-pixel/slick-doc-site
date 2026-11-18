// Whether a client has provided enough real business information for an
// engine to generate content/ICP/strategy *from*, instead of falling back to
// "unknown"/"local business"/"customers" placeholders that read as guessing.
// One check, reused at every generation entry point, instead of each caller
// inventing its own (weaker) test like `!!context_profile`.
export interface BusinessContextClient {
  industry?: string | null;
  context_profile?: { target_audience?: unknown } | null;
}

// inviteLeadToPortal stores "General" when a lead had no industry. That is "we don't know", not an
// answer, so anything that fills or reads the industry treats it as empty.
const PLACEHOLDER_INDUSTRY = /^(general|other|n\/?a|none|unknown|misc(ellaneous)?)$/i;

export function isPlaceholderIndustry(industry: string | null | undefined): boolean {
  return !industry?.trim() || PLACEHOLDER_INDUSTRY.test(industry.trim());
}

export function hasBusinessContext(client: BusinessContextClient): boolean {
  const industry = client.industry?.trim();
  const audience = client.context_profile?.target_audience;
  return !!industry && typeof audience === "string" && audience.trim().length > 0;
}
