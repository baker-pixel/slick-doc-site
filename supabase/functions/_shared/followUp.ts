// The optional second step of the free scan: a few tap-to-answer questions that unlock the
// two SYSTEM categories a website can't reveal (Sequence & Nurture, Transaction Activation).
//
// ONE definition used by the submit-followup edge function (validation + scoring) and the
// browser (rendering), so the questions shown are exactly the ones scored. Answers are fixed
// choices, never free text, and are turned into the same field values the Gap Analysis form
// produces, then scored by the shared gapScore module: one formula for both.
// Pure TypeScript: no Deno or DOM APIs.
import { calculateSystemScorecard, GAP_SCORE_VERSION, type SystemScore } from "./gapScore.ts";

export type FollowUpCategory = "S2" | "T";

export interface FollowUpOption {
  value: string;
  label: string;
}

export interface FollowUpQuestion {
  id: string;
  category: FollowUpCategory;
  text: string;
  options: FollowUpOption[];
  /** Only asked when this other question was answered with this value. */
  showIf?: { id: string; value: string };
}

const YES_NO: FollowUpOption[] = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];

export const FOLLOW_UP_QUESTIONS: FollowUpQuestion[] = [
  {
    id: "lead_response", category: "T", text: "When a new lead gets in touch, how quickly does someone reply?",
    options: [
      { value: "within_15_min", label: "Within 15 minutes" }, { value: "within_1_hour", label: "Within an hour" },
      { value: "within_4_hours", label: "Within a few hours" }, { value: "same_day", label: "Same day" },
      { value: "next_day", label: "Next business day" }, { value: "slower", label: "More than a day" },
    ],
  },
  { id: "booking", category: "T", text: "Can customers book a call or appointment online?", options: YES_NO },
  {
    id: "close_rate", category: "T", text: "Roughly what share of leads become paying customers?",
    options: [
      { value: "under_10", label: "Under 10%" }, { value: "10_20", label: "10 to 20%" }, { value: "20_30", label: "20 to 30%" },
      { value: "over_30", label: "Over 30%" }, { value: "unsure", label: "Not sure" },
    ],
  },
  {
    id: "lost", category: "T", text: "Where do most leads slip away?",
    options: [
      { value: "before_reply", label: "Before we reply to them" }, { value: "after_quote", label: "After they get a quote or price" },
      { value: "go_quiet", label: "They go quiet after the first conversation" }, { value: "competitor", label: "They choose a competitor" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  {
    id: "objection", category: "T", text: "What do prospects push back on most?",
    options: [
      { value: "price", label: "Price" }, { value: "timing", label: "Timing" }, { value: "trust", label: "Trust or proof" },
      { value: "competitor", label: "They are comparing competitors" }, { value: "unsure", label: "Not sure" },
    ],
  },
  { id: "crm", category: "S2", text: "Do you use a CRM, a system that keeps track of every lead?", options: YES_NO },
  {
    id: "crm_all", category: "S2", text: "Does it capture every inbound lead automatically?", options: YES_NO,
    showIf: { id: "crm", value: "yes" },
  },
  {
    id: "email", category: "S2", text: "How do you follow up with leads by email?",
    options: [
      { value: "automated", label: "Automated email sequences" }, { value: "manual", label: "Manually, one at a time" },
      { value: "none", label: "We don't" },
    ],
  },
  { id: "sms", category: "S2", text: "Do you follow up by text message?", options: YES_NO },
  { id: "quiet", category: "S2", text: "Do leads that go quiet get followed up automatically?", options: YES_NO },
  { id: "segmented", category: "S2", text: "Do different kinds of leads get different follow-up?", options: YES_NO },
];

export type FollowUpAnswers = Record<string, string>;

/** The questions this particular set of answers makes visible, in order. */
export function visibleQuestions(answers: FollowUpAnswers): FollowUpQuestion[] {
  return FOLLOW_UP_QUESTIONS.filter((q) => !q.showIf || answers[q.showIf.id] === q.showIf.value);
}

export type Validation = { ok: true; answers: FollowUpAnswers } | { ok: false; error: string };

/** Strict: every visible question answered with one of its own options; nothing else accepted. */
export function validateAnswers(input: unknown): Validation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Answers are required." };
  const raw = input as Record<string, unknown>;
  const known = new Set(FOLLOW_UP_QUESTIONS.map((q) => q.id));
  for (const key of Object.keys(raw)) if (!known.has(key)) return { ok: false, error: `Unknown question: ${key.slice(0, 40)}` };

  const clean: FollowUpAnswers = {};
  for (const q of visibleQuestions(raw as FollowUpAnswers)) {
    const v = raw[q.id];
    if (typeof v !== "string" || !q.options.some((o) => o.value === v)) return { ok: false, error: `Please answer: ${q.text}` };
    clean[q.id] = v;
  }
  return { ok: true, answers: clean };
}

const RESPONSE_TEXT: Record<string, string> = {
  within_15_min: "within 15 minutes", within_1_hour: "within 1 hour", within_4_hours: "within 4 hours",
  same_day: "same day", next_day: "next business day", slower: "more_than_24_hours",
};
const CLOSE_TEXT: Record<string, string | null> = { under_10: "5%", "10_20": "15%", "20_30": "25%", over_30: "35%", unsure: null };

/** Answers -> the field values the Gap Analysis form would hold, so one scoring formula serves both. */
export function answersToFields(a: FollowUpAnswers): Record<string, unknown> {
  const yes = (id: string) => a[id] === "yes";
  const label = (id: string) => FOLLOW_UP_QUESTIONS.find((q) => q.id === id)?.options.find((o) => o.value === a[id])?.label;
  return {
    lead_response_time: RESPONSE_TEXT[a.lead_response] ?? null,
    uses_online_scheduling: yes("booking"),
    close_rate: CLOSE_TEXT[a.close_rate] ?? null,
    where_prospects_lost: a.lost && a.lost !== "unsure" ? label("lost") : null,
    common_objections: a.objection && a.objection !== "unsure" ? label("objection") : null,
    has_crm: yes("crm"),
    // Without a CRM nothing is captured by one; that is an answer, not a skipped question.
    crm_tracks_all_inbound: yes("crm") ? yes("crm_all") : false,
    uses_email_automation: a.email === "automated",
    uses_sms_followups: yes("sms"),
    has_abandoned_followups: yes("quiet"),
    has_segmentation_drip: yes("segmented"),
  };
}

export interface FollowUpScores {
  S2: Pick<SystemScore, "score" | "answered" | "total">;
  T: Pick<SystemScore, "score" | "answered" | "total">;
  version: string;
}

export function scoreFollowUp(answers: FollowUpAnswers): FollowUpScores {
  const card = calculateSystemScorecard(answersToFields(answers));
  const pick = (key: FollowUpCategory) => {
    const c = card.scores.find((s) => s.category === key)!;
    return { score: c.score, answered: c.answered, total: c.total };
  };
  return { S2: pick("S2"), T: pick("T"), version: GAP_SCORE_VERSION };
}

/** Overall over all six SYSTEM categories: the four measured by the scan plus the two just answered. */
export function fullOverallScore(
  scan: { seo: number; technical: number; conversion: number; engagement: number; metrics: number },
  followUp: Pick<FollowUpScores, "S2" | "T">,
): number {
  const searchVisibility = Math.round((scan.seo + scan.technical) / 2);
  const six = [searchVisibility, scan.conversion, scan.engagement, scan.metrics, followUp.S2.score, followUp.T.score];
  return Math.round(six.reduce((a, b) => a + b, 0) / six.length);
}
