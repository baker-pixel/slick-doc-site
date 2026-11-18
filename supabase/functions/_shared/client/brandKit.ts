import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface BrandKit {
  client_id: string;
  visual: {
    primary_logo_url: string | null;
    favicon_url: string | null;
    color_palette: string[];
    primary_font: string | null;
    secondary_font: string | null;
  };
  voice: {
    tone_descriptors: string[];
    tagline: string | null;
    value_proposition: string | null;
    messaging_pillars: string[];
    audience_language: string[];
    what_we_never_say: string[];
    cta_style: string | null;
  };
  business: {
    name: string;
    industry: string | null;
    target_audience: string | null;
    location: string | null;
    differentiators: string[];
  };
}

export async function getClientBrandKit(
  supabase: SupabaseClient,
  clientId: string,
  confirmedOnly = true
): Promise<BrandKit> {
  let query = supabase
    .from("brand_assets")
    .select("id, name, asset_type, file_path, file_url, metadata, is_primary, confirmed")
    .eq("client_account_id", clientId)
    .order("is_primary", { ascending: false });

  if (confirmedOnly) query = query.eq("confirmed", true);

  const { data: assets } = await query;
  const rows = assets || [];

  const { data: client } = await supabase
    .from("client_accounts")
    .select("business_name, industry, context_profile")
    .eq("id", clientId)
    .single();

  const cp = (client?.context_profile as Record<string, unknown> | null) ?? {};

  // Visual
  const logos = rows.filter((r) => r.asset_type === "logo");
  const icons = rows.filter((r) => r.asset_type === "icon");
  const colors = rows.filter((r) => r.asset_type === "color");
  const fonts = rows.filter((r) => r.asset_type === "font");

  async function signedUrl(row: { file_path?: string | null; file_url?: string | null }): Promise<string | null> {
    if (row.file_path) {
      const { data } = await supabase.storage
        .from("brand-assets")
        .createSignedUrl(row.file_path, 3600);
      return data?.signedUrl ?? null;
    }
    return row.file_url ?? null;
  }

  const primaryLogoUrl = logos[0] ? await signedUrl(logos[0]) : null;
  const faviconUrl = icons[0] ? await signedUrl(icons[0]) : null;

  const colorPalette = colors
    .map((c) => (c.metadata?.hex || c.metadata?.value || c.name) as string)
    .filter(Boolean);

  const primaryFont = (fonts[0]?.metadata?.value || fonts[0]?.name) as string | null ?? null;
  const secondaryFont = (fonts[1]?.metadata?.value || fonts[1]?.name) as string | null ?? null;

  // Brand voice
  const voiceRows = rows.filter((r) => r.asset_type === "brand_voice");

  function voiceList(subType: string): string[] {
    const row = voiceRows.find((r) => r.metadata?.sub_type === subType);
    if (!row) return [];
    const v = row.metadata?.value;
    if (Array.isArray(v)) return v as string[];
    if (typeof v === "string") return v.split(/[,;]\s*/).filter(Boolean);
    return [];
  }

  function voiceSingle(subType: string): string | null {
    const row = voiceRows.find((r) => r.metadata?.sub_type === subType);
    if (!row) return null;
    const v = row.metadata?.value;
    if (Array.isArray(v)) return (v as string[])[0] ?? null;
    return typeof v === "string" ? v : null;
  }

  // Fallback to legacy headline/description assets
  const legacyTagline = rows.find((r) => r.asset_type === "headline")?.metadata?.value as string | null ?? null;
  const legacyValueProp = rows.find((r) => r.asset_type === "description")?.metadata?.value as string | null ?? null;

  return {
    client_id: clientId,
    visual: {
      primary_logo_url: primaryLogoUrl,
      favicon_url: faviconUrl,
      color_palette: colorPalette,
      primary_font: primaryFont,
      secondary_font: secondaryFont,
    },
    voice: {
      tone_descriptors: voiceList("tone_descriptors"),
      tagline: voiceSingle("tagline") || legacyTagline,
      value_proposition: voiceSingle("value_proposition") || legacyValueProp,
      messaging_pillars: voiceList("messaging_pillars"),
      audience_language: voiceList("audience_language"),
      what_we_never_say: voiceList("what_we_never_say"),
      cta_style: voiceSingle("cta_style"),
    },
    business: {
      name: (client?.business_name as string) || "Unknown",
      industry: (client?.industry as string | null) || ((cp.services as string[] | undefined)?.join(", ") ?? null),
      target_audience: (cp.target_audience as string | undefined) ?? null,
      location: (cp.location as string | undefined) ?? null,
      differentiators: Array.isArray(cp.differentiators) ? (cp.differentiators as string[]) : [],
    },
  };
}

export function brandKitToPromptBlock(kit: BrandKit): string {
  const lines: string[] = [
    `BRAND KIT FOR THIS CLIENT:`,
    `Business: ${kit.business.name} | Industry: ${kit.business.industry ?? "unknown"}`,
  ];

  if (kit.voice.tone_descriptors.length > 0)
    lines.push(`Tone: ${kit.voice.tone_descriptors.join(", ")}`);
  if (kit.voice.value_proposition)
    lines.push(`Value proposition: ${kit.voice.value_proposition}`);
  if (kit.voice.messaging_pillars.length > 0)
    lines.push(`Messaging pillars: ${kit.voice.messaging_pillars.join(" | ")}`);
  if (kit.voice.audience_language.length > 0)
    lines.push(`Audience language to use: ${kit.voice.audience_language.join(", ")}`);
  if (kit.voice.what_we_never_say.length > 0)
    lines.push(`Never use: ${kit.voice.what_we_never_say.join(", ")}`);
  if (kit.voice.cta_style)
    lines.push(`CTA style: ${kit.voice.cta_style}`);
  if (kit.visual.color_palette.length > 0)
    lines.push(`Color palette: ${kit.visual.color_palette.join(", ")} (reference if describing visual elements)`);

  return lines.join("\n");
}
