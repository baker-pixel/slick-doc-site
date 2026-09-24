import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

// gpt-image-2 reliably garbles any logo it's asked to render inside the
// prompt (see socialImagePrompt.ts) -- so instead of asking the model for
// it, this stamps the client's REAL logo onto the finished image afterward.
export interface OverlayBrand {
  businessName: string;
  logoUrl?: string | null;
  colorHex?: string | null;
}

function hexToOpaqueInt(hex: string | null | undefined): number | null {
  if (!hex) return null;
  const m = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return (parseInt(m, 16) << 8 | 0xff) >>> 0;
}

/**
 * Stamps a bottom brand bar with the client's logo onto a generated image.
 * No-ops when there's no logo. Best-effort throughout -- a bad/unreachable
 * logo or any decode error falls back to returning the original image
 * untouched rather than leaving a post with no image at all.
 */
export async function applyBrandOverlay(pngBytes: Uint8Array, brand: OverlayBrand): Promise<Uint8Array> {
  if (!brand.logoUrl) return pngBytes;

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

    try {
      const logoRes = await fetch(brand.logoUrl);
      if (!logoRes.ok) return pngBytes;
      const logo = await Image.decode(new Uint8Array(await logoRes.arrayBuffer()));
      logo.resize(Image.RESIZE_AUTO, contentHeight);
      image.composite(logo, padding, image.height - barHeight + padding);
    } catch (e) {
      console.warn("Brand overlay: logo skipped:", e instanceof Error ? e.message : e);
      return pngBytes;
    }

    return await image.encode();
  } catch (e) {
    console.error("Brand overlay failed, using un-overlaid image:", e instanceof Error ? e.message : e);
    return pngBytes;
  }
}
