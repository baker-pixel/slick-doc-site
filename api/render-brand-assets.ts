import type { VercelRequest, VercelResponse } from "@vercel/node";
import puppeteer, { type Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { resolve4, resolve6 } from "node:dns/promises";

export const config = {
  maxDuration: 60,
};

// ---- SSRF guard -----------------------------------------------------------
// This endpoint navigates a real browser to a client/admin-supplied URL, so
// it carries its own SSRF surface independent of any check the caller did --
// a direct hit on this endpoint (if the shared secret leaked) or a stale
// check on the caller's side must not be able to make Chromium fetch an
// internal address. We resolve once, validate, and pin Chromium's resolver
// to the address we checked via --host-resolver-rules, so the browser's own
// navigation-time DNS lookup can't return something different (the
// DNS-rebinding gap plain fetch() can't close without a raw-socket client).

function isPrivateIp(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/i, "");
  if (
    /^127\./.test(v4) ||
    /^10\./.test(v4) ||
    /^192\.168\./.test(v4) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v4) ||
    /^169\.254\./.test(v4) ||
    v4 === "0.0.0.0"
  ) return true;
  const lower = ip.toLowerCase();
  return lower === "::1" || lower === "::" || /^fe80:/.test(lower) || /^f[cd][0-9a-f]{2}:/.test(lower);
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

async function resolvePublicIp(hostname: string): Promise<string> {
  if (hostname === "localhost" || hostname.endsWith(".internal") || hostname.endsWith(".local")) {
    throw new Error("URL points to a private or internal address");
  }
  if (isIpLiteral(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("URL points to a private or internal address");
    return hostname;
  }
  const [v4, v6] = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const ips = [
    ...(v4.status === "fulfilled" ? v4.value : []),
    ...(v6.status === "fulfilled" ? v6.value : []),
  ];
  if (ips.length === 0) throw new Error("Could not resolve hostname");
  if (ips.some(isPrivateIp)) throw new Error("URL resolves to a private or internal address");
  return ips[0];
}

/** Best-effort validation for a secondary asset fetch (the logo image itself).
 * Lower stakes than the main navigation -- no pinning, just a resolve+check,
 * matching the guard already used on the Supabase side. */
async function assertPublicUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported protocol");
  await resolvePublicIp(parsed.hostname);
}

// ---- browser ----------------------------------------------------------

async function launchBrowser(hostname: string, pinnedIp: string) {
  const hostResolverRule = `--host-resolver-rules=MAP ${hostname} ${pinnedIp}`;
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isServerless) {
    return puppeteer.launch({
      args: [...chromium.args, hostResolverRule],
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: { width: 1280, height: 900 },
    });
  }
  const localPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!localPath) {
    throw new Error("Set PUPPETEER_EXECUTABLE_PATH to a local Chrome/Chromium binary for local dev.");
  }
  return puppeteer.launch({
    executablePath: localPath,
    headless: true,
    args: [hostResolverRule],
    defaultViewport: { width: 1280, height: 900 },
  });
}

// ---- in-page extraction -----------------------------------------------

interface LogoSignal {
  url: string | null;
  svgMarkup: string | null;
  source: string;
}

interface RawSignals {
  logo: LogoSignal | null;
  favicon: string | null;
  ogImage: string | null;
  headline: string | null;
  description: string | null;
  language: string | null;
  headingFontStack: string | null;
  bodyFontStack: string | null;
  cssVarColors: string[];
  themeColor: string | null;
}

async function extractSignals(page: Page): Promise<RawSignals> {
  return page.evaluate(() => {
    function abs(url: string | null | undefined): string | null {
      if (!url) return null;
      try {
        return new URL(url, document.baseURI).href;
      } catch {
        return null;
      }
    }

    const faviconLink = document.querySelector('link[rel~="icon"]') as HTMLLinkElement | null;
    const favicon = abs(faviconLink?.getAttribute("href"));

    let logo: LogoSignal | null = null;

    // 1. icon links, largest declared size first
    const iconLinks = [
      ...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]'),
    ] as HTMLLinkElement[];
    if (iconLinks.length > 0) {
      const sizeOf = (l: HTMLLinkElement) => parseInt((l.getAttribute("sizes") || "0x0").split("x")[0], 10) || 0;
      const best = [...iconLinks].sort((a, b) => sizeOf(b) - sizeOf(a))[0];
      logo = { url: abs(best.getAttribute("href")), svgMarkup: null, source: "icon_link" };
    }

    // 2. og:image / twitter:image
    if (!logo) {
      const og = document.querySelector(
        'meta[property="og:image"], meta[name="twitter:image"]',
      ) as HTMLMetaElement | null;
      if (og?.content) logo = { url: abs(og.content), svgMarkup: null, source: "og_image" };
    }

    // 3-5. header/nav: positioned <img>, then inline <svg>, then CSS background-image
    if (!logo) {
      const headerNav = document.querySelector("header, nav");
      if (headerNav) {
        const img = headerNav.querySelector("img") as HTMLImageElement | null;
        if (img) {
          const r = img.getBoundingClientRect();
          if (r.top < 300 && r.height >= 16 && r.height <= 220) {
            logo = { url: abs(img.currentSrc || img.src), svgMarkup: null, source: "header_img_position" };
          }
        }
        if (!logo) {
          const svg = headerNav.querySelector("svg");
          if (svg) logo = { url: null, svgMarkup: svg.outerHTML.slice(0, 20000), source: "header_inline_svg" };
        }
        if (!logo) {
          const bg = getComputedStyle(headerNav).backgroundImage;
          const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
          if (m) logo = { url: abs(m[1]), svgMarkup: null, source: "header_css_background" };
        }
      }
    }

    const ogImageMeta = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
    const descMeta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    const h1 = document.querySelector("h1");

    const cssVarColors: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin stylesheet -- can't read rules, skip
      }
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule && rule.selectorText === ":root") {
          for (const prop of Array.from(rule.style)) {
            if (!/color|brand|primary|secondary|accent/i.test(prop)) continue;
            const val = rule.style.getPropertyValue(prop).trim();
            if (/^#[0-9a-fA-F]{3,8}$/.test(val)) cssVarColors.push(val);
          }
        }
      }
      if (cssVarColors.length >= 5) break;
    }

    return {
      logo,
      favicon,
      ogImage: abs(ogImageMeta?.content ?? null),
      headline: h1?.textContent?.trim().slice(0, 200) || null,
      description: descMeta?.content?.trim().slice(0, 400) || null,
      language: document.documentElement.lang || null,
      headingFontStack: h1 ? getComputedStyle(h1).fontFamily : null,
      bodyFontStack: getComputedStyle(document.body).fontFamily,
      cssVarColors: cssVarColors.slice(0, 5),
      themeColor: themeMeta?.content?.trim() || null,
    };
  });
}

const GENERIC_FONTS = new Set([
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui",
  "inherit", "initial", "unset", "ui-sans-serif", "ui-serif", "ui-monospace",
  "-apple-system", "blinkmacsystemfont",
]);

function firstRealFont(stack: string | null): string | null {
  if (!stack) return null;
  for (const raw of stack.split(",")) {
    const name = raw.trim().replace(/^['"]|['"]$/g, "");
    if (name && !GENERIC_FONTS.has(name.toLowerCase())) return name;
  }
  return null;
}

/** Pixel-sample the logo itself for dominant colors -- more reliable than a
 * developer's theme-color guess, because it measures the actual brand mark.
 * Fetched as a data: URI (not a cross-origin <img>) so the canvas is never
 * tainted and no CORS headers are required on the source image. */
async function sampleLogoColors(page: Page, dataUri: string): Promise<string[]> {
  return page.evaluate(async (src: string) => {
    return await new Promise<string[]>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const w = (canvas.width = Math.max(1, Math.min(img.naturalWidth, 120)));
          const h = (canvas.height = Math.max(1, Math.min(img.naturalHeight, 120)));
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, w, h);
          const { data } = ctx.getImageData(0, 0, w, h);
          const counts = new Map<string, number>();
          for (let i = 0; i < data.length; i += 4) {
            const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
            if (a < 128) continue;
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            if (lum > 245 || lum < 12) continue; // near-white/black -- not a real brand-color signal
            const key = `${r >> 4},${g >> 4},${b >> 4}`; // quantize into 16 buckets/channel
            counts.set(key, (counts.get(key) || 0) + 1);
          }
          const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
          resolve(
            top.map(([key]) => {
              const [r, g, b] = key.split(",").map((n) => parseInt(n, 10) * 16 + 8);
              return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
            }),
          );
        } catch {
          resolve([]); // decode/read failed -- caller falls back to CSS/theme-color signals
        }
      };
      img.onerror = () => resolve([]);
      img.src = src;
    });
  }, dataUri);
}

async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    await assertPublicUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 3 * 1024 * 1024) return null;
    return `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

// ---- handler ------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expectedSecret = process.env.BRAND_RENDER_SECRET;
  if (!expectedSecret || req.headers["x-internal-secret"] !== expectedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { url } = (req.body ?? {}) as { url?: string };
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  let parsed: URL;
  let pinnedIp: string;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http(s) URLs are supported");
    pinnedIp = await resolvePublicIp(parsed.hostname);
  } catch (e) {
    res.status(422).json({ error: e instanceof Error ? e.message : "Invalid URL" });
    return;
  }

  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    browser = await launchBrowser(parsed.hostname, pinnedIp);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(20_000);
    await page.goto(parsed.href, { waitUntil: "networkidle2", timeout: 20_000 });

    const signals = await extractSignals(page);

    let colors: string[] = [];
    const logoImageUrl = signals.logo?.url ?? null;
    if (logoImageUrl) {
      const dataUri = await fetchAsDataUri(logoImageUrl);
      if (dataUri) colors = await sampleLogoColors(page, dataUri);
    }
    if (colors.length === 0) {
      colors = signals.themeColor && /^#[0-9a-fA-F]{3,8}$/.test(signals.themeColor)
        ? [signals.themeColor, ...signals.cssVarColors]
        : signals.cssVarColors;
    }

    res.status(200).json({
      logo: signals.logo,
      favicon: signals.favicon,
      ogImage: signals.ogImage,
      colors: [...new Set(colors)].slice(0, 5),
      headingFont: firstRealFont(signals.headingFontStack),
      bodyFont: firstRealFont(signals.bodyFontStack),
      headline: signals.headline,
      description: signals.description,
      language: signals.language,
    });
  } catch (err) {
    console.error("render-brand-assets error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Render failed" });
  } finally {
    if (browser) await browser.close();
  }
}
