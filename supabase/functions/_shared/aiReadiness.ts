// AI readiness scoring (free tier). Heuristic, computed synchronously from
// already-fetched HTML plus a couple of light auxiliary fetches (llms.txt,
// robots.txt, sitemap.xml) -- no LLM call. Every sub-score is derived from a
// checkable, reproducible signal on purpose: this is what makes the number
// defensible in a report instead of being an LLM's opinion of the site.
//
// Distinct from (and a prerequisite for) the paid "AI visibility score",
// which actually probes live LLMs for citation -- that's a separate,
// later-phase system. This one answers "is this site legible to an AI
// crawler/answer engine at all," not "does an AI actually mention it."

import type { parseOnPage } from "./seoSignals.ts";

export interface AiReadinessScores {
  schema_score: number; // 0-25
  llms_txt_score: number; // 0-10
  faq_structure_score: number; // 0-20
  entity_consistency_score: number; // 0-20
  crawlability_score: number; // 0-15
  fact_density_score: number; // 0-10
  total_score: number; // 0-100
}

type Signals = ReturnType<typeof parseOnPage>;

async function fetchOk(url: string, timeoutMs = 6000): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const body = res.ok ? await res.text() : "";
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: "" };
  }
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
      for (const item of items) if (item && typeof item === "object") blocks.push(item as Record<string, unknown>);
    } catch {
      // malformed JSON-LD -- skip it, don't let one bad block sink the whole score
    }
  }
  return blocks;
}

function typeIncludes(block: Record<string, unknown>, needle: string): boolean {
  const t = block["@type"];
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => typeof x === "string" && x.toLowerCase().includes(needle));
}

function scoreSchema(blocks: Record<string, unknown>[]): number {
  if (blocks.length === 0) return 0;
  let score = 10; // any valid JSON-LD present at all
  const entity = blocks.find(
    (b) => typeIncludes(b, "localbusiness") || typeIncludes(b, "organization") || typeIncludes(b, "professionalservice"),
  );
  if (entity) {
    score += 5;
    if (entity["name"] && (entity["address"] || entity["telephone"])) score += 5;
  }
  if (blocks.some((b) => b["aggregateRating"] || b["review"])) score += 5;
  return Math.min(score, 25);
}

function scoreFaq(blocks: Record<string, unknown>[], html: string): number {
  if (blocks.some((b) => typeIncludes(b, "faqpage"))) return 20;
  // No formal FAQPage markup -- fall back to a structural proxy: headings
  // phrased as real questions followed by answer copy.
  const headingQuestions = [...html.matchAll(/<h[23][^>]*>([^<]*\?)\s*<\/h[23]>/gi)].length;
  if (headingQuestions >= 5) return 20;
  if (headingQuestions >= 3) return 14;
  if (headingQuestions >= 1) return 8;
  return 0;
}

function scoreEntityConsistency(blocks: Record<string, unknown>[], textSample: string): number {
  const entity = blocks.find((b) => b["name"] && (b["telephone"] || b["address"]));
  if (!entity) return 0; // no structured entity data to check consistency against
  let score = 10;
  const phone = typeof entity["telephone"] === "string" ? (entity["telephone"] as string).replace(/\D/g, "") : "";
  if (phone && textSample.replace(/\D/g, "").includes(phone.slice(-10))) score += 10;
  else if (!phone) score += 5; // address-only entity, nothing to cross-check
  return Math.min(score, 20);
}

async function scoreCrawlability(origin: string, robots: { ok: boolean; body: string }): Promise<number> {
  let score = 0;
  if (robots.ok) {
    score += 5;
    const blanketBlock = /user-agent:\s*\*[\s\S]{0,40}disallow:\s*\/\s*$/im.test(robots.body);
    if (!blanketBlock) score += 5;
  }
  const sitemap = await fetchOk(`${origin}/sitemap.xml`);
  if (sitemap.ok && /<loc>/i.test(sitemap.body)) score += 5;
  return score;
}

async function scoreLlmsTxt(origin: string, robotsBody: string): Promise<number> {
  const llms = await fetchOk(`${origin}/llms.txt`);
  if (llms.ok && llms.body.trim().length > 50) return 10;
  // Partial credit: robots.txt exists and doesn't explicitly block known AI crawlers.
  const aiBots = ["gptbot", "perplexitybot", "claudebot", "google-extended"];
  const blocksAiBot = aiBots.some((bot) =>
    new RegExp(`user-agent:\\s*${bot}[\\s\\S]{0,60}disallow:\\s*/\\s*$`, "im").test(robotsBody)
  );
  if (robotsBody && !blocksAiBot) return 4;
  return 0;
}

function scoreFactDensity(signals: Signals): number {
  if (signals.word_count === 0) return 0;
  const text = signals.text_sample;
  const priceHits = (text.match(/\$\s?\d/g) ?? []).length;
  const phoneHits = (text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) ?? []).length;
  const hoursHits = (text.match(/\b\d{1,2}(:\d{2})?\s?(am|pm)\b/gi) ?? []).length;
  const facts = priceHits + phoneHits + hoursHits;
  const perFiveHundredWords = (facts / Math.max(signals.word_count, 1)) * 500;
  return Math.min(10, Math.round(perFiveHundredWords * 3));
}

export async function computeAiReadiness(html: string, url: string, signals: Signals): Promise<AiReadinessScores> {
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    // invalid URL -- crawlability/llms.txt can't be checked, they score 0 below
  }

  const blocks = extractJsonLd(html);
  const robots = origin ? await fetchOk(`${origin}/robots.txt`) : { ok: false, status: 0, body: "" };

  const schema_score = scoreSchema(blocks);
  const faq_structure_score = scoreFaq(blocks, html);
  const entity_consistency_score = scoreEntityConsistency(blocks, signals.text_sample);
  const fact_density_score = scoreFactDensity(signals);
  const [crawlability_score, llms_txt_score] = origin
    ? await Promise.all([scoreCrawlability(origin, robots), scoreLlmsTxt(origin, robots.body)])
    : [0, 0];

  const total_score = Math.min(
    100,
    schema_score + llms_txt_score + faq_structure_score + entity_consistency_score + crawlability_score + fact_density_score,
  );

  return {
    schema_score,
    llms_txt_score,
    faq_structure_score,
    entity_consistency_score,
    crawlability_score,
    fact_density_score,
    total_score,
  };
}
