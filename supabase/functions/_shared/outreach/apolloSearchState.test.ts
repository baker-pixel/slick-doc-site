import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  applyOutcome,
  buildExcludeList,
  EXHAUSTED_AFTER_EMPTY_RUNS,
  EXHAUSTION_COOLDOWN_DAYS,
  isResting,
  searchKey,
  toBareDomain,
} from "./apolloSearchState.ts";

const base = { client_id: "c1", search_key: "k", label: "tag" };
const T0 = new Date("2026-11-24T09:00:00Z");

Deno.test("toBareDomain strips scheme, www, path, case", () => {
  assertEquals(toBareDomain("http://www.Perkbox.com/uk/"), "perkbox.com");
  assertEquals(toBareDomain("encamina.com"), "encamina.com");
  assertEquals(toBareDomain("https://sub.example.co.uk/a?b=1"), "sub.example.co.uk");
});

Deno.test("toBareDomain returns empty for unusable input", () => {
  assertEquals(toBareDomain(""), "");
  assertEquals(toBareDomain(null), "");
  assertEquals(toBareDomain(undefined), "");
  assertEquals(toBareDomain("not a url"), "");
  assertEquals(toBareDomain("localhost"), "");
});

Deno.test("buildExcludeList dedupes, drops junk, keeps order and honours the cap", () => {
  const list = buildExcludeList(["http://www.a.com", "https://a.com/x", "", null, "b.com", "c.com"]);
  assertEquals(list, ["a.com", "b.com", "c.com"]);
  assertEquals(buildExcludeList(["a.com", "b.com", "c.com"], 2), ["a.com", "b.com"]);
});

Deno.test("searchKey is stable and ignores tag order/case/duplicates", async () => {
  const a = await searchKey(["Team Development", "hr analytics"], "Global", "50,1000");
  const b = await searchKey(["hr analytics", "team development", "HR Analytics"], " global ", "50,1000");
  assertEquals(a, b);
  assertEquals(a.length, 64);
});

Deno.test("searchKey differs when tags, location or size differ", async () => {
  const a = await searchKey(["x"], "global", "50,1000");
  assertNotEquals(a, await searchKey(["y"], "global", "50,1000"));
  assertNotEquals(a, await searchKey(["x"], "texas", "50,1000"));
  assertNotEquals(a, await searchKey(["x"], "global", "1,100"));
  assertNotEquals(a, await searchKey(["x"], "global"));
});

Deno.test("a search with fresh companies is never rested and resets the streak", () => {
  const dry = applyOutcome(undefined, base, { found: 10, fresh: 0 }, T0);
  assertEquals(dry.consecutive_empty, 1);
  const fresh = applyOutcome(dry, base, { found: 12, fresh: 3 }, T0);
  assertEquals(fresh.consecutive_empty, 0);
  assertEquals(fresh.exhausted_until, null);
  assertEquals(fresh.total_fresh, 3);
  assertEquals(fresh.runs, 2);
});

Deno.test("empty runs in a row start a cooldown, then the streak restarts", () => {
  let row = applyOutcome(undefined, base, { found: 5, fresh: 0 }, T0);
  assert(!isResting(row, T0));
  for (let i = 1; i < EXHAUSTED_AFTER_EMPTY_RUNS; i++) row = applyOutcome(row, base, { found: 0, fresh: 0 }, T0);
  assert(row.exhausted_until !== null);
  assert(isResting(row, T0));
  assertEquals(row.consecutive_empty, 0);
  const expected = T0.getTime() + EXHAUSTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  assertEquals(new Date(row.exhausted_until!).getTime(), expected);
});

Deno.test("a rested search is tried again once the cooldown passes", () => {
  const row = { exhausted_until: new Date(T0.getTime() + 1000).toISOString() };
  assert(isResting(row, T0));
  assert(!isResting(row, new Date(T0.getTime() + 2000)));
  assert(!isResting(undefined, T0));
  assert(!isResting({ exhausted_until: null }, T0));
});

Deno.test("counters accumulate across runs", () => {
  let row = applyOutcome(undefined, base, { found: 10, fresh: 4 }, T0);
  row = applyOutcome(row, base, { found: 6, fresh: 2 }, T0);
  assertEquals([row.runs, row.total_found, row.total_fresh, row.last_found, row.last_fresh], [2, 16, 6, 6, 2]);
});
