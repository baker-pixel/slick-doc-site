import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { verifyRenderedField } from "./renderVerify.ts";

const html = `<html><head>
<title>Best Plumber &amp; Heating | Acme</title>
<meta name="description" content="Fast, fair plumbing in Knoxville.">
<link rel="canonical" href="https://acme.com/plumbing/">
<script type="application/ld+json">{"@type":"LocalBusiness"}</script>
</head><body></body></html>`;

Deno.test("title compares decoded, case and whitespace insensitive", () => {
  assertEquals(verifyRenderedField("meta_title", "best plumber & heating  | acme", html).ok, true);
  const bad = verifyRenderedField("meta_title", "Something else", html);
  assertEquals(bad.ok, false);
  assertEquals(bad.note.includes("Best Plumber"), true);
});

Deno.test("meta description and canonical", () => {
  assertEquals(verifyRenderedField("meta_desc", "Fast, fair plumbing in Knoxville.", html).ok, true);
  assertEquals(verifyRenderedField("meta_desc", "nope", html).ok, false);
  assertEquals(verifyRenderedField("meta_desc", "x", "<html></html>").note, "Live page has no meta description.");
  assertEquals(verifyRenderedField("canonical", "https://acme.com/plumbing", html).ok, true);
});

Deno.test("schema presence, and fields HTML cannot confirm", () => {
  assertEquals(verifyRenderedField("schema_jsonld", "{}", html).ok, true);
  assertEquals(verifyRenderedField("schema_jsonld", "{}", "<html></html>").ok, false);
  assertEquals(verifyRenderedField("alt_text", "a dog", html).ok, null);
  assertEquals(verifyRenderedField("focus_keyword", "plumber", html).ok, null);
});
