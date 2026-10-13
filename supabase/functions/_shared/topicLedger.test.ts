import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { collectRecentTopics, isPlaceholderTitle, pickPillar, topicOf, findRepeatedTopics
} from "./topicLedger.ts";

Deno.test("isPlaceholderTitle: slot labels vs real titles", () => {
  assertEquals(isPlaceholderTitle("LinkedIn Post — Oct 13, 2026"), true);
  assertEquals(isPlaceholderTitle("Instagram Post - Oct 1"), true);
  assertEquals(isPlaceholderTitle("5 signs your roof needs repair"), false);
  assertEquals(isPlaceholderTitle(null), true);
});

Deno.test("topicOf: ledger topic beats title; placeholder with no topic is null", () => {
  assertEquals(topicOf({ title: "LinkedIn Post — Oct 1", metadata: { topic: "Spring gutter care" } }), "Spring gutter care");
  assertEquals(topicOf({ title: "LinkedIn Post — Oct 1", metadata: {} }), null);
  assertEquals(topicOf({ title: "Real title", metadata: null }), "Real title");
});

Deno.test("collectRecentTopics: dedupes case/punctuation-insensitively and caps", () => {
  const rows = [
    { title: "x", metadata: { topic: "Roof Repair Tips!" } },
    { title: "LinkedIn Post — a", metadata: {} },
    { title: "x", metadata: { topic: "roof repair tips" } },
    { title: "x", metadata: { topic: "Gutter cleaning" } },
  ];
  assertEquals(collectRecentTopics(rows), ["Roof Repair Tips!", "Gutter cleaning"]);
  assertEquals(collectRecentTopics(rows, 1), ["Roof Repair Tips!"]);
});

Deno.test("pickPillar: least used wins, ties to earlier, unknown ignored", () => {
  const pillars = ["A", "B", "C"];
  assertEquals(pickPillar(pillars, []), "A");
  assertEquals(pickPillar(pillars, ["A", "A", "B"]), "C");
  assertEquals(pickPillar(pillars, ["A", "B", "C", "A"]), "B");
  assertEquals(pickPillar(pillars, ["Z", null, undefined]), "A");
  assertEquals(pickPillar([], ["A"]), undefined);
});

Deno.test("findRepeatedTopics catches case/punctuation duplicates only", () => {
  const rows = [{ metadata: { topic: "Team Trust!" } }, { metadata: { topic: "team trust" } }, { metadata: { topic: "Hiring" } }];
  assertEquals(findRepeatedTopics(rows), ["Team Trust!"]);
});
