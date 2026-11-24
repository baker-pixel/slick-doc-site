// Variety engine for the social agent's captions.
//
// Topic memory alone (topicLedger.ts) stops the SAME SUBJECT repeating, but a
// client whose whole business is one product still got ~60 posts that were all
// "assessments help coaches find hidden potential" in the same shape, with the
// same openers ("Trusted by ... worldwide", "Many coaches struggle to...") and
// seasonal filler. This module varies the SHAPE of a post (format), polices
// OPENINGS, and rations season talk. All pure, so it is unit-tested.

export interface PostFormat {
  id: string;
  label: string;
  instruction: string;
  /** Platforms this format cannot fit (e.g. a 3-step list in a 240-char tweet). */
  not?: string[];
}

export const POST_FORMATS: PostFormat[] = [
  {
    id: "myth_vs_reality",
    label: "Myth vs reality",
    instruction: "Name one belief the audience commonly holds, then correct it with a practical truth. Lead with the myth itself.",
  },
  {
    id: "scenario",
    label: "Picture this",
    instruction: "Open on one short, specific moment from the audience's working day (clearly a scenario -- never claimed as a real client story), then show the better way through it.",
    not: ["twitter"],
  },
  {
    id: "how_to",
    label: "Quick how-to",
    instruction: "A tight, practical 3-step or 3-point how-to the reader could use today. Concrete verbs, no theory.",
    not: ["twitter"],
  },
  {
    id: "hot_take",
    label: "Respectful hot take",
    instruction: "A confident, mildly contrarian opinion about the industry or the audience's habits in one or two sentences, then the reasoning. Opinionated, not rude.",
  },
  {
    id: "question",
    label: "Real question",
    instruction: "Ask the audience one genuinely interesting question they would enjoy answering, with just enough context to make replying easy. No rhetorical 'Ever wondered...'.",
  },
  {
    id: "behind_scenes",
    label: "Behind the scenes",
    instruction: "A small look at how the work actually gets done (a decision, a process step, a thing people never see), using only what the facts support.",
    not: ["twitter"],
  },
  {
    id: "checklist",
    label: "Signs / checklist",
    instruction: "A short 'signs that...' or checklist list of 3-5 items the reader can check themselves against.",
    not: ["twitter"],
  },
  {
    id: "faq",
    label: "Straight answer",
    instruction: "Answer ONE question a prospect would genuinely ask before buying. The first sentence IS the answer.",
  },
  {
    id: "lesson",
    label: "Mistake to avoid",
    instruction: "One concrete mistake or lesson, stated plainly in the first line, with the fix. Specific beats universal.",
  },
  {
    id: "before_after",
    label: "Before / after",
    instruction: "Contrast the audience's 'before' and 'after' situation in plain terms (their situation, never invented statistics).",
    not: ["twitter"],
  },
  {
    id: "versus",
    label: "This or that",
    instruction: "Compare two approaches the audience could take to the same problem and say when each one wins. Take a side.",
  },
  {
    id: "tip",
    label: "One small tip",
    instruction: "A single small, immediately usable tip. Short, warm, no preamble.",
  },
];

/**
 * Least-recently-used format that fits the platform. Never-used formats win
 * first, then the one used longest ago, so no format repeats until all of the
 * platform's formats have been cycled through. `seed` only breaks ties, so two
 * clients (or two posts in one run) don't march in lockstep.
 */
export function pickFormat(
  platform: string,
  recentFormats: Array<string | null | undefined>,
  seed = 0,
): PostFormat {
  const p = (platform || "").toLowerCase();
  const pool = POST_FORMATS.filter((f) => !f.not?.includes(p));
  // recentFormats is newest-first: index = how recently it was used.
  const age = (id: string) => {
    const i = recentFormats.indexOf(id);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  let best = -Infinity;
  let tied: PostFormat[] = [];
  for (const f of pool) {
    const a = age(f.id);
    if (a > best) { best = a; tied = [f]; } else if (a === best) tied.push(f);
  }
  return tied[Math.abs(seed) % tied.length];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** First sentence (or first line) of a caption, trimmed to a short opener. */
export function openingOf(content: string | null | undefined): string {
  if (!content) return "";
  const firstLine = content.trim().split(/\n/)[0] ?? "";
  const sentence = firstLine.split(/(?<=[.!?…])\s/)[0] ?? firstLine;
  return sentence.trim().slice(0, 90);
}

/** Newest-first rows -> distinct recent openers (placeholder text excluded). */
export function collectRecentOpenings(
  rows: Array<{ content?: string | null }>,
  limit = 8,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.content || r.content.startsWith("[Auto-generated placeholder")) continue;
    const o = openingOf(r.content);
    const k = norm(o);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(o);
    if (out.length >= limit) break;
  }
  return out;
}

/** Openers a model reaches for by reflex. Patterns, matched on the normalized first sentence. */
const STOCK_OPENERS: RegExp[] = [
  /^trusted by\b/,
  /^many [a-z ]{2,40} (struggle|face|find|overlook|miss)\b/,
  /^ever (wondered|felt|wished|thought)\b/,
  /^(unlock|unleash|discover|uncover|elevate|empower)\b/,
  /^in today s\b/,
  /^in an era\b/,
  /^in a (world|landscape)\b/,
  /^as (the )?(leaves|winter|summer|spring|fall|autumn|december|november|october|january|september|season|we settle|we enter|temperatures)\b/,
  /^(it s|now is|now s) (the )?(perfect|a perfect|the ideal|a great) time\b/,
  /^when was the last time\b/,
  /^are you (ready|tired|struggling)\b/,
];

export function isStockOpener(opening: string): boolean {
  const k = norm(opening);
  return STOCK_OPENERS.some((re) => re.test(k));
}

/**
 * True if the draft opens like an earlier post (same first four words) or with
 * a reflex opener. Used to trigger one rewrite.
 */
export function openingCollision(content: string, recentOpenings: string[]): boolean {
  const opening = openingOf(content);
  if (!opening) return false;
  if (isStockOpener(opening)) return true;
  const head = norm(opening).split(" ").slice(0, 4).join(" ");
  if (!head) return false;
  return recentOpenings.some((o) => norm(o).split(" ").slice(0, 4).join(" ") === head);
}

/** Season/month talk only on roughly one post in four -- otherwise every post starts "As the leaves turn...". */
export function shouldMentionSeason(index: number): boolean {
  return ((index % 4) + 4) % 4 === 0;
}

/** Prompt block appended to every platform's user prompt. */
export function varietyBlock(opts: {
  format?: PostFormat;
  recentOpenings: string[];
  brief?: { angle: string; hook: string } | null;
}): string {
  const lines: string[] = [];
  if (opts.brief?.angle) {
    lines.push(`SPECIFIC ANGLE FOR THIS POST (write about exactly this, not the product in general): ${opts.brief.angle}`);
    if (opts.brief.hook) lines.push(`Opening idea (rework it in your own words, don't copy it): ${opts.brief.hook}`);
  }
  if (opts.format) {
    lines.push(`POST SHAPE -- ${opts.format.label}: ${opts.format.instruction}`);
  }
  lines.push(
    `VARIETY RULES:`,
    `- This feed has become repetitive. Sound like a person with a point of view, not a brochure.`,
    `- Do NOT open with: "Trusted by...", "Many [people] struggle...", "Ever wondered...", "Unlock/Discover/Uncover...", "In today's...", "In an era...", "When was the last time...", or any "As the leaves turn / winter / the season" opener.`,
    `- Do not restate who the audience is or a credibility line ("trusted worldwide") in the first sentence -- start inside the situation or the point.`,
    `- Do not end with a generic invitation to "reach out" unless the call to action is genuinely specific.`,
  );
  if (opts.recentOpenings.length) {
    lines.push(`- Recent posts opened like this -- yours must open differently in wording AND structure: ${opts.recentOpenings.map((o) => `"${o}"`).join(" | ")}`);
  }
  return `\n\n${lines.join("\n")}`;
}
