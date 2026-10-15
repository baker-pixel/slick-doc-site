import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { LIMITS, buildCopyPrompt, buildCopySystem, checkDraft, cleanDraft, fitToLength, similarity, tooSimilar } from "./seoCopy.ts";
import { contentSample, parseOnPage } from "./seoSignals.ts";

// Real drafts from the Innermetrix audit that all said the same thing, plus two page-specific ones.
const REPEATS = [
  "Innermetrix offers a cloud-based assessment platform tailored for coaches and consultants delivering leadership and talent development services.",
  "Empower your coaching practice with Innermetrix’s cloud-based assessment platform designed for leadership and talent development consultants.",
  "Empower your coaching business with Innermetrix's cloud-based assessment tools designed for leadership and talent development consultants.",
  "Empower your coaching and consulting with Innermetrix’s cloud-based assessment platform, designed to enhance leadership and talent development outcomes.",
];
const SPECIFIC = [
  "Choose between an LLC, S-corp or sole proprietorship for your coaching practice, with the tax and liability trade-offs explained in plain terms.",
  "Learn how to work out your true hourly base rate from your target income, billable hours and overhead before you quote a client.",
];

Deno.test("the repetitive Innermetrix drafts are flagged, page-specific ones are not", () => {
  const flagged = tooSimilar(REPEATS).map((h) => h.length > 0);
  assertEquals(flagged, [false, true, true, true]); // first stays; each later copy is redone
  assertEquals(tooSimilar(SPECIFIC).map((h) => h.length), [0, 0]);
  assertEquals(similarity(SPECIFIC[0], SPECIFIC[1]) < 0.1, true);
});

Deno.test("a draft is also compared with what other pages already have, but never with its own page", () => {
  const draft = REPEATS[1];
  assertEquals(tooSimilar([draft], [REPEATS[2]])[0].length, 1);
  assertEquals(tooSimilar([draft], (i) => (i === 0 ? [] : [REPEATS[2]]))[0].length, 0);
});

Deno.test("checkDraft enforces the limits, hype words and refusals", () => {
  const ok = "Learn how to work out your true hourly base rate from your target income, billable hours and overhead before you quote a client.";
  assertEquals(checkDraft("meta", ok), { ok: true });
  assertEquals(checkDraft("meta", "Too short."), { ok: false, reason: "it was only 10 characters; the meta description must be at least 120" });
  assertEquals(checkDraft("meta", ok.repeat(2)).ok, false);
  assertEquals(checkDraft("title", "Unlock Your Coaching Potential With Our Platform").ok, false);
  assertEquals(checkDraft("meta", "As an AI I cannot write that, but " + ok).ok, false);
  assertEquals(checkDraft("title", "Consulting Business Structures Explained | Innermetrix"), { ok: true });
  assertEquals(checkDraft("meta", ""), { ok: false, reason: "it was empty" });
});

Deno.test("cleanDraft removes labels, quotes and markdown", () => {
  assertEquals(cleanDraft('Meta description: "**Plain** text here."'), "Plain text here.");
  assertEquals(cleanDraft("  “Title: Hello” \n"), "Hello");
});

Deno.test("fitToLength cuts at a sentence or a word, never mid-word, and never over the limit", () => {
  const long = "Our guide explains how to set a base rate. It covers income targets, billable hours and overhead in detail so you can quote with confidence and never undercharge a client again.";
  const m = fitToLength("meta", long);
  assertEquals(m.length <= LIMITS.meta.max, true);
  assertEquals(m.endsWith("rate.") || /\w$/.test(m), true);
  const t = fitToLength("title", "Consulting Business Structures Explained For Independent Coaches | Innermetrix");
  assertEquals(t.length <= 60, true);
  assertEquals(t.endsWith("|"), false);
  assertEquals(fitToLength("title", "Short title"), "Short title");
});

Deno.test("the prompt carries the page's own topic, the do-not-resemble list and any retry feedback", () => {
  const ctx = { business: "Innermetrix", tone: "plain", idealCustomer: "coaches", url: "https://a.test/rate", currentTitle: "Rate", currentMeta: "",
    h1: "Determining Your True Hourly Base Rate", content: "Work out billable hours.", avoid: ["Empower your coaching practice"], feedback: "it was 190 characters" };
  const p = buildCopyPrompt("meta", ctx);
  assertStringIncludes(p, "Determining Your True Hourly Base Rate");
  assertStringIncludes(p, "Empower your coaching practice");
  assertStringIncludes(p, "it was 190 characters");
  assertStringIncludes(p, "120-158 characters");
  const sys = buildCopySystem("meta", ctx);
  assertStringIncludes(sys, "UNTRUSTED");
  assertStringIncludes(sys, "Never exceed 158");
  assertStringIncludes(buildCopySystem("title", ctx), "| Innermetrix");
});

Deno.test("content sample reads the article, not the site chrome; h1 text is captured", () => {
  const html = `<body><header><h1>Site Logo</h1><nav>Home About Contact Login</nav></header>
    <main><h1>Determining Your True Hourly Base Rate</h1><p>Work out your billable hours first. Don&#8217;t guess.</p></main>
    <footer>Copyright Innermetrix Privacy Terms</footer></body>`;
  const c = contentSample(html);
  assertEquals(c.includes("billable hours"), true);
  assertEquals(c.includes("Don’t guess"), true);
  assertEquals(/Home About|Copyright|Site Logo/.test(c), false);
  assertEquals(parseOnPage(html, "https://a.test/").h1_text, "Site Logo");
});
