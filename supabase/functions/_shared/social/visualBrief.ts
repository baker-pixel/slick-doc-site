// Learns a client's visual identity from the photos on their own website and
// stores it as a short text brief. The image concept writer reads the brief so
// a client's feed feels like theirs (palette, light, settings, objects) while
// every scene stays newly invented. Photos are only ever described, never
// passed to the image model, so nothing is copied and no staff likeness is used.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const VISION_MODEL = "gpt-4.1-mini";
const MAX_IMAGES = 6;
const MIN_IMAGES = 2;

export interface VisualBrief {
  palette: string[];
  lighting: string;
  mood: string;
  photo_style: string;
  settings: string[];
  objects: string[];
  avoid: string[];
  source_url: string;
  images_used: number;
  generated_at: string;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return h === "::1" || h === "::" || /^f[cde][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h);
}

function safeHttpsUrl(raw: string, base?: string): string | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (isPrivateHost(u.hostname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

const SKIP_IMG = /logo|icon|sprite|favicon|avatar|badge|payment|flag|spinner|pixel|tracking|1x1|placeholder|\.svg(\?|$)|\.gif(\?|$)/i;

/** Large content photos from a page: og:image first, then <img> tags, skipping logos, icons and trackers. */
export function extractPhotoUrls(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw) return;
    const url = safeHttpsUrl(raw.trim(), baseUrl);
    if (url && !SKIP_IMG.test(url) && !out.includes(url)) out.push(url);
  };

  add(html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]);

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const w = Number(tag.match(/\bwidth=["']?(\d+)/i)?.[1] ?? 0);
    const h = Number(tag.match(/\bheight=["']?(\d+)/i)?.[1] ?? 0);
    if ((w && w < 300) || (h && h < 200)) continue;
    if (/\b(logo|icon|avatar)\b/i.test(tag.match(/\b(?:class|alt|id)=["'][^"']*["']/gi)?.join(" ") ?? "")) continue;
    // Prefer the largest srcset candidate, then lazy-load attributes, then src.
    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    let best: string | undefined;
    if (srcset) {
      let bestW = -1;
      for (const part of srcset.split(",")) {
        const [u, d] = part.trim().split(/\s+/);
        const dw = parseInt(d ?? "", 10) || 0;
        if (u && dw >= bestW) { best = u; bestW = dw; }
      }
    }
    add(best ?? tag.match(/\bdata-(?:lazy-)?src=["']([^"']+)["']/i)?.[1] ?? tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]);
    if (out.length >= MAX_IMAGES * 3) break;
  }
  return out;
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OrangeDoorBot/1.0)", Accept: "text/html" },
    });
    if (!res.ok) return null;
    if (res.url && !safeHttpsUrl(res.url)) return null; // redirected somewhere internal
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Only keep images that are reachable and look like real photos (not tiny, not huge). */
async function usablePhotos(urls: string[]): Promise<string[]> {
  const checks = await Promise.all(urls.slice(0, MAX_IMAGES * 3).map(async (u) => {
    try {
      const res = await fetch(u, { method: "HEAD", signal: AbortSignal.timeout(6_000), redirect: "follow" });
      if (!res.ok) return null;
      const type = res.headers.get("content-type") || "";
      const len = Number(res.headers.get("content-length") || 0);
      if (!/^image\/(jpeg|png|webp)/i.test(type)) return null;
      if (len && (len < 15_000 || len > 15_000_000)) return null;
      return u;
    } catch {
      return null;
    }
  }));
  return checks.filter((u): u is string => !!u).slice(0, MAX_IMAGES);
}

const SYSTEM =
  "You are a brand photography analyst. You are shown photos from one business's website. " +
  "Describe the visual identity of their photography so a different photographer could shoot NEW images that feel like the same brand. " +
  "Describe look and feel only. Never describe, name or identify any individual person; if people appear, say only the general mix (for example 'mostly small teams in work clothes'). " +
  "Describe ONLY real photographic content. Ignore logos, icons, screenshots, software screens, charts, illustrations and text; do not list them as settings or objects. If an image is not a photograph of a real place, object or situation, skip it. Use plain colour names, not hex codes. " +
  'Return JSON only: {"palette": [3-5 colour names], "lighting": "one short phrase", "mood": "one short phrase", "photo_style": "one short phrase on framing, lens and realism", ' +
  '"settings": [3-5 kinds of place or situation that recur], "objects": [3-6 recurring physical objects, tools or products], ' +
  '"avoid": [0-3 things clearly absent from their imagery or at odds with it]}. ' +
  "If the photos are generic stock with no consistent identity, say so in mood and keep the other fields short.";

const strs = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim().slice(0, 80)).slice(0, max) : [];
// Terms that describe UI/graphics, not photography; they would fight the image rules.
const NOT_PHOTO = /logo|icon|screen|dashboard|software|\bui\b|interface|app\b|website|graphic|illustration|infographic|chart|graph|banner/i;
const clean = (a: string[]) => a.filter((x) => !NOT_PHOTO.test(x));
const str = (v: unknown, max = 120): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function buildVisualBrief(
  openaiKey: string,
  websiteUrl: string,
): Promise<{ brief: VisualBrief | null; reason?: string }> {
  const site = safeHttpsUrl(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`);
  if (!site) return { brief: null, reason: "invalid or non-public website url" };

  const html = await fetchHtml(site);
  if (!html) return { brief: null, reason: "could not fetch the website" };

  const photos = await usablePhotos(extractPhotoUrls(html, site));
  if (photos.length < MIN_IMAGES) {
    return { brief: null, reason: `only ${photos.length} usable photo(s) found on the homepage` };
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyse these website photos and return the JSON." },
            ...photos.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } })),
          ],
        },
      ],
    }),
  });
  if (!res.ok) return { brief: null, reason: `vision call failed (${res.status}): ${(await res.text()).slice(0, 160)}` };

  const data = await res.json();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return { brief: null, reason: "vision model returned invalid JSON" };
  }

  const brief: VisualBrief = {
    palette: strs(parsed.palette, 5),
    lighting: str(parsed.lighting),
    mood: str(parsed.mood),
    photo_style: str(parsed.photo_style, 160),
    settings: clean(strs(parsed.settings, 5)),
    objects: clean(strs(parsed.objects, 6)),
    avoid: strs(parsed.avoid, 3),
    source_url: site,
    images_used: photos.length,
    generated_at: new Date().toISOString(),
  };
  if (!brief.settings.length && !brief.palette.length) return { brief: null, reason: "vision model returned nothing usable" };
  return { brief };
}

/** Prompt text for the concept writer. Empty when there is no brief. */
export function briefForConcept(b: Partial<VisualBrief> | undefined | null): string {
  if (!b || (!b.settings?.length && !b.palette?.length)) return "";
  const parts = [
    b.mood ? `mood: ${b.mood}` : "",
    b.settings?.length ? `places they photograph: ${b.settings.join("; ")}` : "",
    b.objects?.length ? `objects that recur: ${b.objects.join("; ")}` : "",
    b.palette?.length ? `palette: ${b.palette.join(", ")}` : "",
  ].filter(Boolean);
  return `Brand look, learned from the photography on their own website (${parts.join(" | ")}). Make the scene feel like it belongs to this brand: lean on these kinds of places, objects and palette, but invent a NEW scene for this post. Never recreate or imitate a specific photo, and never show their real staff or premises.`;
}

/** One line for the final image prompt. */
export function briefForPrompt(b: Partial<VisualBrief> | undefined | null): string {
  if (!b || (!b.palette?.length && !b.photo_style)) return "";
  const parts = [
    b.palette?.length ? `colours drawn from ${b.palette.slice(0, 4).join(", ")}` : "",
    b.lighting ? `light like ${b.lighting}` : "",
    b.photo_style ? b.photo_style : "",
  ].filter(Boolean);
  return `Brand look: ${parts.join("; ")}.`;
}
