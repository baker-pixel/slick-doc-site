// Keyword quality for Apollo company search.
//
// Apollo matches keyword tags against company descriptions and websites, so a tag
// should be the short noun phrase a target company would use about itself.
// Model-written tags drift ("employee engagement solutions", "behavioral analytics
// companies"): they match the wrong kind of company, and nothing checked them
// before credits were spent. This module
//   1. normalizes tags (drops filler words like "companies"/"solutions"), and
//   2. probes each new tag with ONE Apollo page and has a cheap model judge how many
//      of the returned companies plausibly match the client's ICP, keeping only tags
//      that clear a bar.
// The judge sees only name + domain (all a search result carries), so it is a coarse
// pre-filter: real fit scoring still runs on the scanned website later.

import { callAIJson, MODELS } from "../ai/ai.ts";
import { apolloSearchCompanies, type FoundCompany } from "./apolloSearch.ts";
import { toBareDomain } from "./apolloSearchState.ts";
import type { ClientICP } from "./icp.ts";

/** Fewer returned companies than this and a tag is too narrow to judge or to use. */
export const PROBE_MIN_SAMPLE = 5;
/** Share of the judged sample that must plausibly match the ICP for a tag to be kept. */
export const PROBE_MIN_FIT_RATE = 0.4;
/** Companies shown to the judge per tag. */
export const PROBE_SAMPLE_SIZE = 20;
/** Apollo pages (credits) one validation may spend. */
export const MAX_PROBES_PER_RUN = 8;

const FILLER_TRAILING = /\s+(companies|company|firms|firm|providers|provider|solutions|vendors|businesses)$/i;
const GENERIC_SINGLE = new Set(["technology", "software", "ai", "consulting", "hr", "services", "business"]);

/**
 * "leadership coaching firms" -> "leadership coaching". Returns "" when nothing
 * specific is left (too short, or only a generic word).
 */
export function normalizeKeyword(raw: string): string {
  let k = (raw ?? "").trim().replace(/\s+/g, " ");
  for (let i = 0; i < 2 && FILLER_TRAILING.test(k); i++) k = k.replace(FILLER_TRAILING, "").trim();
  if (k.length < 3 || k.length > 60) return "";
  if (GENERIC_SINGLE.has(k.toLowerCase())) return "";
  return k;
}

/** Normalize a list, dropping blanks and case-insensitive duplicates, keeping first-seen order. */
export function normalizeKeywords(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const k = normalizeKeyword(raw);
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}

export interface ProbeResult {
  tag: string;
  /** Companies Apollo returned for the single probe page. */
  found: number;
  /** How many of them the judge looked at (0 = judge unavailable). */
  judged: number;
  /** How many the judge said plausibly match the ICP. */
  fit: number;
  /** fit / judged, or null when not judged. */
  rate: number | null;
}

export interface PickOptions {
  minRate?: number;
  minSample?: number;
  /** If nothing clears the bar, still keep this many of the best (initial setup needs *some* keywords). */
  minKeep?: number;
}

/**
 * Which probed tags to keep.
 *  - too few companies returned -> drop (too narrow to be useful)
 *  - judged and rate >= bar -> keep
 *  - not judged (judge down) -> keep: our tooling failing must not block discovery
 *  - nothing kept and minKeep > 0 -> fall back to the best judged tags with any fit
 */
export function pickKeywords(results: ProbeResult[], opts: PickOptions = {}): string[] {
  const { minRate = PROBE_MIN_FIT_RATE, minSample = PROBE_MIN_SAMPLE, minKeep = 0 } = opts;
  const usable = results.filter((r) => r.found >= minSample);
  const kept = usable.filter((r) => r.rate === null || r.rate >= minRate).map((r) => r.tag);
  if (kept.length > 0 || minKeep <= 0) return kept;
  return usable
    .filter((r) => r.rate !== null && r.rate > 0)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
    .slice(0, minKeep)
    .map((r) => r.tag);
}

/**
 * The keyword list after an audit: the tags that passed, plus tags the probe budget
 * did not reach (we know nothing against them). Compared in normalized form, so a
 * tag that was probed and pruned ("employee engagement solutions", probed as
 * "employee engagement") can never come back as "untested".
 */
export function mergeAuditKeywords(before: string[], kept: string[], probedTags: string[]): string[] {
  const probed = new Set(probedTags.map((t) => t.toLowerCase()));
  const untested = normalizeKeywords(before).filter((t) => !probed.has(t.toLowerCase()));
  return normalizeKeywords([...kept, ...untested]);
}

/** Normalized tags that have not been probed yet (not in the validated list). */
export function pendingValidation(tags: string[], validated: string[] | undefined): string[] {
  const done = new Set((validated ?? []).map((t) => t.toLowerCase()));
  return normalizeKeywords(tags).filter((t) => !done.has(t.toLowerCase()));
}

export interface ProbeDeps {
  /** One Apollo page for this tag. Throwing stops probing (credits, auth, rate limit). */
  search(tag: string): Promise<FoundCompany[]>;
  /** How many of `sample` plausibly match the ICP. Throwing means "could not judge". */
  judge(tag: string, sample: FoundCompany[]): Promise<number>;
}

export async function probeKeywords(tags: string[], deps: ProbeDeps, limit = MAX_PROBES_PER_RUN): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const tag of tags.slice(0, limit)) {
    let found: FoundCompany[];
    try {
      found = await deps.search(tag);
    } catch (e) {
      console.warn(`keyword probe stopped at "${tag}":`, e instanceof Error ? e.message : e);
      break;
    }
    const sample = found.slice(0, PROBE_SAMPLE_SIZE);
    let fit = 0;
    let judged = 0;
    if (sample.length >= PROBE_MIN_SAMPLE) {
      try {
        fit = Math.max(0, Math.min(sample.length, await deps.judge(tag, sample)));
        judged = sample.length;
      } catch (e) {
        console.warn(`keyword judge failed for "${tag}" (keeping unvalidated):`, e instanceof Error ? e.message : e);
      }
    }
    results.push({ tag, found: found.length, judged, fit, rate: judged > 0 ? fit / judged : null });
  }
  return results;
}

/** Ask a cheap model which sample companies plausibly match the client's ICP. */
export async function judgeSampleWithAI(
  client: { id: string; business_name: string; context_profile?: Record<string, unknown> | null },
  icp: ClientICP,
  tag: string,
  sample: FoundCompany[],
): Promise<number> {
  const list = sample.map((c, i) => `${i + 1}. ${c.name} (${toBareDomain(c.website_url) || c.website_url})`).join("\n");
  const res = await callAIJson<{ fit?: unknown }>({
    source: "keyword-probe",
    clientId: client.id,
    model: MODELS.fast,
    jsonMode: true,
    maxTokens: 120,
    promptId: "keyword-probe-judge.v1",
    prompt: `We are choosing a search keyword ("${tag}") to find companies that would BUY from "${client.business_name}".
Sells: ${typeof client.context_profile?.business_summary === "string" ? client.context_profile.business_summary : "n/a"}
Ideal customer: ${icp.summary}
Buyer's industries: ${icp.industries.join(", ")}
Bad fits: ${(icp.disqualifiers || []).join("; ") || "none"}

These companies were returned for that keyword (name and website only):
${list}

Which of them plausibly match the ideal customer? Be strict: if you cannot tell from the name and domain, or it is clearly a different kind of business (agency, staffing firm, unrelated software, payroll), it does NOT match.
Return ONLY JSON: {"fit":[<numbers of the matching companies>]}`,
  });
  const idx = Array.isArray(res.fit) ? res.fit : [];
  const valid = new Set(idx.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= sample.length));
  return valid.size;
}

export interface ValidateArgs {
  tags: string[];
  client: { id: string; business_name: string; context_profile?: Record<string, unknown> | null };
  icp: ClientICP;
  apolloKey: string;
  geography: string;
  /** Domains the client already has, so the probe samples companies we could actually add. */
  excludeDomains: string[];
  minKeep?: number;
}

export interface ValidateOutcome {
  kept: string[];
  results: ProbeResult[];
  /** Apollo pages spent. */
  calls: number;
}

/** Probe + judge + pick, wired to real Apollo and the model. */
export async function validateKeywords(a: ValidateArgs): Promise<ValidateOutcome> {
  const tags = normalizeKeywords(a.tags);
  let calls = 0;
  const results = await probeKeywords(tags, {
    search: async (tag) => {
      calls++;
      // maxResults 20 => per_page 40: one credit buys a decent sample.
      return await apolloSearchCompanies(a.apolloKey, [tag], a.icp, a.geography, 20, undefined, 1, a.excludeDomains);
    },
    judge: (tag, sample) => judgeSampleWithAI(a.client, a.icp, tag, sample),
  });
  return { kept: pickKeywords(results, { minKeep: a.minKeep ?? 0 }), results, calls };
}
