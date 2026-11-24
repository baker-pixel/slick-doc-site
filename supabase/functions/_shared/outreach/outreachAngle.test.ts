import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { cachedAngles, recipientFacts } from "./outreachAngle.ts";

Deno.test("recipientFacts labels only what we hold and flattens it for grounding", () => {
  const f = recipientFacts({
    name: "Vienna Coffee Company",
    city: "Maryville",
    context_profile: { industry: "Coffee Roastery & Retail", services: ["Subscriptions", "Classes"], differentiators: ["Two locations"], business_summary: "" },
  });
  assert(f.lines.includes("- Offers: Subscriptions, Classes"));
  assert(f.lines.includes("- Location: Maryville"));
  assert(!f.lines.includes("Summary"));
  assert(f.flat.includes("Two locations"));
});

Deno.test("recipientFacts falls back to the lead's own columns and top weaknesses", () => {
  const f = recipientFacts({ name: "Acme", business_type: "dentist", top_weaknesses: ["no online booking"] });
  assert(f.lines.includes("- Type: dentist"));
  assert(f.lines.includes("- Known gaps: no online booking"));
});

Deno.test("cachedAngles reads saved angles, the older single angle, and ignores malformed ones", () => {
  const one = { observation: "o", question: "q?" };
  assertEquals(cachedAngles({ name: "A", research_snapshot: { outreach_angles: [one, { ...one, question: "q2?" }] } }).length, 2);
  assertEquals(cachedAngles({ name: "A", research_snapshot: { outreach_angle: { ...one, at: "x" } } }), [one]);
  assertEquals(cachedAngles({ name: "A", research_snapshot: { outreach_angles: [{ observation: 1 }, null, one] } }), [one]);
  assertEquals(cachedAngles({ name: "A", research_snapshot: {} }), []);
  assertEquals(cachedAngles({ name: "A" }), []);
  assertEquals(cachedAngles({ name: "A", research_snapshot: { outreach_angles: [one, one, one, one, one] } }).length, 3);
});
