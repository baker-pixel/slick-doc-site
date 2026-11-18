import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  campaignBlock,
  findOutreachViolations,
  outreachGreeting,
  stepBrief,
  senderFactsBlock,
  toneInstruction,
  wordCount,
} from "./outreachPrompt.ts";

Deno.test("greeting: first.last / first_last addresses give a first name", () => {
  assertEquals(outreachGreeting("emily.kutchinsky@technologyreview.com"), "Hi Emily,");
  assertEquals(outreachGreeting("katie_drummond@wired.com"), "Hi Katie,");
  assertEquals(outreachGreeting("juan-bourgois@jobgether.com"), "Hi Juan,");
  assertEquals(outreachGreeting("Martin.Kornblum@saragossa.io"), "Hi Martin,");
});

Deno.test("greeting: ambiguous or role addresses fall back to 'Hi there,' (never a company name)", () => {
  for (const e of ["haydenb@upwork.com", "presidencia@colombiafintech.co", "info@acme.com", "sales.team@acme.com", "j.smith@x.com", "", null, undefined, "no-at-sign"]) {
    assertEquals(outreachGreeting(e as string | null | undefined), "Hi there,", String(e));
  }
});

Deno.test("greeting: plus-tags are ignored", () => {
  assertEquals(outreachGreeting("anna.lee+cold@x.com"), "Hi Anna,");
});

Deno.test("facts block: verified facts + never_say are included; positioning is marked unverified", () => {
  const block = senderFactsBlock(
    {
      business_summary: "Turns assessment reports into AI coaches.",
      verified_facts: ["Offers AI coaching from uploaded reports"],
      never_say: ["Use for hiring decisions"],
      services: ["API connector"],
      differentiators: ["27 years of research"],
    },
    "Resonant",
  );
  assertStringIncludes(block, "VERIFIED FACTS (the ONLY source");
  assertStringIncludes(block, "Offers AI coaching from uploaded reports");
  assertStringIncludes(block, "NEVER say or imply (client instruction): Use for hiring decisions");
  assertStringIncludes(block, "UNVERIFIED: tone only");
});

Deno.test("facts block: with no verified facts it says so instead of inviting invention", () => {
  const block = senderFactsBlock({ business_summary: "x" }, "Acme");
  assertStringIncludes(block, "VERIFIED FACTS: none provided");
  assert(!block.includes("NEVER say"));
});

Deno.test("facts block: tolerates null / junk context", () => {
  assertStringIncludes(senderFactsBlock(null, "Acme"), "Business name: Acme");
  assertStringIncludes(senderFactsBlock({ verified_facts: "oops", services: [1, null] }, "Acme"), "none provided");
});

Deno.test("tone: known tones map, unknown tones pass through, empty defaults to professional", () => {
  assertStringIncludes(toneInstruction("casual"), "relaxed");
  assertStringIncludes(toneInstruction("quirky"), "quirky");
  assertStringIncludes(toneInstruction(undefined), "professional");
});

const clean = {
  subject: "assessment reports",
  html: "<p>Hi Emily,</p><p>I'm with Resonant. We turn the personality reports you already have into AI coaches your people can chat with.</p><p>Is that something your team would want to see?</p><p>— Baker, Resonant</p>",
};

Deno.test("violations: a plain human draft is clean", () => {
  assertEquals(findOutreachViolations(clean, { greeting: "Hi Emily," }), []);
});

// Regression: the actual drafts that were sitting in Resonant's queue.
Deno.test("violations: catches the real Resonant/Upwork drafts", () => {
  const step1 = {
    subject: "Unlocking deeper insights into Upwork's talent with AI-powered personality coaching",
    html: "<p>Hi Upwork,</p><p>I've been following how Upwork connects diverse talent with businesses globally. Our solution could add another layer of understanding.</p><p>— Resonant</p>",
  };
  const v1 = findOutreachViolations(step1, { greeting: "Hi there," });
  assert(v1.some((v) => v.includes("buzzword")), v1.join("|"));
  assert(v1.some((v) => v.includes("following")), v1.join("|"));
  assert(v1.some((v) => v.includes("must open with")), v1.join("|"));

  const step2 = {
    subject: "Helping Upwork unlock deeper value",
    html: "<p>Hi Upwork,</p><p>We've seen organizations struggle. Businesses like yours have found this approach unlocks deeper engagement.</p><p>— Resonant</p>",
  };
  const v2 = findOutreachViolations(step2, { greeting: "Hi there," });
  assert(v2.some((v) => v.includes("social proof")), v2.join("|"));

  const step3 = {
    subject: "How Resonant Brings Your Existing Assessments to Life",
    html: "<p>Hi there,</p><p>Our done-for-you service includes validation and enrichment.</p><p>— Resonant</p>",
  };
  assert(findOutreachViolations(step3, { greeting: "Hi there," }).some((v) => v.includes("done-for-you")));
});

Deno.test("violations: compliments, dashes, exclamation, placeholders, extra links, long subject", () => {
  const bad = {
    subject: "A very long subject line that goes on: and on forever",
    html: "<p>Hi there,</p><p>I really appreciate your focus on assessments — great work! [Company] <a href='a'>one</a> <a href='b'>two</a></p><p>— Me</p>",
  };
  const v = findOutreachViolations(bad, { greeting: "Hi there," });
  for (const needle of ["compliments", "dashes", "exclamation", "placeholder", "more than one link", "subject"]) {
    assert(v.some((x) => x.includes(needle)), `${needle} missing from ${v.join("|")}`);
  }
});

Deno.test("violations: the sign-off em dash is allowed, body em dash is not", () => {
  assertEquals(findOutreachViolations(clean, { greeting: "Hi Emily," }).filter((v) => v.includes("dash")), []);
});

Deno.test("violations: client never_say phrases are enforced", () => {
  const v = findOutreachViolations(
    { subject: "quick question", html: "<p>Hi there,</p><p>Great for hiring decisions at scale.</p><p>— X</p>" },
    { greeting: "Hi there,", neverSay: ["hiring decisions"] },
  );
  assert(v.some((x) => x.includes("never-say")), v.join("|"));
});

Deno.test("violations: word limit counts the body, not the sign-off", () => {
  const long = `<p>Hi there,</p><p>${"word ".repeat(120)}</p><p>— Me</p>`;
  assert(findOutreachViolations({ subject: "hello again", html: long }, { greeting: "Hi there,", maxWords: 100 }).some((v) => v.includes("longer than")));
  assertEquals(wordCount("<p>one two three</p><p>— Me</p>"), 3);
});

Deno.test("greeting: a first name from an uploaded list wins over the address", () => {
  assertEquals(outreachGreeting("haydenb@upwork.com", "Hayden"), "Hi Hayden,");
  assertEquals(outreachGreeting("info@x.com", "Zoë"), "Hi Zoë,");
  assertEquals(outreachGreeting("anna.lee@x.com", "Ann-Marie"), "Hi Ann-Marie,");
});

Deno.test("greeting: junk first names are ignored (falls back to the address)", () => {
  assertEquals(outreachGreeting("anna.lee@x.com", "A"), "Hi Anna,");
  assertEquals(outreachGreeting("anna.lee@x.com", "<script>"), "Hi Anna,");
  assertEquals(outreachGreeting("info@x.com", "  "), "Hi there,");
  assertEquals(outreachGreeting("info@x.com", null), "Hi there,");
});

Deno.test("step briefs: cold has 4 steps, existing announces instead of introducing", () => {
  for (const n of [1, 2, 3, 4]) assert(stepBrief(n, "cold"), `cold ${n}`);
  assertEquals(stepBrief(5, "cold"), null);
  assertStringIncludes(stepBrief(1, "existing")!.theme, "Do not introduce");
  assert(!stepBrief(1, "cold")!.theme.includes("Do not introduce"));
  assertEquals(stepBrief(1), stepBrief(1, "cold"));
});

Deno.test("campaign block: empty without a topic, otherwise topic + details + audience", () => {
  assertEquals(campaignBlock(null), "");
  assertEquals(campaignBlock({ topic: "  " }), "");
  const b = campaignBlock({ topic: "New dashboard", topic_details: "Shows DISC reports live", audience: "existing" });
  assertStringIncludes(b, "CAMPAIGN TOPIC: New dashboard");
  assertStringIncludes(b, "may be stated as fact): Shows DISC reports live");
  assertStringIncludes(b, "existing customer");
  assert(!campaignBlock({ topic: "x", audience: "cold" }).includes("existing customer"));
});
