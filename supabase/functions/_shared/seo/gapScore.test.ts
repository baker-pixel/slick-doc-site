import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  asBool, calculateSystemScorecard, GAP_SCORE_VERSION, meaningful, parseCadence, parseConfidence, parseCount,
  parsePercent, parseResponseMinutes, parseWebsiteAgeYears,
} from "./gapScore.ts";

const NOW = new Date("2026-10-14T00:00:00Z");

Deno.test("response time: what people actually type", () => {
  const cases: Array<[string, number | null]> = [
    ["5 min.", 5], ["Within 5 minutes", 5], ["Under 1 hour", 60], ["1-4 hours", 240], ["within an hour", null],
    ["Same day", 480], ["Next business day", 1440], ["24 hours", 1440], ["2 days", 2880], ["immediately", 1],
    ["a few hours", 180], ["more_than_24_hours", 2000], ["", null], ["whenever", null],
  ];
  for (const [input, want] of cases) {
    // "within an hour" has no digit; documented as unreadable rather than guessed
    assertEquals(parseResponseMinutes(input), want, input);
  }
});

Deno.test("percent: only real percentages, never other numbers with units", () => {
  assertEquals(parsePercent("20%"), 20);
  assertEquals(parsePercent("about 35 %"), 35);
  assertEquals(parsePercent("35"), 35);
  assertEquals(parsePercent("24 hours"), null);
  assertEquals(parsePercent("Not sure"), null);
  assertEquals(parsePercent("250"), null);
});

Deno.test("website age from years, relative phrases and enums", () => {
  assertEquals(parseWebsiteAgeYears("2020", NOW), 6);
  assertEquals(parseWebsiteAgeYears("2026", NOW), 0);
  assertEquals(parseWebsiteAgeYears("2 years ago", NOW), 2);
  assertEquals(parseWebsiteAgeYears("Less than 6 months", NOW), 0.5);
  assertEquals(parseWebsiteAgeYears("6-12 months", NOW), 1);
  assertEquals(parseWebsiteAgeYears("more_than_2_years", NOW), 3);
  assertEquals(parseWebsiteAgeYears("Never had one", NOW), Infinity);
  assertEquals(parseWebsiteAgeYears("not sure", NOW), null);
});

Deno.test("cadence, confidence, counts and non-answers", () => {
  assertEquals(parseCadence("Weekly, Monthly"), "weekly");
  assertEquals(parseCadence("Every month"), "monthly");
  assertEquals(parseCadence("Rarely"), "never");
  assertEquals(parseCadence("sometimes"), null);
  assertEquals(parseConfidence("Very confident"), "high");
  assertEquals(parseConfidence("Not at all"), "low");
  assertEquals(parseConfidence("Not confident"), "low");
  assertEquals(parseConfidence("Somewhat"), "medium");
  assertEquals(parseConfidence("80%"), "high");
  assertEquals(parseCount("1,200"), 1200);
  assertEquals(parseCount("5k"), 5000);
  assertEquals(parseCount("lots"), null);
  assertEquals(meaningful("Not sure"), false);
  assertEquals(meaningful("n/a"), false);
  assertEquals(meaningful("Price and timing"), true);
  assertEquals(asBool("yes"), true);
  assertEquals(asBool(null), null);
});

// The one real submission in production (2026-08-12), which the two old formulas scored differently.
const STRATTO = {
  investing_in_seo: false, ranking_for_keywords: false, tracking_keyword_rankings: false, knows_organic_traffic: false, monthly_organic_traffic: null,
  top_competitors: "neilpatel.com \nslamdot.com \n", running_paid_ads: false, tracks_website_conversions: false, monthly_website_leads: 1,
  website_last_updated: "2020", ads_use_landing_pages: null, uses_email_automation: false, uses_sms_followups: false, has_crm: false,
  crm_tracks_all_inbound: null, has_segmentation_drip: false, has_abandoned_followups: false, lead_response_time: "5 min.", close_rate: "24 hours",
  uses_online_scheduling: true, common_objections: "too expensive", where_prospects_lost: null, asks_for_reviews: false, monthly_new_reviews: null,
  has_reputation_tool: false, emails_past_customers: false, has_loyalty_referral_program: false, has_post_purchase_followup: false,
  repeat_customer_rate: null, uses_google_analytics: false, knows_best_lead_sources: false, kpis_tracked: null, data_accuracy_confidence: null,
  does_ab_testing: false, analytics_review_frequency: null, kpi_tracking_frequency: null,
};

Deno.test("real submission: a 5-minute responder with a 2020 site is scored on substance", () => {
  const sc = calculateSystemScorecard(STRATTO, NOW);
  const by = Object.fromEntries(sc.scores.map((s) => [s.category, s.score]));
  // T: 35 (5 min) + 25 (scheduling) + 10 (objections) of 100; close rate "24 hours" is unreadable, not a 24% win.
  assertEquals(by.T, 70);
  // Y: leads 1 -> 8 of 25; site last updated 2020 -> 0; no conversion tracking; landing pages excluded (no ads). 8/80.
  assertEquals(by.Y, 10);
  assertEquals(by.S2, 0);
  assertEquals(by.E, 0);
  assertEquals(by.M, 0);
  assertEquals(sc.version, GAP_SCORE_VERSION);
  assertEquals(sc.overallScore, Math.round((by.S + by.Y + by.S2 + by.T + by.E + by.M) / 6));
});

Deno.test("typing a value is not the same as doing well", () => {
  const typedButBad = calculateSystemScorecard({ ...STRATTO, lead_response_time: "next week", website_last_updated: "2012" }, NOW);
  const good = calculateSystemScorecard({ ...STRATTO, lead_response_time: "5 min.", website_last_updated: "2026" }, NOW);
  const t = (s: typeof good) => s.scores.find((c) => c.category === "T")!.score;
  const y = (s: typeof good) => s.scores.find((c) => c.category === "Y")!.score;
  assertEquals(t(typedButBad) < t(good), true);
  assertEquals(y(typedButBad) < y(good), true);
});

Deno.test("not-applicable questions don't drag the score down", () => {
  const noAds = calculateSystemScorecard({ running_paid_ads: false, tracks_website_conversions: true, monthly_website_leads: 30, website_last_updated: "2026" }, NOW);
  const yNoAds = noAds.scores.find((c) => c.category === "Y")!;
  assertEquals(yNoAds.score, 100);
  assertEquals(yNoAds.total, 3); // landing-page question excluded
  const ads = calculateSystemScorecard({ running_paid_ads: true, ads_use_landing_pages: false, tracks_website_conversions: true, monthly_website_leads: 30, website_last_updated: "2026" }, NOW);
  assertEquals(ads.scores.find((c) => c.category === "Y")!.score, 80);
});

Deno.test("an empty form scores zero with zero coverage, and a full strong one scores 100", () => {
  const empty = calculateSystemScorecard({}, NOW);
  assertEquals(empty.overallScore, 0);
  assertEquals(empty.coverage, 0);
  const strong = calculateSystemScorecard({
    investing_in_seo: true, ranking_for_keywords: true, tracking_keyword_rankings: true, knows_organic_traffic: true, monthly_organic_traffic: 5000,
    top_competitors: "a.com", running_paid_ads: true, tracks_website_conversions: true, monthly_website_leads: 50, website_last_updated: "2026",
    ads_use_landing_pages: true, uses_email_automation: true, uses_sms_followups: true, has_crm: true, crm_tracks_all_inbound: true,
    has_segmentation_drip: true, has_abandoned_followups: true, lead_response_time: "5 minutes", close_rate: "40%", uses_online_scheduling: true,
    common_objections: "price", where_prospects_lost: "after quote", asks_for_reviews: true, monthly_new_reviews: 12, has_reputation_tool: true,
    emails_past_customers: true, has_loyalty_referral_program: true, has_post_purchase_followup: true, repeat_customer_rate: "45%",
    uses_google_analytics: true, knows_best_lead_sources: true, kpis_tracked: "leads, revenue", data_accuracy_confidence: "Very confident",
    does_ab_testing: true, analytics_review_frequency: "Weekly", kpi_tracking_frequency: "Daily",
  }, NOW);
  assertEquals(strong.overallScore, 100);
  assertEquals(strong.coverage, 100);
});

Deno.test("skipped questions lower coverage so a thin form can be told from a bad business", () => {
  const sc = calculateSystemScorecard({ has_crm: false }, NOW);
  assertEquals(sc.coverage < 10, true);
});

Deno.test("scores are pure: same answers, same result", () => {
  assertEquals(calculateSystemScorecard(STRATTO, NOW), calculateSystemScorecard({ ...STRATTO }, NOW));
});
