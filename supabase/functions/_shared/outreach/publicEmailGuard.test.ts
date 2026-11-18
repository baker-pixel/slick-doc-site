import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanText, EMAIL_RE, escapeHtml } from "./publicEmailGuard.ts";

Deno.test("escapeHtml neutralises markup and quotes", () => {
  assertEquals(escapeHtml(`<img src=x onerror="a">&'`), "&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
  assertEquals(escapeHtml(null), "");
});

Deno.test("cleanText strips CR/LF (header + ICS injection) and caps length", () => {
  assertEquals(cleanText("Jo\r\nBCC: evil@x.com"), "Jo BCC: evil@x.com");
  assertEquals(cleanText("a".repeat(500), 10), "aaaaaaaaaa");
});

Deno.test("email validation", () => {
  for (const ok of ["a@b.co", "first.last+tag@example.com"]) assertEquals(EMAIL_RE.test(ok), true);
  for (const bad of ["", "a@b", "a b@c.com", "<x@y.com>", "a@b.c", 'a"@b.com']) assertEquals(EMAIL_RE.test(bad), false);
});
