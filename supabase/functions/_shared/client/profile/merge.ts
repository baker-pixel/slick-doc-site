// What may be written to the client's record. The rule: fill what is EMPTY, never overwrite what a person wrote,
// and offer the rest as suggestions they can accept. Verified facts and never-say lists are the client's own
// word, so the website only ever suggests to them. Pure; the database function re-checks emptiness under a lock.
import type { Claim, ValidProfile } from "./evidence.ts";
import { normalizeForQuote } from "./evidence.ts";
import { isPlaceholderIndustry } from "../businessContext.ts";

export interface ExistingContext {
  website_summary: string | null;
  industry: string | null;
  context_profile: Record<string, unknown> | null;
}

export interface Suggestion { text: string; evidence: { url: string; quote: string }[] }
export type SuggestionField = "services" | "differentiators" | "target_audience" | "location" | "business_summary" | "verified_facts" | "industry" | "website_summary";

export interface WritePlan {
  /** website_summary column, only when it is empty */
  website_summary: string | null;
  /** industry column, only when it is empty */
  industry: string | null;
  /** context_profile fields to set, only where currently empty */
  fill: Record<string, unknown>;
  /** things the website says that the client hasn't recorded: shown for accept / dismiss */
  suggestions: Partial<Record<SuggestionField, Suggestion[]>>;
  /** field names that were filled automatically */
  filled: string[];
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const key = (s: string) => normalizeForQuote(s);

/** Is this item already recorded, in any wording close enough to be the same thing? */
function alreadyThere(item: string, existing: string[]): boolean {
  const k = key(item);
  return existing.some((e) => {
    const ek = key(e);
    return ek === k || (k.length > 4 && ek.includes(k)) || (ek.length > 4 && k.includes(ek));
  });
}

const toSuggestion = (c: Claim): Suggestion => ({ text: c.text, evidence: c.evidence.slice(0, 2) });

export function planWrite(existing: ExistingContext, p: ValidProfile): WritePlan {
  const cp = existing.context_profile ?? {};
  const plan: WritePlan = { website_summary: null, industry: null, fill: {}, suggestions: {}, filled: [] };
  // Things the client dismissed before are not offered again.
  const dismissed = new Set(asList(cp.website_suggestions_dismissed).map(key));
  const suggest = (f: SuggestionField, c: Claim) => { if (!dismissed.has(key(c.text))) (plan.suggestions[f] ??= []).push(toSuggestion(c)); };

  // Summary: fills the Website Summary box only if it is empty; otherwise it is a suggestion when it says something different.
  if (p.summary) {
    if (blank(existing.website_summary)) { plan.website_summary = p.summary.text; plan.filled.push("website_summary"); }
    else if (key(existing.website_summary!) !== key(p.summary.text)) suggest("website_summary", p.summary);
    if (blank(cp.business_summary)) { plan.fill.business_summary = p.summary.text; plan.filled.push("business_summary"); }
  }

  if (p.industry) {
    if (blank(existing.industry) || isPlaceholderIndustry(existing.industry)) { plan.industry = p.industry.text; plan.filled.push("industry"); }
    else if (key(existing.industry!) !== key(p.industry.text) && !alreadyThere(p.industry.text, [existing.industry!])) suggest("industry", p.industry);
  }

  if (p.target_audience) {
    if (blank(cp.target_audience)) { plan.fill.target_audience = p.target_audience.text; plan.filled.push("target_audience"); }
    else if (!alreadyThere(p.target_audience.text, [String(cp.target_audience)])) suggest("target_audience", p.target_audience);
  }

  const lists: [keyof ValidProfile, string, SuggestionField][] = [["services", "services", "services"], ["differentiators", "differentiators", "differentiators"]];
  for (const [from, field, sf] of lists) {
    const claims = p[from] as Claim[];
    const have = asList(cp[field]);
    if (!claims.length) continue;
    if (blank(cp[field])) { plan.fill[field] = claims.map((c) => c.text); plan.filled.push(field); }
    else for (const c of claims) if (!alreadyThere(c.text, have)) suggest(sf, c);
  }

  // Location is one text field in the profile: fill it if empty, else suggest the places not yet mentioned.
  if (p.locations.length) {
    const cur = typeof cp.location === "string" ? cp.location : "";
    if (blank(cur)) { plan.fill.location = p.locations.map((c) => c.text).join(", "); plan.filled.push("location"); }
    else for (const c of p.locations) if (!alreadyThere(c.text, [cur])) suggest("location", c);
  }

  // Facts the site states (phone, address, hours...) are candidates for "verified facts", which only the client can confirm.
  const verified = asList(cp.verified_facts);
  for (const c of p.facts) if (!alreadyThere(c.text, verified)) suggest("verified_facts", c);

  return plan;
}

export const hasSuggestions = (s: WritePlan["suggestions"]) => Object.values(s).some((v) => v && v.length > 0);
