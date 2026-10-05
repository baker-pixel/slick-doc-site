import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { extractSenderAddress, isAutoReply } from "./clientMailboxPoll.ts";

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
