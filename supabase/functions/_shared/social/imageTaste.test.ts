import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { mergeCapped } from "./imageTaste.ts";

Deno.test("mergeCapped adds new entries, ignores case-insensitive duplicates and blanks", () => {
  assertEquals(mergeCapped(["people in suits"], ["People In Suits", "  ", "dark lighting"], 10), ["people in suits", "dark lighting"]);
});

Deno.test("mergeCapped drops the oldest entries over the cap and tolerates a bad existing value", () => {
  assertEquals(mergeCapped(["a", "b", "c"], ["d", "e"], 3), ["c", "d", "e"]);
  assertEquals(mergeCapped(undefined, ["x"], 3), ["x"]);
  assertEquals(mergeCapped("oops", ["x"], 3), ["x"]);
});
