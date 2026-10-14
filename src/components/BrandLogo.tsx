import { cn } from "@/lib/utils";

// The one place the Orange Door logo is rendered, so every surface (site, sign-in, portal,
// admin, reports) uses the same files and handles light/dark backgrounds the same way.
// Files live in public/brand so the PDF renderer and emails can use the same URLs.
//
// tone="auto"    follows the app theme (dark "D" on light, white "D" when <html class="dark">)
// tone="onDark"  always the white-text version (for permanently dark backgrounds, e.g. the footer)
// tone="onLight" always the dark-text version (e.g. the report, which is always white)
type Variant = "horizontal" | "stacked" | "icon";
type Tone = "auto" | "onDark" | "onLight";

// Natural pixel sizes, so the browser reserves space before the image loads (no layout jump).
const SIZE: Record<Variant, { w: number; h: number }> = {
  horizontal: { w: 1200, h: 312 },
  stacked: { w: 900, h: 681 },
  icon: { w: 480, h: 270 },
};

const FILE: Record<Variant, { dark: string; white: string }> = {
  horizontal: { dark: "/brand/logo-horizontal.png", white: "/brand/logo-horizontal-white.png" },
  stacked: { dark: "/brand/logo-stacked.png", white: "/brand/logo-stacked.png" }, // stacked is only used on light backgrounds
  icon: { dark: "/brand/logo-icon.png", white: "/brand/logo-icon-white.png" },
};

interface Props {
  variant?: Variant;
  tone?: Tone;
  /** Set the height (e.g. "h-10"); width follows the image's proportions. */
  className?: string;
  alt?: string;
}

export function BrandLogo({ variant = "horizontal", tone = "auto", className, alt = "Orange Door Marketing" }: Props) {
  const { w, h } = SIZE[variant];
  const files = FILE[variant];
  const img = (src: string, extra: string, label: string | null) => (
    <img
      src={src}
      width={w}
      height={h}
      alt={label ?? ""}
      aria-hidden={label === null ? true : undefined}
      draggable={false}
      className={cn("w-auto object-contain select-none", className, extra)}
    />
  );

  if (tone === "onDark") return img(files.white, "", alt);
  if (tone === "onLight") return img(files.dark, "", alt);
  // auto: render both, show the one that matches the theme
  return (
    <>
      {img(files.dark, "dark:hidden", alt)}
      {img(files.white, "hidden dark:block", null)}
    </>
  );
}
