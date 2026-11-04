import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

// gpt-image-2 reliably garbles any logo it's asked to render inside the
// prompt (see socialImagePrompt.ts) -- so instead of asking the model for
// it, this stamps the client's REAL logo onto the finished image afterward.
export interface OverlayBrand {
  businessName: string;
  logoUrl?: string | null;
  colorHex?: string | null;
}

/**
 * Stamps the client's logo onto a generated image, bottom-left, over a soft
 * dark gradient that fades in from nothing -- no hard-edged bar, so the logo
 * reads as part of the picture rather than a footer strip. No-ops when there's
 * no logo. Best-effort throughout -- a bad/unreachable logo or any decode
 * error falls back to returning the original image untouched rather than
 * leaving a post with no image at all.
 */
export async function applyBrandOverlay(pngBytes: Uint8Array, brand: OverlayBrand): Promise<Uint8Array> {
  if (!brand.logoUrl) return pngBytes;

  try {
    const image = await Image.decode(pngBytes);

    let logo: Image;
    try {
      const logoRes = await fetch(brand.logoUrl);
      if (!logoRes.ok) return pngBytes;
      logo = await Image.decode(new Uint8Array(await logoRes.arrayBuffer()));
    } catch (e) {
      console.warn("Brand overlay: logo skipped:", e instanceof Error ? e.message : e);
      return pngBytes;
    }

    // Scrim covers the bottom 20% and eases from fully transparent (top) to
    // MAX_ALPHA (bottom edge). The curve keeps the top of the fade invisible.
    const MAX_ALPHA = 0.55;
    const scrimHeight = Math.round(image.height * 0.2);
    const scrim = new Image(image.width, scrimHeight);
    scrim.fill((_x: number, y: number) => {
      const t = (y - 1) / Math.max(1, scrimHeight - 1);
      return Math.round(255 * MAX_ALPHA * Math.pow(t, 1.6)) >>> 0; // rgb 0 + alpha
    });
    image.composite(scrim, 0, image.height - scrimHeight);

    const margin = Math.round(image.width * 0.04);
    const logoHeight = Math.round(image.height * 0.075);
    logo.resize(Image.RESIZE_AUTO, logoHeight);
    image.composite(logo, margin, image.height - margin - logo.height);

    return await image.encode();
  } catch (e) {
    console.error("Brand overlay failed, using un-overlaid image:", e instanceof Error ? e.message : e);
    return pngBytes;
  }
}
