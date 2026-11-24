import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { cleanDraftedFacts, validDescription } from "./draftFacts.ts";

const SRC = "We build websites and run Google Ads for restaurants and contractors in East Tennessee. We have been doing this for eight years and we answer every phone call ourselves.";

Deno.test("keeps grounded statements, trims bullets, de-duplicates", () => {
  assertEquals(
    cleanDraftedFacts(["- Builds websites for restaurants and contractors", "Builds websites for restaurants and contractors", "2) Runs Google Ads for local businesses in East Tennessee"], SRC),
    ["Builds websites for restaurants and contractors", "Runs Google Ads for local businesses in East Tennessee"],
  );
});

Deno.test("drops invented claims, buzzwords, exclamations, bad lengths and non-strings", () => {
  const out = cleanDraftedFacts([
    "Delivers award winning enterprise analytics for Fortune 500 companies",
    "Leverages cutting-edge AI to grow your restaurant",
    "Builds websites for restaurants!",
    "short",
    "x".repeat(200),
    42,
    "Has been in business for eight years",
  ], SRC);
  assertEquals(out, ["Has been in business for eight years"]);
});

Deno.test("caps the list and tolerates non-arrays", () => {
  const many = Array.from({ length: 12 }, (_, i) => `Builds websites for restaurants number ${i}`);
  assertEquals(cleanDraftedFacts(many, SRC).length, 6);
  assertEquals(cleanDraftedFacts("nope", SRC), []);
  assertEquals(cleanDraftedFacts(undefined, SRC), []);
});

Deno.test("validDescription needs real content and a sane length", () => {
  assertEquals(validDescription("too short"), false);
  assertEquals(validDescription(SRC), true);
  assertEquals(validDescription("x".repeat(2001)), false);
  assertEquals(validDescription(null), false);
});
