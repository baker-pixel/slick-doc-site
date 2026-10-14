import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { answersToFields, FOLLOW_UP_QUESTIONS, fullOverallScore, scoreFollowUp, validateAnswers, visibleQuestions } from "./followUp.ts";

const BEST = {
  lead_response: "within_15_min", booking: "yes", close_rate: "over_30", lost: "after_quote", objection: "price",
  crm: "yes", crm_all: "yes", email: "automated", sms: "yes", quiet: "yes", segmented: "yes",
};
const WORST = {
  lead_response: "slower", booking: "no", close_rate: "under_10", lost: "unsure", objection: "unsure",
  crm: "no", email: "none", sms: "no", quiet: "no", segmented: "no",
};

Deno.test("every question has distinct option values and a category", () => {
  for (const q of FOLLOW_UP_QUESTIONS) {
    assertEquals(new Set(q.options.map((o) => o.value)).size, q.options.length, q.id);
    assertEquals(q.category === "S2" || q.category === "T", true);
  }
});

Deno.test("the CRM follow-up question only appears when there is a CRM", () => {
  assertEquals(visibleQuestions({ crm: "yes" }).some((q) => q.id === "crm_all"), true);
  assertEquals(visibleQuestions({ crm: "no" }).some((q) => q.id === "crm_all"), false);
  assertEquals(visibleQuestions({}).some((q) => q.id === "crm_all"), false);
});

Deno.test("validation is strict: all visible answered, only real options, no unknown keys", () => {
  assertEquals(validateAnswers(BEST).ok, true);
  assertEquals(validateAnswers(WORST).ok, true);
  assertEquals(validateAnswers({ ...BEST, sms: undefined }).ok, false);
  assertEquals(validateAnswers({ ...BEST, sms: "maybe" }).ok, false);
  assertEquals(validateAnswers({ ...BEST, extra: "x" }).ok, false);
  assertEquals(validateAnswers(null).ok, false);
  assertEquals(validateAnswers([]).ok, false);
  // an answer to a hidden question is dropped, not stored
  const r = validateAnswers({ ...WORST, crm_all: "yes" });
  assertEquals(r.ok && "crm_all" in r.answers, false);
});

Deno.test("best answers score 100 on both categories; worst score low but are not 'unanswered'", () => {
  const best = scoreFollowUp(BEST);
  assertEquals([best.S2.score, best.T.score], [100, 100]);
  const worst = scoreFollowUp(WORST);
  assertEquals(worst.S2.score, 0);
  assertEquals(worst.T.score, 4); // only the (poor) close rate earns anything: 4 of 100
  assertEquals(worst.S2.answered, worst.S2.total); // "no" is an answer
});

Deno.test("'Not sure' earns nothing and is counted as unanswered, never guessed", () => {
  const f = answersToFields(WORST);
  assertEquals(f.close_rate, "5%");
  assertEquals(f.where_prospects_lost, null);
  const unsure = scoreFollowUp({ ...BEST, close_rate: "unsure", lost: "unsure" });
  assertEquals(unsure.T.answered < unsure.T.total, true);
  assertEquals(unsure.T.score, 70); // 35 + 25 + 10 of 100: close rate and lost-stage unreadable
});

Deno.test("faster replies score higher", () => {
  const t = (v: string) => scoreFollowUp({ ...BEST, lead_response: v }).T.score;
  assertEquals(t("within_15_min") > t("within_4_hours"), true);
  assertEquals(t("within_4_hours") > t("same_day"), true);
  assertEquals(t("same_day") > t("slower"), true);
});

Deno.test("full overall averages all six categories", () => {
  const scan = { seo: 80, technical: 100, conversion: 60, engagement: 20, metrics: 70 };
  // search 90, conversion 60, engagement 20, metrics 70, S2 100, T 100 -> 440 / 6
  assertEquals(fullOverallScore(scan, scoreFollowUp(BEST)), 73);
});
