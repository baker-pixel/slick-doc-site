import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { hasUsableAccount } from "./socialStep.ts";

Deno.test("one connected account is enough", () => {
  assertEquals(hasUsableAccount([{ platform: "instagram", is_primary: false }]), true);
});

Deno.test("nothing connected does not count", () => {
  assertEquals(hasUsableAccount([]), false);
});

Deno.test("several pages on one platform with no pick is ambiguous", () => {
  assertEquals(hasUsableAccount([
    { platform: "linkedin", is_primary: false },
    { platform: "linkedin", is_primary: false },
  ]), false);
});

Deno.test("an explicit primary resolves the ambiguity", () => {
  assertEquals(hasUsableAccount([
    { platform: "linkedin", is_primary: true },
    { platform: "linkedin", is_primary: false },
  ]), true);
});

Deno.test("an unambiguous platform counts even if another is ambiguous", () => {
  assertEquals(hasUsableAccount([
    { platform: "linkedin", is_primary: false },
    { platform: "linkedin", is_primary: false },
    { platform: "instagram", is_primary: false },
  ]), true);
});
