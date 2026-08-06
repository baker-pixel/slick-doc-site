// Whether a client has provided enough real business information for an
// engine to generate content/ICP/strategy *from*, instead of falling back to
// "unknown"/"local business"/"customers" placeholders that read as guessing.
// One check, reused at every generation entry point, instead of each caller
// inventing its own (weaker) test like `!!context_profile`.
export interface BusinessContextClient {
  industry?: string | null;
  context_profile?: { target_audience?: unknown } | null;
}

export function hasBusinessContext(client: BusinessContextClient): boolean {
  const industry = client.industry?.trim();
  const audience = client.context_profile?.target_audience;
  return !!industry && typeof audience === "string" && audience.trim().length > 0;
}
