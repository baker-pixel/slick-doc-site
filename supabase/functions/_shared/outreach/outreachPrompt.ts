// Pure helpers for the cold-outreach email prompt, kept free of I/O so they
// can be unit tested (run-prospect-drip itself starts a server on import).
//
// Why this exists: outreach drafts read as AI spam ("Hi Upwork, I've been
// following how you connect talent...") and invented claims ("businesses like
// yours have found...", "our done-for-you service"). The causes were all in
// the prompt: the greeting used the company name as a first name, the model
// was told to "reference something specific" about prospects it knew nothing
// about, step 2 invited a social-proof line, and the client's Verified Facts /
// Never-say list (which the social engine already honours) never reached it.

// Role / shared inboxes: the local part is not a person's name.
const NON_NAME_LOCAL_PARTS = new Set([
  "info", "hello", "hi", "hey", "contact", "sales", "team", "support", "admin",
  "office", "mail", "enquiries", "inquiries", "press", "media", "hr", "jobs",
  "careers", "marketing", "billing", "accounts", "president", "presidencia",
  "ceo", "founder", "founders", "general", "service", "help", "newsletter",
  "partnerships", "editor", "editorial", "news", "tips", "welcome", "studio",
  "noreply", "no", "reception", "booking", "bookings", "orders",
]);

/**
 * Greeting line for a cold email. The prospect's `name` is a COMPANY name
 * (Maps/Apollo), so it must never be used as a first name. We only trust a
 * name when the address is clearly "first.last" / "first_last" / "first-last";
 * a lone token like "haydenb" or "presidencia" could be anything, so those
 * get a plain "Hi there," rather than a wrong name.
 */
export function outreachGreeting(email: string | null | undefined, firstName?: string | null): string {
  // A first name from an uploaded list beats guessing from the address.
  const given = (firstName ?? "").trim();
  if (/^[\p{L}][\p{L}'’-]{1,29}$/u.test(given)) return `Hi ${given},`;
  const local = (email ?? "").split("@")[0]?.split("+")[0]?.toLowerCase().trim() ?? "";
  const parts = local.split(/[._-]/).filter(Boolean);
  const first = parts[0];
  if (parts.length >= 2 && first && /^[a-z]{2,15}$/.test(first) && !NON_NAME_LOCAL_PARTS.has(first)) {
    return `Hi ${first[0].toUpperCase()}${first.slice(1)},`;
  }
  return "Hi there,";
}

export interface SenderContext {
  business_summary?: unknown;
  services?: unknown;
  verified_facts?: unknown;
  never_say?: unknown;
  differentiators?: unknown;
}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];

/**
 * What the email may claim about the sender, in the same shape the social
 * engine uses (fill-scheduled-content): Verified Facts are the only source
 * for capabilities, Never-say is a hard ban, positioning is tone only.
 */
export function senderFactsBlock(ctx: SenderContext | null | undefined, businessName: string): string {
  const c = ctx ?? {};
  const verified = strList(c.verified_facts);
  const neverSay = strList(c.never_say);
  const services = strList(c.services).slice(0, 6);
  const positioning = strList(c.differentiators).slice(0, 4);
  const summary = typeof c.business_summary === "string" ? c.business_summary.trim() : "";

  const lines: string[] = [`- Business name: ${businessName}`];
  if (summary) lines.push(`- About them: ${summary}`);
  if (verified.length) {
    lines.push(`- VERIFIED FACTS (the ONLY source for what they offer or have done): ${verified.join("; ")}`);
  } else {
    lines.push(`- VERIFIED FACTS: none provided. Stay general; add no features, technology or results.`);
  }
  if (services.length) lines.push(`- Services offered: ${services.join(", ")}`);
  if (neverSay.length) lines.push(`- NEVER say or imply (client instruction): ${neverSay.join("; ")}`);
  if (positioning.length) {
    lines.push(`- Self-described positioning (UNVERIFIED: tone only, never state as a fact or feature): ${positioning.join("; ")}`);
  }
  return lines.join("\n");
}

const TONE_GUIDE: Record<string, string> = {
  professional: "professional but plain-spoken, like a busy person writing a quick note",
  friendly: "warm and conversational, like writing to someone you've met once",
  casual: "relaxed and informal, short sentences, contractions",
  expert: "confident and direct, no hype; a peer talking to a peer",
};

export function toneInstruction(tone: unknown): string {
  const key = typeof tone === "string" ? tone.trim().toLowerCase() : "";
  return TONE_GUIDE[key] ?? (key ? `${key}, but still plain-spoken` : TONE_GUIDE.professional);
}

/**
 * Style reminder appended to every outreach prompt. Kept short on purpose (it is
 * sent once per email, four per prospect): findOutreachViolations below is what
 * actually enforces these, with a retry, so the prompt does not need to list
 * every banned phrase.
 */
export const OUTREACH_STYLE_RULES = `Write like a person typing a quick note: short sentences, contractions, no hype.
- No compliments, and never claim to have followed or researched them. Refer to them only through RECIPIENT facts and the ANGLE. Never invent a problem for them: any challenge is phrased as a question.
- Describe the sender only from VERIFIED FACTS and services. Invent no customers, results, stats or social proof ("businesses like yours", "we've helped").
- No buzzwords (unlock, leverage, streamline, seamless), no "reach out", no exclamation marks, no dashes in the body.
- Subject: 2-6 plain words, no colon, naming something specific about THEM (their product, service or place). Never "quick question". End with one question. At most one link.`;

export type Audience = "cold" | "existing";

export interface StepBrief { theme: string; maxWords: number }

const COLD_BRIEFS: Record<number, StepBrief> = {
  1: { theme: "Open with the ANGLE observation in your own words (one sentence, so they see it is about their business), then ask the ANGLE question. Then, in one short clause, say who the sender is and what they do (verified facts). No offer yet.", maxWords: 90 },
  2: { theme: "Follow-up that looks at a DIFFERENT side of their business than step 1 (another RECIPIENT fact). Add one specific, relevant thing the sender does (verified facts) and ask one question about it.", maxWords: 80 },
  3: { theme: "Plainly say what the sender offers and what the recipient would get, from verified facts only, tied to the ANGLE. Suggest one small next step, such as a short call.", maxWords: 100 },
  4: { theme: "Final note. Acknowledge they are busy; ask if it is worth a chat or who else to speak to.", maxWords: 55 },
};

// Existing customers/contacts already know the sender: announce, don't introduce.
const EXISTING_BRIEFS: Record<number, StepBrief> = {
  1: { theme: "Announcement to someone who already knows the sender. Say what is new and why it matters to them, from the campaign details. Do not introduce the business.", maxWords: 90 },
  2: { theme: "Short reminder with one concrete detail from the campaign details they may have missed.", maxWords: 70 },
  3: { theme: "Brief last note. Offer to answer questions or walk them through it.", maxWords: 55 },
  4: { theme: "Brief last note. Offer to answer questions or walk them through it.", maxWords: 55 },
};

export function stepBrief(step: number, audience: Audience = "cold"): StepBrief | null {
  return (audience === "existing" ? EXISTING_BRIEFS : COLD_BRIEFS)[step] ?? null;
}

export interface CampaignContext {
  topic?: string | null;
  topic_details?: string | null;
  audience?: Audience | null;
}

/**
 * Extra prompt lines for a campaign email, empty for the legacy pipeline. The
 * details are what the CLIENT told us about the topic, so unlike AI-extracted
 * context they may be stated as fact.
 */
export function campaignBlock(c: CampaignContext | null | undefined): string {
  const topic = c?.topic?.trim();
  if (!topic) return "";
  const details = c?.topic_details?.trim();
  return [
    `CAMPAIGN TOPIC: ${topic}`,
    details ? `Details from the sender (may be stated as fact): ${details}` : "",
    c?.audience === "existing" ? "Recipient is an existing customer or contact of the sender." : "",
  ].filter(Boolean).join("\n");
}

// Violations are checked after generation as a safety net: a prompt can ask
// for a style, but only a check guarantees one reaches the queue.
const BANNED: { re: RegExp; label: string }[] = [
  { re: /\bi(?:'ve| have)?\s+(?:really\s+)?(?:appreciate|admire|love|enjoy)\b/i, label: "compliments the recipient" },
  { re: /\b(?:impressed|impressive)\b/i, label: "flattery (impressed)" },
  { re: /\b(?:i(?:'ve| have)?\s+been|i(?:'ve| have))\s+(?:following|exploring|studying|researching|admiring|reviewing)\b/i, label: "claims to have been following/exploring them" },
  { re: /\bi\s+came\s+across\b/i, label: "'I came across'" },
  { re: /\bhope\s+(?:this|you)[^.]{0,40}(?:finds?|well)\b/i, label: "'hope this finds you well'" },
  { re: /\breach(?:ing)?\s+out\b/i, label: "'reach out'" },
  { re: /\b(?:unlock\w*|unleash\w*|leverag\w+|elevat\w+|streamlin\w+|seamless\w*|synerg\w+|revolutioniz\w+|game[- ]chang\w+|cutting[- ]edge|state[- ]of[- ]the[- ]art)\b/i, label: "marketing buzzword" },
  { re: /\b(?:businesses|companies|organi[sz]ations|teams|firms)\s+like\s+(?:yours|you)\b/i, label: "'businesses like yours' social proof" },
  { re: /\b(?:we(?:'ve| have)|our\s+clients\s+(?:have\s+)?)\s*(?:seen|helped|found|worked\s+with)\b/i, label: "unverified social proof" },
  { re: /\bmany\s+of\s+our\s+(?:clients|customers)\b/i, label: "unverified social proof" },
  { re: /\bdone[- ]for[- ]you\b/i, label: "'done-for-you' claim" },
  { re: /\bno\s+pitch\b/i, label: "'no pitch'" },
  { re: /\[[^\]]{1,40}\]/, label: "placeholder brackets" },
];

/** Subjects that say nothing about the recipient (they read as a mass mailing). */
const GENERIC_SUBJECT = /^(?:a\s+)?quick\s+(?:question|note|chat|call|idea)\b|^(?:just\s+)?(?:following\s+up|checking\s+in|touching\s+base)\b/i;

/** Banned phrases found in `text` (labels), shared by the draft check and the angle check. */
export function bannedPhrases(text: string): string[] {
  return [...new Set(BANNED.filter(({ re }) => re.test(text)).map(({ label }) => label))];
}

const stripTags = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** Body text without the trailing "— sign off" paragraph. */
function bodyWithoutSignOff(html: string): string {
  const withoutSign = html.replace(/<p[^>]*>\s*(?:—|&mdash;|-)\s[\s\S]*?<\/p>\s*$/i, "");
  return stripTags(withoutSign);
}

export function wordCount(html: string): number {
  const t = bodyWithoutSignOff(html);
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Returns human-readable reasons the draft should not be sent. Empty array =
 * clean. `greeting` is the exact required opening line.
 */
export function findOutreachViolations(
  draft: { subject: string; html: string },
  opts: { greeting: string; maxWords?: number; neverSay?: string[] },
): string[] {
  const out: string[] = [];
  const body = bodyWithoutSignOff(draft.html);
  const subject = draft.subject.trim();
  const haystack = `${subject}\n${body}`;

  for (const { re, label } of BANNED) {
    if (re.test(haystack)) out.push(label);
  }

  if (!stripTags(draft.html).toLowerCase().startsWith(opts.greeting.toLowerCase())) {
    out.push(`must open with exactly "${opts.greeting}"`);
  }
  if (/[—–]/.test(body)) out.push("uses em/en dashes in the body");
  if ((body.match(/!/g) ?? []).length > 0 || subject.includes("!")) out.push("uses exclamation marks");
  if (subject.split(/\s+/).filter(Boolean).length > 8 || subject.includes(":")) out.push("subject too long or uses a colon");
  if (GENERIC_SUBJECT.test(subject)) out.push("generic subject: name something specific about them");
  if (opts.maxWords && wordCount(draft.html) > opts.maxWords) out.push(`longer than ${opts.maxWords} words`);

  const links = (draft.html.match(/<a\s/gi) ?? []).length;
  if (links > 1) out.push("more than one link");

  for (const phrase of opts.neverSay ?? []) {
    const p = phrase.trim();
    if (p.length >= 3 && haystack.toLowerCase().includes(p.toLowerCase())) out.push(`says "${p}" (client never-say)`);
  }

  return [...new Set(out)];
}

// ── Outreach angle ───────────────────────────────────────────────────────────
// The hook. A cold email needs one thing that is true of THIS business and one
// honest question that follows from it. Deriving it separately from the drafts
// (once per prospect, reused by all four steps) keeps the steps from each making
// up their own, and lets us check it against what we actually know before any
// draft is written.

export interface OutreachAngle { observation: string; question: string }

const STOP = new Set(["that", "this", "with", "from", "have", "your", "their", "they", "them", "and", "the", "for", "are", "you", "has", "its", "also", "into", "more", "than", "such", "what", "when", "which", "while", "across", "serving", "offers", "offer", "company", "business"]);

const contentWords = (t: string): Set<string> =>
  new Set((t.toLowerCase().match(/[a-z][a-z'&-]{3,}/g) ?? []).filter((w) => !STOP.has(w)));

/**
 * True when the observation reuses enough of the recipient's own facts to be about them:
 * at least `min` distinct content words of the observation appear in the facts text. A model
 * that drifts into generic claims, or invents a detail, shares too few words and fails.
 */
export function groundedIn(observation: string, factsText: string, min = 2): boolean {
  const facts = contentWords(factsText);
  let hits = 0;
  for (const w of contentWords(observation)) if (facts.has(w)) hits++;
  return hits >= min;
}

/** Validate a model's angle: right shape and length, clean wording, a real question, grounded. */
export function parseAngle(raw: unknown, factsText: string): OutreachAngle | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { observation?: unknown; question?: unknown };
  const observation = typeof o.observation === "string" ? o.observation.trim().replace(/\s+/g, " ") : "";
  const question = typeof o.question === "string" ? o.question.trim().replace(/\s+/g, " ") : "";
  if (observation.length < 25 || observation.length > 320) return null;
  if (question.length < 15 || question.length > 240 || !question.endsWith("?")) return null;
  if (/!/.test(observation + question) || /[—–]/.test(observation + question)) return null;
  if (bannedPhrases(`${observation}\n${question}`).length > 0) return null;
  if (!groundedIn(observation, factsText)) return null;
  return { observation, question };
}

export function angleBlock(angle: OutreachAngle | null | undefined): string {
  if (!angle) return "";
  return `ANGLE (the hook for this recipient; use it, in your own words):
- Observation (true of them, from RECIPIENT facts): ${angle.observation}
- Question to ask (a hypothesis phrased as a question, never state it as a fact): ${angle.question}`;
}
