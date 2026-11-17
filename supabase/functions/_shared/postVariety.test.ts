import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  POST_FORMATS, collectRecentOpenings, isStockOpener, openingCollision, openingOf, pickFormat, shouldMentionSeason, varietyBlock,
} from "./postVariety.ts";
import { IMAGE_STYLES, pickImageStyle } from "./creativeImagePrompt.ts";

Deno.test("pickFormat: never repeats until the platform's formats are exhausted", () => {
  const used: string[] = [];
  const n = POST_FORMATS.filter((f) => !f.not?.includes("linkedin")).length;
  for (let i = 0; i < n; i++) used.unshift(pickFormat("linkedin", used, i).id);
  assertEquals(new Set(used).size, n);
});

Deno.test("pickFormat: tweets never get long-form shapes", () => {
  const used: string[] = [];
  for (let i = 0; i < 30; i++) {
    const f = pickFormat("twitter", used, i);
    assert(!f.not?.includes("twitter"));
    used.unshift(f.id);
  }
});

Deno.test("pickFormat: picks the longest-unused format", () => {
  const all = POST_FORMATS.filter((f) => !f.not?.includes("facebook")).map((f) => f.id);
  const recent = all.slice(1).reverse(); // everything but all[0] used; all[0] never
  assertEquals(pickFormat("facebook", recent).id, all[0]);
});

Deno.test("openingOf: first sentence, trimmed", () => {
  assertEquals(openingOf("Most coaches skip the debrief. Here is why.\nMore text"), "Most coaches skip the debrief.");
  assertEquals(openingOf(""), "");
});

Deno.test("isStockOpener: catches the reflex openers seen in live data", () => {
  for (const o of [
    "Trusted by independent coaches and consultants worldwide, Innermetrix delivers reliable assessments.",
    "Many coaches and consultants struggle to uncover the deeper attributes",
    "Ever wondered how a single assessment can reveal hidden strengths?",
    "Unlock the hidden strengths within your teams",
    "As the leaves turn and we settle into this season of reflection",
    "In today's fast-paced business landscape, agility matters",
    "It's the perfect time to refresh your coaching toolkit",
  ]) assert(isStockOpener(o), o);
  assertEquals(isStockOpener("The debrief call is where assessments pay off."), false);
});

Deno.test("openingCollision: same first four words, or a stock opener", () => {
  const recent = ["The debrief call is where the value is."];
  assert(openingCollision("The debrief call is overrated. Fight me.", recent));
  assert(openingCollision("Many coaches struggle with follow-up.", []));
  assertEquals(openingCollision("Stop sending the report first.", recent), false);
});

Deno.test("collectRecentOpenings: dedupes, skips placeholders, caps", () => {
  const rows = [
    { content: "Same opener here. More." },
    { content: "same opener here! different tail" },
    { content: "[Auto-generated placeholder] x" },
    { content: "Another one entirely." },
  ];
  assertEquals(collectRecentOpenings(rows, 8), ["Same opener here.", "Another one entirely."]);
  assertEquals(collectRecentOpenings(rows, 1).length, 1);
});

Deno.test("shouldMentionSeason: one in four", () => {
  assertEquals([0, 1, 2, 3, 4].map(shouldMentionSeason), [true, false, false, false, true]);
});

Deno.test("varietyBlock: carries format, brief and recent openers", () => {
  const b = varietyBlock({
    format: POST_FORMATS[0],
    recentOpenings: ["Opener one."],
    brief: { angle: "why the debrief matters", hook: "Start with the awkward silence" },
  });
  assert(b.includes("why the debrief matters"));
  assert(b.includes(POST_FORMATS[0].label));
  assert(b.includes("Opener one."));
});

Deno.test("pickImageStyle: default pool is photographic only", () => {
  const post = { content: "x", platform: "instagram" };
  const used: string[] = [];
  for (let i = 0; i < 20; i++) {
    const st = pickImageStyle({ ...post, content: `x${i}` }, undefined, used);
    assert(st.photo, st.id);
    used.unshift(st.id);
  }
});

Deno.test("pickImageStyle: rotates through every photo style before repeating", () => {
  const photo = IMAGE_STYLES.filter((s) => s.photo);
  const used: string[] = [];
  for (let i = 0; i < photo.length; i++) used.unshift(pickImageStyle({ content: `p${i}`, platform: "instagram" }, undefined, used).id);
  assertEquals(new Set(used).size, photo.length);
});

Deno.test("pickImageStyle: client opt-in still allows illustration", () => {
  const st = pickImageStyle({ content: "x", platform: "instagram" }, { image_styles: ["paper_collage"] }, []);
  assertEquals(st.id, "paper_collage");
  assertNotEquals(st.photo, true);
});
