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
  /** Inline SVG markup (header logos with no raster source) — stored as text, never fetched. */
  svgMarkup?: string;
}

interface RenderedLogoSignal {
  url: string | null;
  svgMarkup: string | null;
  source: string;
}

interface RenderedSignals {
  logo: RenderedLogoSignal | null;
  favicon: string | null;
  ogImage: string | null;
  colors: string[];
  headingFont: string | null;
  bodyFont: string | null;
  headline: string | null;
  description: string | null;
  language: string | null;
  pageText: string;
}

const APP_URL = Deno.env.get("APP_URL") || "https://orangedoormarketing.com";

const LOGO_SOURCE_CONFIDENCE: Record<string, number> = {
  icon_link: 90,
  og_image: 80,
  header_img_position: 78,
  header_inline_svg: 72,
  header_css_background: 68,
};

const LANG_NAMES: Record<string, string> = {
  en: "English", "en-US": "English (US)", "en-GB": "English (UK)",
  fr: "French", de: "German", es: "Spanish", it: "Italian",
  pt: "Portuguese", nl: "Dutch", sv: "Swedish", da: "Danish",
  no: "Norwegian", fi: "Finnish", pl: "Polish", ru: "Russian",
  ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic",
};

/** Calls the headless-render Vercel function (Deno edge functions can't run
 * Chromium themselves) for JS-rendered extraction. Never throws — a site
 * that blocks the renderer, or the service being unconfigured/down, falls
 * back to the static-HTML regex parse below rather than failing the request. */
async function callRenderService(targetUrl: string): Promise<RenderedSignals | null> {
  const secret = Deno.env.get("BRAND_RENDER_SECRET");
  if (!secret) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const res = await fetch(`${APP_URL}/api/render-brand-assets`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ url: targetUrl }),
    });
    if (!res.ok) {
      console.warn(`[extract-brand-assets] render service returned ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn("[extract-brand-assets] render service call failed:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function renderedSignalsToCandidates(sig: RenderedSignals, baseUrl: string): Candidate[] {
  const candidates: Candidate[] = [];

  if (sig.logo?.svgMarkup) {
    candidates.push({
      type: "logo",
      svgMarkup: sig.logo.svgMarkup,
      name: "Logo (inline SVG)",
      confidence: LOGO_SOURCE_CONFIDENCE[sig.logo.source] ?? 65,
    });
  } else if (sig.logo?.url) {
    const url = normalizeUrl(sig.logo.url, baseUrl);
    if (url) {
      candidates.push({ type: "logo", url, name: "Logo", confidence: LOGO_SOURCE_CONFIDENCE[sig.logo.source] ?? 65 });
    }
  }

  const faviconUrl = sig.favicon ? normalizeUrl(sig.favicon, baseUrl) : null;
  if (faviconUrl) candidates.push({ type: "favicon", url: faviconUrl, name: "Favicon", confidence: 90 });

  const ogUrl = sig.ogImage ? normalizeUrl(sig.ogImage, baseUrl) : null;
  if (ogUrl) candidates.push({ type: "og_image", url: ogUrl, name: "Social Share Image", confidence: 80 });

  for (const hex of sig.colors) {
    if (/^#[0-9a-fA-F]{3,8}$/.test(hex)) {
      candidates.push({ type: "color", value: hex, name: hex.toUpperCase(), confidence: 85 });
    }
  }

  if (sig.headingFont) candidates.push({ type: "font", value: sig.headingFont, name: sig.headingFont, confidence: 90 });
  if (sig.bodyFont && sig.bodyFont !== sig.headingFont) {
    candidates.push({ type: "font", value: sig.bodyFont, name: sig.bodyFont, confidence: 85 });
  }

  if (sig.headline) candidates.push({ type: "headline", value: sig.headline, name: "Brand Headline", confidence: 88 });
  if (sig.description) {
    candidates.push({ type: "description", value: sig.description, name: "Brand Description", confidence: 85 });
  }

  if (sig.language) {
    const langName = LANG_NAMES[sig.language] || sig.language.toUpperCase();
    candidates.push({ type: "language", value: sig.language, name: langName, confidence: 95 });
  }

  return candidates;
}

const GENERIC_FONTS = new Set([
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui",
  "inherit", "initial", "unset", "var", "ui-sans-serif", "ui-serif",
  "ui-monospace", "-apple-system", "blinkmacsystemfont",
]);

function isGenericFont(name: string): boolean {
  return GENERIC_FONTS.has(name.toLowerCase().trim());
}

function isPrivateIpLiteral(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/i, "").replace(/^\[|\]$/g, "");
  if (
    /^127\./.test(v4) ||
    /^10\./.test(v4) ||
    /^192\.168\./.test(v4) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v4) ||
    /^169\.254\./.test(v4) ||
    v4 === "0.0.0.0"
  ) return true;
  const lower = v4.toLowerCase();
  return lower === "::1" || lower === "::" || /^fe80:/.test(lower) || /^f[cd][0-9a-f]{2}:/.test(lower);
}

async function resolveViaDoh(hostname: string, type: "A" | "AAAA"): Promise<string[]> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!res.ok) throw new Error(`DoH lookup failed: ${res.status}`);
  const data = await res.json();
  const wantType = type === "A" ? 1 : 28;
  return ((data.Answer ?? []) as { type: number; data: string }[])
    .filter((a) => a.type === wantType)
    .map((a) => a.data);
}

/** DNS-rebinding guard: a hostname can pass a string check yet resolve to an
 * internal IP by the time fetch() looks it up. `Deno.resolveDns` isn't
 * available here — Supabase's edge runtime mirrors Deno Deploy, which only
 * grants fetch() for outbound, no raw socket/DNS APIs — so we resolve via
 * Cloudflare's DNS-over-HTTPS endpoint over plain fetch instead. Blocks only
 * on a confirmed private/internal address; a DoH outage fails open here
 * since this is defense-in-depth on top of the hostname-string check above,
 * not the only guard — the real fetch will fail on its own for a dead host. */
async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  if (isPrivateIpLiteral(hostname)) return true;
  const [v4, v6] = await Promise.allSettled([
    resolveViaDoh(hostname, "A"),
    resolveViaDoh(hostname, "AAAA"),
  ]);
  if (v4.status === "rejected" && v6.status === "rejected") return false;
  const ips = [
    ...(v4.status === "fulfilled" ? v4.value : []),
    ...(v6.status === "fulfilled" ? v6.value : []),
  ];
  return ips.some(isPrivateIpLiteral);
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

  if (logoCount < 3) {
    const headerBlockM = html.match(/<header[^>]*>([\s\S]{0,4000}?)<\/header>/i);
    const imgInHeader = headerBlockM?.[1].match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (imgInHeader) {
      const url = normalizeUrl(imgInHeader[1], baseUrl);
      if (url) {
        const altM = imgInHeader[0].match(/alt=["']([^"']*)["']/i);
        candidates.push({ type: "logo", url, name: altM?.[1]?.trim() || "Logo", confidence: 70 });
      }
    }
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

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface StoredAsset {
  filePath: string;
  fileSize: number;
  contentHash: string;
  /** Set when identical bytes are already stored for this client under a different URL — caller should update, not insert. */
  existing?: { id: string; name: string; asset_type: string; file_path: string; metadata: Record<string, unknown> | null };
}

async function fetchAndStore(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  clientAccountId: string,
  label: string
): Promise<StoredAsset | null> {
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

    // Content-hash dedup: catches the same image served from a different URL
    // (e.g. CDN cache-busting), which a plain original_url check misses.
    const contentHash = await sha256Hex(arrayBuffer);
    const { data: existingByHashRows } = (await supabase
      .from("brand_assets")
      .select("id, name, asset_type, file_path, metadata")
      .eq("client_account_id", clientAccountId)
      .eq("metadata->>content_hash", contentHash)
      .order("confirmed", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)) as {
      data: { id: string; name: string; asset_type: string; file_path: string; metadata: Record<string, unknown> | null }[] | null;
    };
    const existingByHash = existingByHashRows?.[0] ?? null;
    if (existingByHash) {
      return { filePath: existingByHash.file_path, fileSize, contentHash, existing: existingByHash };
    }

    const safeName = label.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const filePath = `${clientAccountId}/scraped-${Date.now()}-${safeName}.${ext}`;
    const { error } = await supabase.storage
      .from("brand-assets")
      .upload(filePath, arrayBuffer, { contentType, upsert: false });
    if (error) return null;
    return { filePath, fileSize, contentHash };
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
  pageText: string,
  contextProfile: Record<string, unknown> | null
): Promise<BrandVoiceAsset[]> {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) return [];

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

    // Auth: service-role bearer (seed-tier-workflow's background trigger),
    // admin password in body, or a validated client/admin JWT.
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isServer = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    let isAdmin = false;

    if (isServer) {
      isAdmin = true;
    } else if (password && adminPassword && password === adminPassword) {
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
        host.endsWith(".internal") || host.endsWith(".local") ||
        isPrivateIpLiteral(host);
      if (isPrivate) {
        return json({ error: "URL points to a private or internal address" }, 422);
      }
      if (await resolvesToPrivateAddress(host)) {
        return json({ error: "URL resolves to a private or internal address" }, 422);
      }
    } catch {
      return json({ error: "Invalid website URL" }, 422);
    }

    let html: string;
    let rendered: RenderedSignals | null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      // Static fetch (fallback source + AI-voice text if render fails) and the
      // headless-render call run concurrently — neither depends on the other,
      // and the render service already re-validates SSRF on its own side.
      const [res, renderResult] = await Promise.all([
        fetch(targetUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 OrangeDoor-BrandBot/1.0", Accept: "text/html" },
        }),
        callRenderService(targetUrl),
      ]);
      clearTimeout(timeout);
      if (!res.ok) return json({ error: `Could not fetch website (HTTP ${res.status})` }, 422);
      html = await res.text();
      rendered = renderResult;
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

    // Prefer JS-rendered signals (fixes the SPA blind spot); fall back to the
    // static-HTML regex parse if the render service is unconfigured, down,
    // or blocked by the target site.
    const candidates = rendered ? renderedSignalsToCandidates(rendered, targetUrl) : parseHtml(html, targetUrl);
    const voiceSourceText = rendered?.pageText || stripHtml(html);
    const created: { id: string; name: string; asset_type: string; preview_url?: string }[] = [];

    const TEXT_ONLY_TYPES: CandidateType[] = ["font", "headline", "language", "description", "color"];

    for (const candidate of candidates) {
      if (TEXT_ONLY_TYPES.includes(candidate.type)) {
        const category =
          candidate.type === "font" ? "fonts" :
          candidate.type === "color" ? "colors" : "guidelines";

        const normalizedName = (candidate.value || candidate.name).trim();

        // color/font/language: dedup by (client_account_id, asset_type, name) -- several
        // distinct values can legitimately coexist (a palette, a font pairing).
        // headline/description: singleton -- there is only ever one "the" headline/
        // description per client, matched by asset_type alone (not name), because some
        // sites rotate their hero text client-side (e.g. cycling industry verticals), so
        // matching by exact text would just create a new row every time it rotates.
        const isDeduped = ["color", "font", "language"].includes(candidate.type);
        const isSingleton = ["headline", "description"].includes(candidate.type);

        if (isDeduped || isSingleton) {
          let query = supabase
            .from("brand_assets")
            .select("id, name, asset_type, metadata")
            .eq("client_account_id", client_account_id)
            .eq("asset_type", candidate.type);
          if (isDeduped) query = query.ilike("name", normalizedName);

          // .maybeSingle() would silently no-op (data: null, swallowed error) if
          // pre-existing dupes from before this dedup logic existed leave more
          // than one row matching -- order + take the first instead, so an
          // ambiguous match still resolves to *something* rather than falling
          // through to a fresh insert and adding yet another duplicate.
          const { data: existingRows } = await query
            .order("confirmed", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1);
          const existing = existingRows?.[0] ?? null;

          if (existing) {
            // Merge onto existing metadata (not overwrite) so confirmation_status survives a rescan
            await supabase
              .from("brand_assets")
              .update({
                ...(isSingleton ? { name: normalizedName } : {}),
                metadata: {
                  ...(existing.metadata as Record<string, unknown> ?? {}),
                  value: candidate.value,
                  hex: candidate.type === "color" ? candidate.value : undefined,
                  scraped_from: targetUrl,
                  confidence: candidate.confidence,
                  last_scraped_at: new Date().toISOString(),
                },
              })
              .eq("id", existing.id);
            created.push({
              ...existing,
              name: isSingleton ? normalizedName : existing.name,
              preview_url: candidate.type === "color" ? candidate.value : undefined,
            });
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

      // Image assets — dedup by original_url so a rescan doesn't pile up duplicate blobs.
      // og_image gets its own asset_type (not "logo") -- collapsing it into "logo" would
      // let a site's arbitrary og:image (which isn't always the logo) silently win the
      // primary-logo pick in getClientBrandKit, corrupting the AI content-generation prompt.
      const assetType = candidate.type === "favicon" ? "icon" : candidate.type === "og_image" ? "og_image" : "logo";

      if (candidate.svgMarkup && !candidate.url) {
        // Inline <svg> logo — no raster to fetch; store the markup itself, dedup by its hash.
        const svgHash = await sha256Hex(new TextEncoder().encode(candidate.svgMarkup).buffer as ArrayBuffer);
        const { data: existingSvgRows } = await supabase
          .from("brand_assets")
          .select("id, name, asset_type, metadata")
          .eq("client_account_id", client_account_id)
          .eq("asset_type", assetType)
          .eq("metadata->>content_hash", svgHash)
          .order("confirmed", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);
        const existingSvg = existingSvgRows?.[0] ?? null;

        if (existingSvg) {
          await supabase
            .from("brand_assets")
            .update({
              metadata: {
                ...(existingSvg.metadata as Record<string, unknown> ?? {}),
                scraped_from: targetUrl,
                confidence: candidate.confidence,
                last_scraped_at: new Date().toISOString(),
              },
            })
            .eq("id", existingSvg.id);
          created.push({ ...existingSvg });
        } else {
          const { data, error } = await supabase
            .from("brand_assets")
            .insert({
              client_account_id,
              name: candidate.name,
              asset_type: assetType,
              category: "logos",
              description: `Auto-detected from ${targetUrl}`,
              metadata: {
                svg_markup: candidate.svgMarkup,
                confirmation_status: "pending_client",
                scraped_from: targetUrl,
                confidence: candidate.confidence,
                content_hash: svgHash,
              },
            })
            .select("id, name, asset_type")
            .single();
          if (!error && data) created.push({ ...data });
        }
        continue;
      }

      const { data: existingImgRows } = await supabase
        .from("brand_assets")
        .select("id, name, asset_type, file_path, metadata")
        .eq("client_account_id", client_account_id)
        .eq("asset_type", assetType)
        .eq("metadata->>original_url", candidate.url)
        .order("confirmed", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      const existingImg = existingImgRows?.[0] ?? null;

      if (existingImg) {
        await supabase
          .from("brand_assets")
          .update({
            metadata: {
              ...(existingImg.metadata as Record<string, unknown> ?? {}),
              scraped_from: targetUrl,
              confidence: candidate.confidence,
              last_scraped_at: new Date().toISOString(),
            },
          })
          .eq("id", existingImg.id);

        const urlData = existingImg.file_path
          ? (await supabase.storage.from("brand-assets").createSignedUrl(existingImg.file_path, 3600)).data
          : null;
        created.push({ ...existingImg, preview_url: urlData?.signedUrl });
        continue;
      }

      const stored = await fetchAndStore(supabase, candidate.url!, client_account_id, candidate.name);
      if (!stored) continue;

      if (stored.existing) {
        // Identical bytes already stored under a different URL — refresh metadata, skip a second copy.
        await supabase
          .from("brand_assets")
          .update({
            metadata: {
              ...(stored.existing.metadata ?? {}),
              scraped_from: targetUrl,
              confidence: candidate.confidence,
              last_scraped_at: new Date().toISOString(),
            },
          })
          .eq("id", stored.existing.id);

        const urlData = stored.existing.file_path
          ? (await supabase.storage.from("brand-assets").createSignedUrl(stored.existing.file_path, 3600)).data
          : null;
        created.push({ ...stored.existing, preview_url: urlData?.signedUrl });
        continue;
      }

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
            content_hash: stored.contentHash,
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
      const voiceAssets = await extractBrandVoice(voiceSourceText, contextProfile);

      for (const va of voiceAssets) {
        // Dedup by sub_type
        const { data: existingRows } = await supabase
          .from("brand_assets")
          .select("id")
          .eq("client_account_id", client_account_id)
          .eq("asset_type", "brand_voice")
          .eq("metadata->>sub_type", va.sub_type)
          .order("created_at", { ascending: false })
          .limit(1);
        const existing = existingRows?.[0] ?? null;

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
