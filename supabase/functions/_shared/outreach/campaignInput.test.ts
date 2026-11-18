import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { validateCampaignInput } from "./campaignInput.ts";

const err = (raw: unknown) => {
  const r = validateCampaignInput(raw);
  assert(!r.ok, "expected failure");
  return (r as { error: string }).error;
};

Deno.test("campaign input: minimal cold campaign gets defaults", () => {
  const r = validateCampaignInput({ name: "  Spring   list " });
  assert(r.ok);
  assertEquals(r.value, { name: "Spring list", topic: null, topic_details: null, audience: "cold", max_steps: 3 });
});

Deno.test("campaign input: existing contacts default to 2 emails and require a topic", () => {
  assertEquals(err({ name: "x", audience: "existing" }).includes("what the email is about"), true);
  const r = validateCampaignInput({ name: "x", audience: "existing", topic: "New dashboard" });
  assert(r.ok);
  assertEquals(r.value.max_steps, 2);
});

Deno.test("campaign input: name, topic, details and steps are bounded", () => {
  assert(err({}).includes("name"));
  assert(err({ name: "x".repeat(121) }).includes("too long"));
  assert(err({ name: "x", topic: "t".repeat(201) }).includes("Topic"));
  assert(err({ name: "x", topic_details: "d".repeat(2001) }).includes("Details"));
  for (const bad of [0, 5, 1.5, "abc"]) assert(err({ name: "x", max_steps: bad }).includes("between 1 and 4"), String(bad));
  assert(validateCampaignInput({ name: "x", max_steps: "4" }).ok);
});

Deno.test("campaign input: unknown audience is rejected, details keep line breaks", () => {
  assert(err({ name: "x", audience: "vip" }).includes("Audience"));
  const r = validateCampaignInput({ name: "x", topic_details: "line1\nline2 " });
  assert(r.ok);
  assertEquals(r.value.topic_details, "line1\nline2");
});

Deno.test("campaign input: non-object input is a clean error, not a throw", () => {
  assert(err(null).includes("name"));
  assert(err("nope").includes("name"));
});
