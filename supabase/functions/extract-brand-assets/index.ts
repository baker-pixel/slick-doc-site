import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/http.ts";
import { callAIJson } from "../_shared/ai.ts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeUrl(url: string, base: string): string | null {
  try {
    if (!url || url.startsWith("data:")) return null;
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

type CandidateType =
  | "logo"
  | "favicon"
  | "og_image"
  | "color"
  | "font"
  | "headline"
  | "language"
  | "description";

interface Candidate {
  type: CandidateType;
  url?: string;
  value?: string;
  name: string;
  confidence: number;
}

const GENERIC_FONTS = new Set([
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui",
  "inherit", "initial", "unset", "var", "ui-sans-serif", "ui-serif",
  "ui-monospace", "-apple-system", "blinkmacsystemfont",
]);

function isGenericFont(name: string): boolean {
  return GENERIC_FONTS.has(name.toLowerCase().trim());
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

function parseHtml(html: string, baseUrl: string): Candidate[] {
  const candidates: Candidate[] = [];

  const faviconMatch =
    html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
  if (faviconMatch) {
    const url = normalizeUrl(faviconMatch[1], baseUrl);
    if (url) candidates.push({ type: "favicon", url, name: "Favicon", confidence: 90 });
  }

  const touchMatch =
    html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i);
  if (touchMatch) {
    const url = normalizeUrl(touchMatch[1], baseUrl);
    if (url) candidates.push({ type: "logo", url, name: "App Icon", confidence: 85 });
  }

  const ogMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (ogMatch) {
    const url = normalizeUrl(ogMatch[1], baseUrl);
    if (url) candidates.push({ type: "og_image", url, name: "Social Share Image", confidence: 80 });
  }

  const imgRegex = /<img[^>]+>/gi;
  let logoCount = 0;
  for (const m of html.matchAll(imgRegex)) {
    if (logoCount >= 3) break;
    const tag = m[0];
    if (!/logo|brand|header/i.test(tag)) continue;
    const srcM = tag.match(/src=["']([^"']+)["']/i);
    if (!srcM) continue;
    const url = normalizeUrl(srcM[1], baseUrl);
    if (!url) continue;
    const altM = tag.match(/alt=["']([^"']*)["']/i);
    candidates.push({ type: "logo", url, name: altM?.[1]?.trim() || "Logo", confidence: 75 });
    logoCount++;
  }

  const themeM =
    html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i);
  if (themeM) {
    const v = themeM[1].trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(v))
      candidates.push({ type: "color", value: v, name: v.toUpperCase(), confidence: 90 });
  }

  const tileM = html.match(
    /<meta[^>]+name=["']msapplication-TileColor["'][^>]*content=["']([^"']+)["']/i
  );
  if (tileM) {
    const v = tileM[1].trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(v))
      candidates.push({ type: "color", value: v, name: v.toUpperCase(), confidence: 70 });
  }

  const rootM = html.match(/:root\s*\{([^}]{0,3000})\}/);
  if (rootM) {
    let colorVarCount = 0;
    for (const vm of rootM[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
      if (colorVarCount >= 5) break;
      const varName = vm[1];
      const hex = vm[2];
      if (/color|brand|primary|secondary|accent/i.test(varName)) {
        candidates.push({ type: "color", value: hex, name: hex.toUpperCase(), confidence: 80 });
        colorVarCount++;
      }
    }
  }

  for (const m of html.matchAll(
    /<link[^>]+href=["']([^"']*fonts\.googleapis\.com[^"']*)["']/gi
  )) {
    const fontUrl = m[1];
    const familyParam = fontUrl.match(/family=([^&]+)/)?.[1] || "";
    for (const raw of familyParam.split("|").slice(0, 4)) {
      const family = decodeURIComponent(raw.split(":")[0].replace(/\+/g, " ").trim());
      if (family && family.length > 1 && !isGenericFont(family)) {
        candidates.push({ type: "font", value: family, name: family, confidence: 90 });
      }
    }
  }

  const seenFonts = new Set<string>();
  for (const sm of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = sm[1];
    for (const fm of css.matchAll(/font-family:\s*['"]?([^'",;\n{}(]+)/gi)) {
      const first = fm[1]
        .split(",")[0]
        .trim()
        .replace(/^['"]|['"]$/g, "")
        .trim();
      if (!first || first.length < 2 || first.length > 60) continue;
      if (isGenericFont(first)) continue;
      if (seenFonts.has(first.toLowerCase())) continue;
      seenFonts.add(first.toLowerCase());
      candidates.push({ type: "font", value: first, name: first, confidence: 65 });
      if (seenFonts.size >= 5) break;
    }
    if (seenFonts.size >= 5) break;
  }

  const h1M = html.match(/<h1[^>]*>\s*([^<]{5,120})\s*<\/h1>/i);
  if (h1M) {
    const text = h1M[1].replace(/\s+/g, " ").trim();
    if (text)
      candidates.push({ type: "headline", value: text, name: "Brand Headline", confidence: 85 });
  }

  const metaDescM =
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']{10,300})["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']{10,300})["'][^>]*name=["']description["']/i);
  if (metaDescM) {
    const text = metaDescM[1].trim();
    candidates.push({ type: "description", value: text, name: "Brand Description", confidence: 80 });
  }

  const langM = html.match(/<html[^>]+lang=["']([a-zA-Z-]{2,10})["']/i);
  if (langM) {
    const code = langM[1].trim();
    const langNames: Record<string, string> = {
      en: "English", "en-US": "English (US)", "en-GB": "English (UK)",
      fr: "French", de: "German", es: "Spanish", it: "Italian",
      pt: "Portuguese", nl: "Dutch", sv: "Swedish", da: "Danish",
      no: "Norwegian", fi: "Finnish", pl: "Polish", ru: "Russian",
      ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic",
    };
    const langName = langNames[code] || code.toUpperCase();
    candidates.push({ type: "language", value: code, name: langName, confidence: 95 });
  }

  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.type}:${c.url || c.value || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchAndStore(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  clientAccountId: string,
  label: string
): Promise<{ filePath: string; fileSize: number } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 OrangeDoor-BrandBot/1.0" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/png";
    const extMap: Record<string, string> = {
      "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
      "image/gif": "gif", "image/webp": "webp",
      "image/svg+xml": "svg", "image/x-icon": "ico",
    };
    const ext = extMap[contentType.split(";")[0].trim()] || "png";
    const arrayBuffer = await res.arrayBuffer();
    const fileSize = arrayBuffer.byteLength;
    if (fileSize > 5 * 1024 * 1024) return null;

    const safeName = label.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const filePath = `${clientAccountId}/scraped-${Date.now()}-${safeName}.${ext}`;
    const { error } = await supabase.storage
      .from("brand-assets")
      .upload(filePath, arrayBuffer, { contentType, upsert: false });
    if (error) return null;
    return { filePath, fileSize };
  } catch {
    return null;
  }
}

interface BrandVoiceAsset {
  sub_type: string;
  value: string | string[];
  name: string;
}

async function extractBrandVoice(
  html: string,
  contextProfile: Record<string, unknown> | null
): Promise<BrandVoiceAsset[]> {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) return [];

  const pageText = stripHtml(html);
  const cp = contextProfile || {};

  const prompt = `Analyse this website content and extract brand voice signals. Return ONLY valid JSON, no markdown.

PAGE TEXT (truncated):
${pageText}

BUSINESS CONTEXT:
${cp.target_audience ? `Target audience: ${cp.target_audience}` : ""}
${Array.isArray(cp.differentiators) ? `Differentiators: ${(cp.differentiators as string[]).join(", ")}` : ""}
${Array.isArray(cp.services) ? `Services: ${(cp.services as string[]).join(", ")}` : ""}
${cp.industry ? `Industry: ${cp.industry}` : ""}

Return this exact JSON structure (arrays of strings, all lowercase, no nulls):
{
  "tone_descriptors": ["3 to 5 adjectives describing brand voice"],
  "tagline": "hero section tagline or H1 if short and punchy, else empty string",
  "value_proposition": "core benefit statement in one sentence",
  "messaging_pillars": ["3 recurring themes the brand consistently communicates"],
  "audience_language": ["3 to 5 phrases target audience uses to describe their problems"],
  "what_we_never_say": ["3 to 5 words or phrases that conflict with this brand's tone"],
  "cta_style": "description of how CTAs are written e.g. action-oriented: Book a Call, Get Started"
}`;

  try {
    const parsed = await callAIJson<any>({
      source: "extract-brand-assets",
      system: "You are a brand strategist. Return only valid JSON. No markdown, no code fences.",
      prompt,
      maxTokens: 600,
      temperature: 0.3,
    });

    const results: BrandVoiceAsset[] = [];
    const list = (k: string, v: unknown) => Array.isArray(v) ? (v as string[]) : (typeof v === "string" && v ? [v] : []);

    if (list("tone_descriptors", parsed.tone_descriptors).length > 0)
      results.push({ sub_type: "tone_descriptors", value: list("tone_descriptors", parsed.tone_descriptors), name: "Tone Descriptors" });
    if (typeof parsed.tagline === "string" && parsed.tagline)
      results.push({ sub_type: "tagline", value: parsed.tagline, name: "Tagline" });
    if (typeof parsed.value_proposition === "string" && parsed.value_proposition)
      results.push({ sub_type: "value_proposition", value: parsed.value_proposition, name: "Value Proposition" });
    if (list("messaging_pillars", parsed.messaging_pillars).length > 0)
      results.push({ sub_type: "messaging_pillars", value: list("messaging_pillars", parsed.messaging_pillars), name: "Messaging Pillars" });
    if (list("audience_language", parsed.audience_language).length > 0)
      results.push({ sub_type: "audience_language", value: list("audience_language", parsed.audience_language), name: "Audience Language" });
    if (list("what_we_never_say", parsed.what_we_never_say).length > 0)
      results.push({ sub_type: "what_we_never_say", value: list("what_we_never_say", parsed.what_we_never_say), name: "What We Never Say" });
    if (typeof parsed.cta_style === "string" && parsed.cta_style)
      results.push({ sub_type: "cta_style", value: parsed.cta_style, name: "CTA Style" });

    return results;
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Service role client for writes
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { client_account_id, website_url, password } = body;

    if (!client_account_id || !website_url)
      return json({ error: "client_account_id and website_url are required" }, 400);

    // Auth: accept admin password in body OR validate client JWT
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    let isAdmin = false;

    if (password && adminPassword && password === adminPassword) {
      isAdmin = true;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);

      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !user) return json({ error: "Unauthorized" }, 401);

      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      isAdmin = !!roleRow;

      if (!isAdmin) {
        const { data: portalUser } = await supabase
          .from("client_portal_users")
          .select("client_account_id")
          .eq("user_id", user.id)
          .eq("client_account_id", client_account_id)
          .maybeSingle();
        if (!portalUser) return json({ error: "Forbidden" }, 403);
      }
    }

    let targetUrl = website_url.trim();
    if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl;

    // SSRF guard: only fetch public http(s) hosts — block internal/metadata IPs
    try {
      const parsed = new URL(targetUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return json({ error: "Only http(s) URLs are supported" }, 422);
      }
      const host = parsed.hostname;
      const isPrivate =
        host === "localhost" ||
        host === "169.254.169.254" ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        host === "::1" || host === "[::1]" ||
        host.endsWith(".internal") || host.endsWith(".local");
      if (isPrivate) {
        return json({ error: "URL points to a private or internal address" }, 422);
      }
    } catch {
      return json({ error: "Invalid website URL" }, 422);
    }

    let html: string;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 OrangeDoor-BrandBot/1.0", Accept: "text/html" },
      });
      clearTimeout(timeout);
      if (!res.ok) return json({ error: `Could not fetch website (HTTP ${res.status})` }, 422);
      html = await res.text();
    } catch (e: any) {
      if (e?.name === "AbortError") return json({ error: "Website took too long to respond" }, 422);
      return json({ error: `Could not reach website: ${e?.message}` }, 422);
    }

    // Fetch context_profile for brand voice extraction
    const { data: clientRow } = await supabase
      .from("client_accounts")
      .select("context_profile")
      .eq("id", client_account_id)
      .single();
    const contextProfile = (clientRow?.context_profile as Record<string, unknown> | null) ?? null;

    const candidates = parseHtml(html, targetUrl);
    const created: { id: string; name: string; asset_type: string; preview_url?: string }[] = [];

    const TEXT_ONLY_TYPES: CandidateType[] = ["font", "headline", "language", "description", "color"];

    for (const candidate of candidates) {
      if (TEXT_ONLY_TYPES.includes(candidate.type)) {
        const category =
          candidate.type === "font" ? "fonts" :
          candidate.type === "color" ? "colors" : "guidelines";

        const normalizedName = (candidate.value || candidate.name).trim();

        // Dedup: upsert by (client_account_id, asset_type, name) for color/font/language
        const isDeduped = ["color", "font", "language"].includes(candidate.type);

        if (isDeduped) {
          const { data: existing } = await supabase
            .from("brand_assets")
            .select("id, name, asset_type")
            .eq("client_account_id", client_account_id)
            .eq("asset_type", candidate.type)
            .ilike("name", normalizedName)
            .maybeSingle();

          if (existing) {
            // Update source/timestamp, keep existing confirmation status
            await supabase
              .from("brand_assets")
              .update({
                metadata: {
                  value: candidate.value,
                  hex: candidate.type === "color" ? candidate.value : undefined,
                  scraped_from: targetUrl,
                  confidence: candidate.confidence,
                  last_scraped_at: new Date().toISOString(),
                },
              })
              .eq("id", existing.id);
            created.push({ ...existing, preview_url: candidate.type === "color" ? candidate.value : undefined });
            continue;
          }
        }

        const { data, error } = await supabase
          .from("brand_assets")
          .insert({
            client_account_id,
            name: normalizedName,
            asset_type: candidate.type,
            category,
            description: `Auto-detected from ${targetUrl}`,
            metadata: {
              value: candidate.value,
              hex: candidate.type === "color" ? candidate.value : undefined,
              confirmation_status: "pending_client",
              scraped_from: targetUrl,
              confidence: candidate.confidence,
            },
          })
          .select("id, name, asset_type")
          .single();

        if (!error && data) {
          created.push({
            ...data,
            preview_url: candidate.type === "color" ? candidate.value : undefined,
          });
        }
        continue;
      }

      // Image assets
      const assetType = candidate.type === "favicon" ? "icon" : "logo";
      const stored = await fetchAndStore(supabase, candidate.url!, client_account_id, candidate.name);
      if (!stored) continue;

      const { data, error } = await supabase
        .from("brand_assets")
        .insert({
          client_account_id,
          name: candidate.name,
          asset_type: assetType,
          category: "logos",
          description: `Auto-detected from ${targetUrl}`,
          file_path: stored.filePath,
          file_size: stored.fileSize,
          metadata: {
            confirmation_status: "pending_client",
            scraped_from: targetUrl,
            original_url: candidate.url,
            confidence: candidate.confidence,
          },
        })
        .select("id, name, asset_type")
        .single();

      if (!error && data) {
        const { data: urlData } = await supabase.storage
          .from("brand-assets")
          .createSignedUrl(stored.filePath, 3600);
        created.push({ ...data, preview_url: urlData?.signedUrl });
      }
    }

    // Brand voice extraction (non-blocking — best effort)
    try {
      const voiceAssets = await extractBrandVoice(html, contextProfile);

      for (const va of voiceAssets) {
        // Dedup by sub_type
        const { data: existing } = await supabase
          .from("brand_assets")
          .select("id")
          .eq("client_account_id", client_account_id)
          .eq("asset_type", "brand_voice")
          .eq("metadata->>sub_type", va.sub_type)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("brand_assets")
            .update({
              metadata: {
                sub_type: va.sub_type,
                value: va.value,
                scraped_from: targetUrl,
                last_scraped_at: new Date().toISOString(),
              },
            })
            .eq("id", existing.id);
        } else {
          const { data: inserted } = await supabase
            .from("brand_assets")
            .insert({
              client_account_id,
              name: va.name,
              asset_type: "brand_voice",
              category: "guidelines",
              description: `AI-extracted from ${targetUrl}`,
              metadata: {
                sub_type: va.sub_type,
                value: va.value,
                confirmation_status: "pending_client",
                scraped_from: targetUrl,
              },
            })
            .select("id, name, asset_type")
            .single();

          if (inserted) {
            created.push({ ...inserted });
          }
        }
      }
    } catch (e) {
      console.error("Brand voice extraction failed (non-fatal):", e);
    }

    return json({
      assets: created,
      message: `Extracted ${created.length} brand asset${created.length !== 1 ? "s" : ""} from ${targetUrl}`,
    });
  } catch (err: any) {
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
