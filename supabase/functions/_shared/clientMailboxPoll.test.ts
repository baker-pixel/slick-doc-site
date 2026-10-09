import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { buildSnippet, extractSenderAddress, isAutoReply, normalizeMessageId, parseReceivedAt } from "./clientMailboxPoll.ts";

Deno.test("sender address: name+angle, bare, and junk", () => {
  assertEquals(extractSenderAddress('"Prasanna V" <PrasannaV@BNALearning.com>'), "prasannav@bnalearning.com");
  assertEquals(extractSenderAddress("a@b.co"), "a@b.co");
  assertEquals(extractSenderAddress("no address here"), null);
});

Deno.test("auto replies are not human replies", () => {
  assertEquals(isAutoReply("Automatic reply: Quick follow-up", ""), true);
  assertEquals(isAutoReply("Out of Office until Monday", ""), true);
  assertEquals(isAutoReply("Re: Quick follow-up", "auto-replied"), true);
  assertEquals(isAutoReply("Re: Quick follow-up", "no"), false);
  assertEquals(isAutoReply("Re: Boosting Sales Coaching Impact", ""), false);
});

Deno.test("message id: strips angle brackets, falls back to a uid key", () => {
  assertEquals(normalizeMessageId("<abc123@mail.example.com>", "c1", 7), "abc123@mail.example.com");
  assertEquals(normalizeMessageId("raw-id@x.io", "c1", 7), "raw-id@x.io");
  assertEquals(normalizeMessageId("", "c1", 7), "no-message-id:c1:7");
});

Deno.test("received_at: parses RFC 2822, falls back on garbage or empty", () => {
  const fb = new Date("2026-10-07T12:00:00Z");
  assertEquals(parseReceivedAt("Tue, 06 Oct 2026 14:30:00 +0000", fb), "2026-10-06T14:30:00.000Z");
  assertEquals(parseReceivedAt("not a date", fb), "2026-10-07T12:00:00.000Z");
  assertEquals(parseReceivedAt("", fb), "2026-10-07T12:00:00.000Z");
});

Deno.test("snippet: flattens whitespace, truncates, null on empty", () => {
  assertEquals(buildSnippet("Hi\n\n  there"), "Hi there");
  assertEquals(buildSnippet("   "), null);
  assertEquals(buildSnippet(null), null);
  assertEquals(buildSnippet("a".repeat(300), 10), "aaaaaaaaaa…");
});
