import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  checkFrontLoaded, FRONT_LOADED_RULES, frontLoadedRequirements, frontLoadedRetryNote, IN_DEPTH_LABEL,
  isFrontLoadedPlatform, parseFrontLoaded, stripInDepthLabel, wordCount,
} from "./frontLoaded.ts";

const words = (n: number, w = "word") => Array(n).fill(w).join(" ");

const GOOD = `Most small teams lose hours every week chasing invoices by hand. Resonant sends and reconciles them for you, so cash arrives sooner and nobody has to nag. Book a 15-minute demo this week.

Resonant connects to your accounting tool, matches each payment to its invoice and flags the ones that are late. Teams see fewer overdue invoices within the first month.

#invoicing #smallbusiness`;

Deno.test("parseFrontLoaded: splits summary, detail and hashtags", () => {
  const p = parseFrontLoaded(GOOD);
  assertEquals(p.hasLabel, false);
  assertStringIncludes(p.summary, "Book a 15-minute demo");
  assertStringIncludes(p.detail, "matches each payment");
  assertEquals(p.hashtags, "#invoicing #smallbusiness");
});

Deno.test("parseFrontLoaded: accepts label variants", () => {
  for (const label of ["In depth", "In depth:", "IN DEPTH", "In-depth", "**In depth**", "In depth view", "## In depth"]) {
    const p = parseFrontLoaded(`A short complete message here.\n\n${label}\nThe detail.`);
    assertEquals(p.hasLabel, true, label);
    assertEquals(p.detail, "The detail.", label);
  }
});

Deno.test("parseFrontLoaded: an unlabelled post is summary, plus detail when more paragraphs follow", () => {
  const one = parseFrontLoaded("Just one paragraph.\n\n#tag");
  assertEquals(one.summary, "Just one paragraph.");
  assertEquals(one.detail, "");
  assertEquals(one.hasLabel, false);
  const two = parseFrontLoaded("First.\n\nSecond.");
  assertEquals(two.summary, "First.");
  assertEquals(two.detail, "Second.");
});

Deno.test("parseFrontLoaded: 'in depth' inside a sentence is not a label", () => {
  const p = parseFrontLoaded("We look in depth at your numbers and fix what is slow.");
  assertEquals(p.hasLabel, false);
});

Deno.test("checkFrontLoaded: a well-formed post passes on every platform it fits", () => {
  assertEquals(checkFrontLoaded(GOOD, "linkedin"), { ok: true, problems: [] });
  assertEquals(checkFrontLoaded(GOOD, "facebook").ok, true);
});

Deno.test("checkFrontLoaded: the summary is capped per platform", () => {
  const long = `${words(45)}. Book a call.`;
  assertEquals(checkFrontLoaded(long, "linkedin").ok, true);
  const ig = checkFrontLoaded(long, "instagram");
  assertEquals(ig.ok, false);
  assertStringIncludes(ig.problems[0], `at most ${FRONT_LOADED_RULES.instagram.summaryMax}`);
});

Deno.test("checkFrontLoaded: a summary too thin to carry the message fails", () => {
  const r = checkFrontLoaded("Big news soon. Call us.", "linkedin");
  assertEquals(r.ok, false);
  assertStringIncludes(r.problems.join(" "), "at least");
});

Deno.test("checkFrontLoaded: teasers and dangling endings fail", () => {
  const base = `${words(24)}`;
  for (const bad of [`${base} Here's why.`, `${base} Read on to find out.`, `${base} Find out why below`, `${base} The answer is…`, `${base} Here is what happened:`]) {
    const r = checkFrontLoaded(bad, "linkedin");
    assertEquals(r.ok, false, bad);
    assertStringIncludes(r.problems.join(" "), "teaser");
  }
});

Deno.test("checkFrontLoaded: a second paragraph is detail and needs no label", () => {
  const r = checkFrontLoaded(`${words(24)}. Call us today.\n\nExtra detail without a label.`, "linkedin");
  assertEquals(r.ok, true);
});

Deno.test("checkFrontLoaded: a visible 'In depth' label is flagged", () => {
  const r = checkFrontLoaded(`${words(24)}. Call us today.\n\nIn depth\nExtra detail.`, "linkedin");
  assertEquals(r.ok, false);
  assertStringIncludes(r.problems.join(" "), IN_DEPTH_LABEL);
});

Deno.test("stripInDepthLabel: removes the label line, keeps the paragraph break and hashtags", () => {
  const raw = "Summary sentence here.  \n\nIn depth  \nThe detail.\n\n#a #b";
  assertEquals(stripInDepthLabel(raw), "Summary sentence here.\n\nThe detail.\n\n#a #b");
  assertEquals(stripInDepthLabel("**In depth:**\nDetail"), "Detail");
  const clean = "Just a summary.\n\n#a";
  assertEquals(stripInDepthLabel(clean), clean);
});

Deno.test("checkFrontLoaded: the whole post is capped, hashtags excluded", () => {
  const huge = `${words(30)}. Book now.\n\nIn depth\n${words(200)}`;
  const r = checkFrontLoaded(huge, "linkedin");
  assertEquals(r.ok, false);
  assertStringIncludes(r.problems.join(" "), "whole post");
  const withTags = `${words(30)}. Book now.\n\n${"#tag ".repeat(60)}`;
  assertEquals(checkFrontLoaded(withTags, "linkedin").ok, true);
});

Deno.test("checkFrontLoaded: the old 150-250 word LinkedIn shape is now a failure", () => {
  const old = `${words(40)}. Reach out.\n\n${words(150)}.\n\n#a #b #c`;
  assertEquals(checkFrontLoaded(old, "linkedin").ok, false);
});

Deno.test("frontLoadedRequirements: states this platform's numbers and the label", () => {
  const req = frontLoadedRequirements("linkedin");
  assertStringIncludes(req, "20-60 words");
  assertStringIncludes(req, "no heading");
  assertStringIncludes(req, "160 words");
  assertEquals(req.includes("150–250"), false);
  assertStringIncludes(frontLoadedRequirements("instagram"), "8-12 relevant hashtags");
});

Deno.test("frontLoadedRetryNote: carries every problem back to the model", () => {
  const n = frontLoadedRetryNote(["too long", "reads like a teaser"]);
  assertStringIncludes(n, "too long");
  assertStringIncludes(n, "reads like a teaser");
});

Deno.test("isFrontLoadedPlatform / wordCount basics", () => {
  assertEquals(["linkedin", "facebook", "instagram"].every(isFrontLoadedPlatform), true);
  assertEquals(isFrontLoadedPlatform("twitter"), false);
  assertEquals(wordCount("  one  two\nthree "), 3);
  assertEquals(wordCount(""), 0);
});
