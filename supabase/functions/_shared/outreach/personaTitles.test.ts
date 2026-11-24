import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { cachedPersonaTitles, normalizeTitles } from "./personaTitles.ts";

Deno.test("normalizeTitles trims, dedupes case-insensitively, drops junk, caps at 6", () => {
  assertEquals(
    normalizeTitles(["  Head of  People ", "head of people", "x", "", 5, "VP People", "CHRO", "CPO", "Chief People Officer", "Director of L&D", "Extra"]),
    ["Head of People", "VP People", "CHRO", "CPO", "Chief People Officer", "Director of L&D"],
  );
  assertEquals(normalizeTitles("nope"), []);
  assertEquals(normalizeTitles(["x".repeat(51)]), []);
});

Deno.test("cachedPersonaTitles is used only while the persona is unchanged", () => {
  const icp = { buyer_persona: "Head of People", persona_titles: ["Head of People", "VP People"], persona_titles_for: "Head of People" };
  assertEquals(cachedPersonaTitles(icp), ["Head of People", "VP People"]);
  // whitespace/case differences in the persona do not invalidate
  assertEquals(cachedPersonaTitles({ ...icp, buyer_persona: "  head of   people " }), ["Head of People", "VP People"]);
  // an edited persona invalidates the cache so titles re-derive
  assertEquals(cachedPersonaTitles({ ...icp, buyer_persona: "Founder or CEO" }), null);
  // titles with no recorded source persona are not trusted
  assertEquals(cachedPersonaTitles({ buyer_persona: "Head of People", persona_titles: ["VP People"] }), null);
});

Deno.test("cachedPersonaTitles returns null without a persona or titles", () => {
  assertEquals(cachedPersonaTitles(null), null);
  assertEquals(cachedPersonaTitles({ buyer_persona: "", persona_titles: ["A1"], persona_titles_for: "" }), null);
  assertEquals(cachedPersonaTitles({ buyer_persona: "CEO", persona_titles: [], persona_titles_for: "CEO" }), null);
});
