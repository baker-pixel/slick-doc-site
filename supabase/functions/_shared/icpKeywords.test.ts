import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { icpForSave, keywordProblem, MAX_KEYWORDS, normalizeKeywords } from "./icpKeywords.ts";

const base = { summary: "Teams buying coaching software", industries: ["HR"], geography: "Global", local: false };

Deno.test("normalizeKeywords: trims, collapses spaces, de-duplicates ignoring case", () => {
  assertEquals(
    normalizeKeywords(["  Executive   coaching firms ", "executive coaching firms", "People analytics software"]),
    ["Executive coaching firms", "People analytics software"],
  );
});

Deno.test("normalizeKeywords: drops too-short, too-long, empty and non-string entries", () => {
  assertEquals(normalizeKeywords(["ai", "", "   ", 5, null, "x".repeat(61), "ok keyword"]), ["ok keyword"]);
  assertEquals(normalizeKeywords(undefined), []);
  assertEquals(normalizeKeywords("not an array"), []);
});

Deno.test("normalizeKeywords: caps the list", () => {
  const many = Array.from({ length: 20 }, (_, i) => `company type ${i}`);
  assertEquals(normalizeKeywords(many).length, MAX_KEYWORDS);
});

Deno.test("keywordProblem: explains why a keyword is rejected", () => {
  assertEquals(keywordProblem("ab")?.includes("at least"), true);
  assertEquals(keywordProblem("x".repeat(70))?.includes("under"), true);
  assertEquals(keywordProblem("leadership development companies"), null);
});

Deno.test("icpForSave: edited keywords are stored and flagged manual", () => {
  const out = icpForSave({ ...base, search_keywords: ["Coaching firms", "coaching firms", "ab"] }, true);
  assertEquals(out.search_keywords, ["Coaching firms"]);
  assertEquals(out.search_keywords_source, "manual");
  assertEquals(out.summary, base.summary);
});

Deno.test("icpForSave: clearing every keyword drops both fields so the AI re-derives", () => {
  const out = icpForSave({ ...base, search_keywords: [], search_keywords_source: "manual" as const }, true);
  assertEquals("search_keywords" in out, false);
  assertEquals("search_keywords_source" in out, false);
});

Deno.test("icpForSave: untouched AI keywords are dropped when the ICP changes (old behaviour)", () => {
  const out = icpForSave({ ...base, search_keywords: ["workplace productivity tools"], search_keywords_source: "ai" as const }, false);
  assertEquals("search_keywords" in out, false);
  const legacy = icpForSave({ ...base, search_keywords: ["workplace productivity tools"] }, false);
  assertEquals("search_keywords" in legacy, false, "keywords cached before the source flag existed count as AI");
});

Deno.test("icpForSave: manual keywords survive an edit to the rest of the ICP", () => {
  const out = icpForSave(
    { ...base, summary: "A rewritten summary", search_keywords: ["Executive coaching firms"], search_keywords_source: "manual" as const },
    false,
  );
  assertEquals(out.search_keywords, ["Executive coaching firms"]);
  assertEquals(out.search_keywords_source, "manual");
  assertEquals(out.summary, "A rewritten summary");
});

Deno.test("icpForSave: leaves unrelated ICP fields untouched and does not mutate its input", () => {
  const input = { ...base, search_keywords: ["Coaching firms"], search_keywords_source: "ai" as const };
  const snapshot = JSON.stringify(input);
  const out = icpForSave(input, false);
  assertEquals(JSON.stringify(input), snapshot);
  assertEquals(out.geography, "Global");
  assertEquals(out.industries, ["HR"]);
});
