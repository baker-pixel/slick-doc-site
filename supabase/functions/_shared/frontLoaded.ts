// Front-loaded social copy: the first paragraph is the WHOLE message (problem ->
// solution -> call to action), so a reader who stops there has everything. Optional
// detail follows under an "In depth" label. Why: it works for every kind of reader,
// the key facts sit in the first 20-30% for AI crawlers, and it costs fewer tokens.
//
// A post stays plain text -- summary, optional "In depth" block, then hashtags -- so
// storage, approvals and publishing need no changes.

export const IN_DEPTH_LABEL = "In depth";

export type FrontLoadedPlatform = "linkedin" | "facebook" | "instagram";

interface Rules {
  /** Words the summary paragraph may use. */
  summaryMin: number;
  summaryMax: number;
  /** Words for the whole post, hashtags excluded. */
  totalMax: number;
  /** Hashtag guidance for the prompt. */
  hashtags: string;
}

export const FRONT_LOADED_RULES: Record<FrontLoadedPlatform, Rules> = {
  linkedin: { summaryMin: 20, summaryMax: 60, totalMax: 160, hashtags: "3-5 targeted hashtags" },
  facebook: { summaryMin: 15, summaryMax: 50, totalMax: 120, hashtags: "no more than 2 hashtags, or none" },
  // Instagram cuts the caption at the "more" link, so the summary has to be tighter still.
  instagram: { summaryMin: 12, summaryMax: 40, totalMax: 110, hashtags: "8-12 relevant hashtags after a line break" },
};

export function isFrontLoadedPlatform(p: string): p is FrontLoadedPlatform {
  return p === "linkedin" || p === "facebook" || p === "instagram";
}

export interface ParsedPost {
  summary: string;
  /** Text under the "In depth" label, or "" when the post has none. */
  detail: string;
  /** Trailing hashtag lines, kept out of the word counts. */
  hashtags: string;
  hasLabel: boolean;
}

const LABEL_LINE = /^[ \t]*(?:\*\*|#+\s*)?in[- ]depth(?:\s+view)?\s*:?\s*(?:\*\*)?[ \t]*$/im;
const HASHTAG_LINE = /^(?:\s*#[\p{L}\p{N}_]+)+\s*$/u;

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/** Split a post into summary / detail / hashtags. Never throws; an unlabelled post is all summary. */
export function parseFrontLoaded(text: string): ParsedPost {
  let body = text.trim();

  // Peel trailing hashtag-only lines off the end.
  const lines = body.split("\n");
  const tags: string[] = [];
  while (lines.length > 1 && (HASHTAG_LINE.test(lines[lines.length - 1]) || lines[lines.length - 1].trim() === "")) {
    const last = lines.pop()!;
    if (last.trim()) tags.unshift(last.trim());
  }
  body = lines.join("\n").trim();

  const m = LABEL_LINE.exec(body);
  if (m) {
    return {
      summary: body.slice(0, m.index).trim(),
      detail: body.slice(m.index + m[0].length).trim(),
      hashtags: tags.join("\n"),
      hasLabel: true,
    };
  }
  // No label: the first paragraph is the summary, anything after it is treated as detail.
  const [first, ...rest] = body.split(/\n\s*\n/);
  return { summary: first.trim(), detail: rest.join("\n\n").trim(), hashtags: tags.join("\n"), hasLabel: false };
}

// A summary must stand alone, so it cannot dangle: "read on", "here's why", a trailing colon or ellipsis.
const TEASER = /(\bread (on|more)\b|\bkeep reading\b|\bfind out (why|how|more|what)\b|\bhere'?s why\b|\bhere'?s how\b|\byou won'?t believe\b|\bwhat happened next\b|\bthe (secret|answer) is\b|\blet me explain\b|\bcontinue below\b|\bdetails below\b|\bsee below\b)/i;
const DANGLING_END = /(:|…|\.\.\.|-|–|—)\s*$/;

export interface FrontLoadedCheck {
  ok: boolean;
  /** Plain-English reasons, written to be fed straight back to the model. */
  problems: string[];
}

/** Does this draft follow the format? Used to trigger one retry, and in tests. */
export function checkFrontLoaded(text: string, platform: FrontLoadedPlatform): FrontLoadedCheck {
  const r = FRONT_LOADED_RULES[platform];
  const p = parseFrontLoaded(text);
  const problems: string[] = [];

  const sWords = wordCount(p.summary);
  if (sWords > r.summaryMax) problems.push(`the opening paragraph is ${sWords} words; it must be at most ${r.summaryMax}`);
  if (sWords < r.summaryMin) problems.push(`the opening paragraph is only ${sWords} words; it needs at least ${r.summaryMin} to carry the full message`);
  if (p.summary.includes("\n\n")) problems.push("the opening must be one paragraph");
  if (TEASER.test(p.summary) || DANGLING_END.test(p.summary)) {
    problems.push("the opening reads like a teaser; it must be complete on its own, with the call to action in it");
  }
  if (p.detail && !p.hasLabel) problems.push(`the detail must start under a line that says exactly "${IN_DEPTH_LABEL}"`);
  const total = sWords + wordCount(p.detail);
  if (total > r.totalMax) problems.push(`the whole post is ${total} words; keep it to ${r.totalMax} or fewer, hashtags excluded`);

  return { ok: problems.length === 0, problems };
}

/** The format section of a platform prompt, replacing the old "150-250 words" requirement. */
export function frontLoadedRequirements(platform: FrontLoadedPlatform): string {
  const r = FRONT_LOADED_RULES[platform];
  return [
    "FORMAT (strict):",
    `- Paragraph 1 is the ENTIRE message, ${r.summaryMin}-${r.summaryMax} words, one paragraph: the problem the reader has, how this business solves it, and a clear call to action. A reader who stops here must have everything they need.`,
    "- Paragraph 1 must NOT be a teaser or clickbait: no cliffhangers, no \"here's why\", no \"read on\", no question left unanswered.",
    `- After it you may add detail (examples, steps, proof) ONLY if it adds real value. Put it under a line that says exactly "${IN_DEPTH_LABEL}", then the detail. Skip the section entirely if there is nothing worth adding.`,
    `- The whole post is at most ${r.totalMax} words, hashtags excluded.`,
    `- Finish with ${r.hashtags}, on their own line.`,
    "- Plain text only: no markdown, no bold, no headings.",
  ].join("\n");
}

/** Feedback line for the single retry. */
export function frontLoadedRetryNote(problems: string[]): string {
  return `\n\nYour previous draft broke the format: ${problems.join("; ")}. Rewrite it so it follows the FORMAT rules exactly.`;
}
