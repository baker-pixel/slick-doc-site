import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { cleanGeneratedText, stripInvisible } from "./textSanitize.ts";

Deno.test("strips zero-width chars and non-breaking hyphens", () => {
  assertEquals(stripInvisible("real‑time da​ta"), "real-time data");
});

Deno.test("repairs the real garbled Innermetrix spellings", () => {
  assertEquals(cleanGeneratedText("With Innermetra​x’s engine", "Innermetrix"), "With Innermetrix’s engine");
  assertEquals(cleanGeneratedText("Innermre​x has embedded", "Innermetrix"), "Innermetrix has embedded");
  assertEquals(cleanGeneratedText("Innermetrix is fine", "Innermetrix"), "Innermetrix is fine");
});

Deno.test("does not touch ordinary words or multi-word brands", () => {
  assertEquals(cleanGeneratedText("International metrics matter", "Innermetrix"), "International metrics matter");
  assertEquals(cleanGeneratedText("Orange Doors open", "Orange Door Marketing"), "Orange Doors open");
});
