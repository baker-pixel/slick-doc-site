// Turns what an owner wrote about their business into short "verified fact" statements.
// The owner's own words are the evidence (a fact a client states about themselves is theirs to
// assert), so the one rule is: nothing the model adds. Each statement must reuse the words of the
// text it came from, and may not carry buzzwords or flattery. The owner reviews and saves.

import { bannedPhrases, groundedIn } from "../outreach/outreachPrompt.ts";

export const MIN_DESCRIPTION = 30;
export const MAX_DESCRIPTION = 2000;
export const MAX_DRAFT_FACTS = 6;
const MIN_FACT = 8;
const MAX_FACT = 160;

/** Trim, bound, and drop statements that are not grounded in `source`, are marketing speak, or repeat. */
export function cleanDraftedFacts(raw: unknown, source: string): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const fact = item.trim().replace(/\s+/g, " ").replace(/^[-•*\d.)\s]+/, "");
    if (fact.length < MIN_FACT || fact.length > MAX_FACT) continue;
    if (/[!]/.test(fact) || bannedPhrases(fact).length > 0) continue;
    if (!groundedIn(fact, source, 1)) continue;
    const key = fact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fact);
    if (out.length >= MAX_DRAFT_FACTS) break;
  }
  return out;
}

/** The text is long enough to say something, and not absurdly long. */
export function validDescription(text: unknown): text is string {
  return typeof text === "string" && text.trim().length >= MIN_DESCRIPTION && text.length <= MAX_DESCRIPTION;
}
