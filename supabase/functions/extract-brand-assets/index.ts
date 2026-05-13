import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function parseHtml(html: string, baseUrl: string): Candidate[] {
  const candidates: Candidate[] = [];

  // 1. Favicon
  const faviconMatch =
    html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
  if (faviconMatch) {
    const url = normalizeUrl(faviconMatch[1], baseUrl);
    if (url) candidates.push({ type: "favicon", url, name: "Favicon", confidence: 90 });
  }

  // 2. Apple touch icon
  const touchMatch =
    html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i);
  if (touchMatch) {
    const url = normalizeUrl(touchMatch[1], baseUrl);
    if (url) candidates.push({ type: "logo", url, name: "App Icon", confidence: 85 });
  }

  // 3. OG image
  const ogMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (ogMatch) {
    const url = normalizeUrl(ogMatch[1], baseUrl);
    if (url) candidates.push({ type: "og_image", url, name: "Social Share Image", confidence: 80 });
  }

  // 4. Logo images from img tags
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

  // 5. Theme color
  const themeM =
    html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["']/i);
  if (themeM) {
    const v = themeM[1].trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(v))
      candidates.push({ type: "color", value: v, name: "Brand Color", confidence: 90 });
  }

  // 6. msapplication tile color
  const tileM = html.match(
    /<meta[^>]+name=["']msapplication-TileColor["'][^>]*content=["']([^"']+)["']/i
  );
  if (tileM) {
    const v = tileM[1].trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(v))
      candidates.push({ type: "color", value: v, name: "Tile Color", confidence: 70 });
  }

  // 7. CSS :root color variables
  const rootM = html.match(/:root\s*\{([^}]{0,3000})\}/);
  if (rootM) {
    let colorVarCount = 0;
    for (const vm of rootM[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
      if (colorVarCount >= 5) break;
      const varName = vm[1];
      const hex = vm[2];
      if (/color|brand|primary|secondary|accent/i.test(varName)) {
        const readableName = varName
          .replace(/^color-?|^brand-?/i, "")
          .replace(/-/g, " ")
          .trim() || varName;
        candidates.push({
          type: "color",
          value: hex,
          name: readableName.charAt(0).toUpperCase() + readableName.slice(1),
          confidence: 80,
        });
        colorVarCount++;
      }
    }
  }

  // 8. Google Fonts
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

  // 9. CSS font-family from <style> blocks
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

  // 10. H1 headline
  const h1M = html.match(/<h1[^>]*>\s*([^<]{5,120})\s*<\/h1>/i);
  if (h1M) {
    const text = h1M[1].replace(/\s+/g, " ").trim();
    if (text)
      candidates.push({ type: "headline", value: text, name: "Brand Headline", confidence: 85 });
  }

  // 11. Meta description as brand tagline
  const metaDescM =
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']{10,300})["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']{10,300})["'][^>]*name=["']description["']/i);
  if (metaDescM) {
    const text = metaDescM[1].trim();
    candidates.push({ type: "description", value: text, name: "Brand Description", confidence: 80 });
  }

  // 12. Language from <html lang>
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

  // Deduplicate by type+url/value key
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { client_account_id, website_url } = await req.json();
    if (!client_account_id || !website_url)
      return json({ error: "client_account_id and website_url are required" }, 400);

    let targetUrl = website_url.trim();
    if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl;

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

    const candidates = parseHtml(html, targetUrl);
    if (candidates.length === 0)
      return json({ assets: [], message: "No brand signals found on this website" });

    const TEXT_ONLY_TYPES: CandidateType[] = ["font", "headline", "language", "description", "color"];
    const created: { id: string; name: string; asset_type: string; preview_url?: string }[] = [];

    for (const candidate of candidates) {
      // Text/value-only assets (no file download)
      if (TEXT_ONLY_TYPES.includes(candidate.type)) {
        const category =
          candidate.type === "font" ? "fonts" :
          candidate.type === "color" ? "colors" : "guidelines";

        const { data, error } = await supabase
          .from("brand_assets")
          .insert({
            client_account_id,
            name: candidate.name,
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

      // Image assets — download and store
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
        const { data: urlData } = supabase.storage
          .from("brand-assets")
          .getPublicUrl(stored.filePath);
        created.push({ ...data, preview_url: urlData.publicUrl });
      }
    }

    return json({
      assets: created,
      message: `Extracted ${created.length} brand asset${created.length !== 1 ? "s" : ""} from ${targetUrl}`,
    });
  } catch (err: any) {
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
