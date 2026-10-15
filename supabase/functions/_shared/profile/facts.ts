// Facts a page states about the business, read straight from its markup: structured data
// (schema.org JSON-LD), contact details, social links and headings. Pure. These feed the
// company-profile builder, and they are quotable evidence like any other page text.
import { decodeEntities, toText } from "../seoSignals.ts";

export interface EntityFact {
  type: string;
  name?: string;
  description?: string;
  telephone?: string;
  email?: string;
  address?: string;
  opening_hours?: string[];
  same_as?: string[];
  area_served?: string[];
  url?: string;
  price_range?: string;
  founding_date?: string;
  service_type?: string[];
}

export interface PageFacts {
  entities: EntityFact[];
  headings: { level: number; text: string }[];
  phones: string[];
  emails: string[];
  social: string[];
  site_name?: string;
  description?: string;
}

const SOCIAL = /^(?:https?:\/\/)?(?:www\.)?(facebook|instagram|linkedin|twitter|x|youtube|tiktok|pinterest|threads|yelp)\.com\/(?!share|sharer|intent|dialog|plugins|tr\b|watch\?)[^\s"'<>]+/i;
const KEEP_TYPES = /organization|business|store|restaurant|service|clinic|dentist|physician|attorney|lawyer|realestate|school|hotel|gym|salon|contractor|plumber|electrician|roofing|website|person|medical|accountingservice|financialservice|professionalservice|localbusiness|autodealer|autorepair|educationalorganization|nonprofit|ngo|cafe|bakery|brand|product|offer/i;

const arr = <T>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? decodeEntities(v.trim()).slice(0, 600) : undefined);
const names = (v: unknown): string[] =>
  arr(v as unknown).flatMap((x) => (typeof x === "string" ? [x] : x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string" ? [(x as { name: string }).name] : []))
    .map((x) => decodeEntities(x.trim())).filter(Boolean).slice(0, 12);

function addressText(a: unknown): string | undefined {
  if (typeof a === "string") return str(a);
  if (!a || typeof a !== "object") return undefined;
  const o = a as Record<string, unknown>;
  const parts = [o.streetAddress, o.addressLocality, o.addressRegion, o.postalCode, typeof o.addressCountry === "string" ? o.addressCountry : (o.addressCountry as { name?: string } | undefined)?.name]
    .map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean);
  return parts.length ? decodeEntities(parts.join(", ")) : undefined;
}

function openingHours(o: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const h of arr(o.openingHours as unknown)) if (typeof h === "string") out.push(h.trim());
  for (const spec of arr(o.openingHoursSpecification as unknown)) {
    if (!spec || typeof spec !== "object") continue;
    const s = spec as Record<string, unknown>;
    const days = names(s.dayOfWeek).map((d) => d.replace(/^https?:\/\/schema\.org\//, "")).join("/");
    if (days || s.opens) out.push(`${days} ${typeof s.opens === "string" ? s.opens : ""}-${typeof s.closes === "string" ? s.closes : ""}`.trim());
  }
  return out.slice(0, 10);
}

function walk(node: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (!node || typeof node !== "object" || depth > 5) return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out, depth + 1)); return; }
  const o = node as Record<string, unknown>;
  if (o["@type"]) out.push(o);
  if (o["@graph"]) walk(o["@graph"], out, depth + 1);
}

export function extractFacts(html: string, _url = ""): PageFacts {
  const entities: EntityFact[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try { parsed = JSON.parse(m[1].trim()); } catch { continue; }
    const nodes: Record<string, unknown>[] = [];
    walk(parsed, nodes);
    for (const o of nodes) {
      const type = arr(o["@type"] as unknown).filter((t): t is string => typeof t === "string").join(",");
      if (!type || !KEEP_TYPES.test(type)) continue;
      const e: EntityFact = { type };
      const set = <K extends keyof EntityFact>(k: K, v: EntityFact[K] | undefined) => { if (v !== undefined && !(Array.isArray(v) && v.length === 0)) e[k] = v; };
      set("name", str(o.name)); set("description", str(o.description)); set("telephone", str(o.telephone)); set("email", str(o.email));
      set("address", addressText(o.address)); set("opening_hours", openingHours(o)); set("url", str(o.url));
      set("same_as", arr(o.sameAs as unknown).filter((u): u is string => typeof u === "string").slice(0, 10));
      set("area_served", names(o.areaServed)); set("price_range", str(o.priceRange)); set("founding_date", str(o.foundingDate));
      set("service_type", names(o.serviceType));
      if (Object.keys(e).length > 1) entities.push(e);
      if (entities.length >= 12) break;
    }
  }

  const headings: PageFacts["headings"] = [];
  for (const m of html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = toText(m[2]).slice(0, 160);
    if (text.length >= 3 && !headings.some((h) => h.text === text)) headings.push({ level: Number(m[1]), text });
    if (headings.length >= 25) break;
  }

  const phones = new Set<string>(), emails = new Set<string>(), social = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) {
    const t = decodeURIComponent(m[1]).replace(/[^\d+()\-.\s]/g, "").trim();
    if (t.replace(/\D/g, "").length >= 7) phones.add(t);
  }
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)) emails.add(decodeURIComponent(m[1]).trim().toLowerCase());
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) if (SOCIAL.test(m[1])) social.add(m[1].replace(/[?#].*$/, "").replace(/\/$/, ""));
  for (const e of entities) { if (e.telephone) phones.add(e.telephone); if (e.email) emails.add(e.email.toLowerCase()); for (const u of e.same_as ?? []) if (SOCIAL.test(u)) social.add(u.replace(/\/$/, "")); }

  const meta = (name: string, attr = "name") => {
    const m = html.match(new RegExp(`<meta[^>]*${attr}=["']${name}["'][^>]*content=["']([^"']+)["']`, "i")) ?? html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${name}["']`, "i"));
    return m ? decodeEntities(m[1].trim()) : undefined;
  };
  return {
    entities, headings,
    phones: [...phones].slice(0, 5), emails: [...emails].slice(0, 5), social: [...social].slice(0, 8),
    site_name: meta("og:site_name", "property"),
    description: meta("og:description", "property") ?? meta("description"),
  };
}

/** Every string a page's facts state, joined: the text a quote from structured data is checked against. */
export function factsText(f: PageFacts | undefined | null): string {
  if (!f) return "";
  const parts: string[] = [];
  for (const e of f.entities) {
    parts.push(e.type, e.name ?? "", e.description ?? "", e.telephone ?? "", e.email ?? "", e.address ?? "", ...(e.opening_hours ?? []), ...(e.area_served ?? []), ...(e.service_type ?? []), e.price_range ?? "", e.founding_date ?? "");
  }
  parts.push(...f.headings.map((h) => h.text), ...f.phones, ...f.emails, ...f.social, f.site_name ?? "", f.description ?? "");
  return parts.filter(Boolean).join("\n");
}
