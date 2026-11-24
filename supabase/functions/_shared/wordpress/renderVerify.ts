// Did the change actually reach the live page? The plugin reporting "applied"
// only proves it saved something; what matters is what a visitor (and Google)
// receives. This reads the public HTML and compares.
import { decodeEntities } from "../seo/seoSignals.ts";

export interface RenderCheck {
  /** true = page shows it, false = page does not, null = this field cannot be checked from HTML */
  ok: boolean | null;
  note: string;
}

const norm = (s: string) => decodeEntities(s).replace(/\s+/g, " ").trim().toLowerCase();

export function pageTitle(html: string): string {
  return decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim());
}

function metaContent(html: string, name: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (new RegExp(`\\b(?:name|property)\\s*=\\s*["']${name}["']`, "i").test(tag)) {
      return decodeEntities((tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1] ?? "").trim());
    }
  }
  return "";
}

export function metaDescription(html: string): string {
  return metaContent(html, "description");
}

export function canonicalUrl(html: string): string {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (/\brel\s*=\s*["']canonical["']/i.test(tag)) return decodeEntities((tag.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1] ?? "").trim());
  }
  return "";
}

export function hasJsonLd(html: string): boolean {
  return /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html);
}

export function verifyRenderedField(field: string, expected: string, html: string): RenderCheck {
  switch (field) {
    case "meta_title": {
      const actual = pageTitle(html);
      return norm(actual) === norm(expected)
        ? { ok: true, note: "Live page title matches." }
        : { ok: false, note: `Live page title is "${actual.slice(0, 120)}".` };
    }
    case "meta_desc": {
      const actual = metaDescription(html);
      return norm(actual) === norm(expected)
        ? { ok: true, note: "Live meta description matches." }
        : { ok: false, note: actual ? `Live meta description is "${actual.slice(0, 120)}".` : "Live page has no meta description." };
    }
    case "canonical": {
      const actual = canonicalUrl(html);
      return actual.replace(/\/+$/, "") === expected.replace(/\/+$/, "")
        ? { ok: true, note: "Live canonical matches." }
        : { ok: false, note: actual ? `Live canonical is ${actual}.` : "Live page has no canonical link." };
    }
    case "schema_jsonld":
      return hasJsonLd(html)
        ? { ok: true, note: "Structured data is present on the live page." }
        : { ok: false, note: "No structured data found on the live page." };
    default:
      return { ok: null, note: "This kind of change can't be confirmed from the page HTML." };
  }
}

/** Fetch the public page bypassing page caches where we can (a unique query string). */
export async function fetchLiveHtml(url: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const u = new URL(url);
    u.searchParams.set("odv", Date.now().toString(36));
    const res = await fetchFn(u.toString(), {
      headers: { "User-Agent": "OrangeDoorVerifier/1.0", "Cache-Control": "no-cache" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
