// Evidence rules: nothing the profile says is kept unless the page it cites really contains it.
// A claim needs a verbatim quote from a named page; the quote is checked against that page's
// stored text. This is what keeps an AI-built company profile from inventing services, awards or
// numbers, and what stops a page that says "ignore your instructions" from steering the result.
import { findPage, pageQuoteText, type Corpus } from "./corpus.ts";

export interface EvidenceRef { url: string; quote: string }
export interface Claim { text: string; evidence: EvidenceRef[] }
export interface ValidProfile {
  summary: Claim | null;
  industry: Claim | null;
  target_audience: Claim | null;
  services: Claim[];
  differentiators: Claim[];
  locations: Claim[];
  facts: Claim[];
  tone: "professional" | "friendly" | "casual" | "expert" | null;
}
export interface Drop { field: string; text: string; reason: string }

const STOP = new Set("a an and are as at be by for from has have how in into is it its of on or our that the their this to we with you your will can more most not but all any about who what when where which also than then them they there these those been being was were do does did".split(" "));

/** Lowercase words only: punctuation, quote styles and whitespace differences don't matter. */
export function normalizeForQuote(s: string): string {
  return s.toLowerCase()
    .replace(/[‘’‚‛′`]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—−]/g, "-")
    .replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

const wordsOf = (s: string) => normalizeForQuote(s).split(" ").filter(Boolean);
const digitCount = (s: string) => (s.match(/\d/g) ?? []).length;

/** A quote counts if it's long enough to mean something and appears word-for-word in the page text. */
export function quoteSupported(quote: string, pageText: string): boolean {
  const q = normalizeForQuote(quote);
  if (!q) return false;
  const wc = q.split(" ").length;
  const specific = digitCount(quote) >= 7 || /@|https?:\/\/|www\./i.test(quote) || /\b\d{1,2}[:.]\d{2}\b/.test(quote);
  if (wc < 4 && !(specific && q.length >= 7)) return false;
  return (" " + normalizeForQuote(pageText) + " ").includes(" " + q + " ");
}

const content = (s: string) => wordsOf(s).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ""));

/** Do most of the claim's meaningful words appear on the cited page? Catches a real quote attached to an unrelated claim. */
export function claimOnPage(claim: string, pageText: string, min = 0.6): boolean {
  const words = [...new Set(content(claim))];
  if (!words.length) return false;
  const page = new Set(content(pageText));
  return words.filter((w) => page.has(w)).length / words.length >= min;
}

const INSTRUCTION_LIKE = /ignore (all |any |the )?(previous|prior|above|earlier)|disregard (the |your )?(instructions|rules)|system prompt|you are (now )?an? (ai|assistant|language model)|as an ai\b|submit_profile|new instructions?|do not follow/i;

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

// How much of a claim's wording must appear on the cited page. A service name should be on the page almost verbatim;
// a summary or an industry label is the model's own wording, so it only has to share the page's vocabulary.
const OVERLAP: Record<string, number> = { summary: 0.35, industry: 0.4, target_audience: 0.4, differentiators: 0.5, locations: 0.5, facts: 0.5, services: 0.6 };

function checkClaim(field: string, raw: unknown, corpus: Corpus, maxLen: number, drops: Drop[], textKey = "text"): Claim | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = clean(o[textKey] ?? o.text ?? o.name ?? o.value, maxLen);
  if (!text) return null;
  if (INSTRUCTION_LIKE.test(text)) { drops.push({ field, text, reason: "looks like an instruction, not a business fact" }); return null; }
  const good: EvidenceRef[] = [];
  let why = "no evidence given";
  for (const e of Array.isArray(o.evidence) ? o.evidence : []) {
    const url = clean((e as EvidenceRef)?.url, 500), quote = clean((e as EvidenceRef)?.quote, 400);
    if (!url || !quote) continue;
    const page = findPage(corpus, url);
    if (!page) { why = "cited page was not part of the crawl"; continue; }
    if (INSTRUCTION_LIKE.test(quote)) { why = "evidence looks like an instruction"; continue; }
    const text_ = pageQuoteText(page);
    if (!quoteSupported(quote, text_)) { why = "quote not found on the cited page"; continue; }
    if (!claimOnPage(text, text_, OVERLAP[field] ?? 0.6)) { why = "claim isn't about what the cited page says"; continue; }
    good.push({ url: page.url, quote });
  }
  if (!good.length) { drops.push({ field, text, reason: why }); return null; }
  return { text, evidence: good.slice(0, 3) };
}

function checkList(field: string, raw: unknown, corpus: Corpus, max: number, maxLen: number, drops: Drop[]): Claim[] {
  const seen = new Set<string>();
  const out: Claim[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const c = checkClaim(field, item, corpus, maxLen, drops);
    if (!c) continue;
    const k = normalizeForQuote(c.text);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** Numbers in a summary must come from the site: a figure the pages never state is invented. */
function numbersAreReal(text: string, corpus: Corpus): boolean {
  const nums = text.match(/\d[\d,.]*\d|\d/g) ?? [];
  if (!nums.length) return true;
  const all = corpus.pages.map(pageQuoteText).join("\n");
  return nums.every((n) => all.includes(n));
}

export function validateProposal(raw: unknown, corpus: Corpus): { profile: ValidProfile; dropped: Drop[] } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const dropped: Drop[] = [];

  let summary = checkClaim("summary", o.summary, corpus, 600, dropped);
  if (summary) {
    if (summary.text.length < 40) { dropped.push({ field: "summary", text: summary.text, reason: "too short to be useful" }); summary = null; }
    else if (!numbersAreReal(summary.text, corpus)) { dropped.push({ field: "summary", text: summary.text, reason: "contains a number the website doesn't state" }); summary = null; }
  }
  const tone = typeof o.tone === "string" && ["professional", "friendly", "casual", "expert"].includes(o.tone) ? (o.tone as ValidProfile["tone"]) : null;
  return {
    profile: {
      summary,
      industry: checkClaim("industry", o.industry, corpus, 60, dropped),
      target_audience: checkClaim("target_audience", o.target_audience, corpus, 300, dropped),
      services: checkList("services", o.services, corpus, 12, 80, dropped),
      differentiators: checkList("differentiators", o.differentiators, corpus, 8, 200, dropped),
      locations: checkList("locations", o.locations, corpus, 8, 120, dropped),
      facts: checkList("facts", o.facts, corpus, 12, 200, dropped),
      tone,
    },
    dropped,
  };
}

export const emptyProfile = (): ValidProfile => ({ summary: null, industry: null, target_audience: null, services: [], differentiators: [], locations: [], facts: [], tone: null });
