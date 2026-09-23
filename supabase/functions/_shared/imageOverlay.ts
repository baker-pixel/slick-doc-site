import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

// gpt-image-2 reliably garbles any brand name or logo it's asked to render
// inside the prompt (see socialImagePrompt.ts) -- so instead of asking the
// model for it, this stamps the client's REAL name/logo onto the finished
// image afterward. Guaranteed correct and legible, at the cost of a fixed
// bottom bar on every generated image.
export interface OverlayBrand {
  businessName: string;
  logoUrl?: string | null;
  colorHex?: string | null;
}

const FONT_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf";
let cachedFont: Uint8Array | null = null;

async function loadFont(): Promise<Uint8Array> {
  if (cachedFont) return cachedFont;
  const res = await fetch(FONT_URL);
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
  cachedFont = new Uint8Array(await res.arrayBuffer());
  return cachedFont;
}

function hexToOpaqueInt(hex: string | null | undefined): number | null {
  if (!hex) return null;
  const m = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return (parseInt(m, 16) << 8 | 0xff) >>> 0;
}

/**
 * Stamps a bottom brand bar (real business name + logo, if available) onto a
 * generated image. Best-effort throughout -- a bad/unreachable logo, a font
 * fetch failure, or any decode error falls back to returning the original
 * image untouched rather than leaving a post with no image at all.
 */
export async function applyBrandOverlay(pngBytes: Uint8Array, brand: OverlayBrand): Promise<Uint8Array> {
  const name = brand.businessName?.trim();
  if (!name) return pngBytes;

  try {
    const image = await Image.decode(pngBytes);
    const barHeight = Math.round(image.height * 0.11);
    const accentHeight = Math.max(3, Math.round(barHeight * 0.06));

    // Fixed dark, translucent bar -- legible over any AI-generated photo
    // background regardless of the client's actual brand colors. The real
    // brand color still shows up, as a thin accent stripe along its top edge.
    const bar = new Image(image.width, barHeight);
    bar.fill(0x000000cc);
    image.composite(bar, 0, image.height - barHeight);

    const accentColor = hexToOpaqueInt(brand.colorHex);
    if (accentColor !== null) {
      const accent = new Image(image.width, accentHeight);
      accent.fill(accentColor);
      image.composite(accent, 0, image.height - barHeight);
    }

    const padding = Math.round(barHeight * 0.28);
    const contentHeight = barHeight - padding * 2;
    let textX = padding;

    // Logo is a nice-to-have, never a blocker -- an unsupported format (SVG,
    // corrupt file) just gets skipped and we fall back to name-only.
    if (brand.logoUrl) {
      try {
        const logoRes = await fetch(brand.logoUrl);
        if (logoRes.ok) {
          const logo = await Image.decode(new Uint8Array(await logoRes.arrayBuffer()));
          logo.resize(Image.RESIZE_AUTO, contentHeight);
          image.composite(logo, textX, image.height - barHeight + padding);
          textX += logo.width + padding;
        }
      } catch (e) {
        console.warn("Brand overlay: logo skipped:", e instanceof Error ? e.message : e);
      }
    }

    const font = await loadFont();
    let scale = Math.round(contentHeight * 0.85);
    let text = Image.renderText(font, scale, name, 0xffffffff);

    // Shrink to fit in one pass if the name is too wide for the remaining
    // space -- good enough without a full iterative wrap/fit loop.
    const maxTextWidth = image.width - textX - padding;
    if (text.width > maxTextWidth && maxTextWidth > 0) {
      scale = Math.max(10, Math.round(scale * (maxTextWidth / text.width)));
      text = Image.renderText(font, scale, name, 0xffffffff);
    }

    const textY = image.height - barHeight + Math.round((barHeight - text.height) / 2);
    image.composite(text, textX, textY);

    return await image.encode();
  } catch (e) {
    console.error("Brand overlay failed, using un-overlaid image:", e instanceof Error ? e.message : e);
    return pngBytes;
  }
}
