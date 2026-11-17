import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stripDashes } from "./ai.ts";

Deno.test("mid-sentence em dash becomes a comma", () => {
  assertEquals(stripDashes("We help you grow — fast."), "We help you grow, fast.");
  assertEquals(stripDashes("grow—fast"), "grow, fast");
});
Deno.test("number ranges keep a hyphen", () => {
  assertEquals(stripDashes("Open 9–5, 10 – 20 posts"), "Open 9-5, 10-20 posts");
});
Deno.test("entities, line starts and JSON strings", () => {
  assertEquals(stripDashes("a &mdash; b"), "a, b");
  assertEquals(stripDashes("— leading\nx — y"), "leading\nx, y");
  assertEquals(stripDashes('{"a":"one — two","b":"— hi"}'), '{"a":"one, two","b":"hi"}');
});
Deno.test("sign-off paragraph survives as a dash marker", () => {
  assertEquals(stripDashes("<p>Body — text</p><p>— Yash</p>"), "<p>Body, text</p><p>- Yash</p>");
});
Deno.test("no dashes: untouched", () => {
  assertEquals(stripDashes("plain-text with hyphen"), "plain-text with hyphen");
});
