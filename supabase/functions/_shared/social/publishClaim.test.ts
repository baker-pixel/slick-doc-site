import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claimForPublish, UNCLAIMABLE_STATUSES } from "./publishClaim.ts";

/** Records the query chain and answers like PostgREST would for the given rows. */
function fakeDb(rowStatus: string) {
  const calls: Array<[string, unknown[]]> = [];
  let blocked = false;
  const chain = {
    update: (...a: unknown[]) => { calls.push(["update", a]); return chain; },
    eq: (...a: unknown[]) => { calls.push(["eq", a]); return chain; },
    not: (...a: unknown[]) => {
      calls.push(["not", a]);
      // emulate: the row matches only if its status is NOT in the excluded list
      const list = String(a[2]).replace(/[()]/g, "").split(",");
      blocked = list.includes(rowStatus);
      return chain;
    },
    select: () => Promise.resolve({ data: blocked ? [] : [{ id: "row" }], error: null }),
  };
  return { db: { from: () => chain }, calls };
}

Deno.test("a published or already-processing row cannot be claimed (no double post)", async () => {
  for (const status of UNCLAIMABLE_STATUSES) {
    const { db } = fakeDb(status);
    assertEquals((await claimForPublish(db, "row")).claimed, false, `status ${status} must not be claimable`);
  }
});

Deno.test("scheduled, draft and failed rows can still be claimed (admin manual publish keeps working)", async () => {
  for (const status of ["scheduled", "draft", "failed"]) {
    const { db } = fakeDb(status);
    assertEquals((await claimForPublish(db, "row")).claimed, true, `status ${status} must be claimable`);
  }
});

Deno.test("the claim filters on the status in the same UPDATE (atomic), by id", async () => {
  const { db, calls } = fakeDb("scheduled");
  await claimForPublish(db, "row-7");
  const names = calls.map((c) => c[0]);
  assertEquals(names, ["update", "eq", "not"]);
  assertEquals(calls[1][1], ["id", "row-7"]);
  assertEquals(calls[2][1], ["status", "in", "(published,processing)"]);
});

Deno.test("a database error is reported, not treated as claimed", async () => {
  const chain = {
    update: () => chain, eq: () => chain, not: () => chain,
    select: () => Promise.resolve({ data: null, error: { message: "boom" } }),
  };
  const r = await claimForPublish({ from: () => chain }, "row");
  assertEquals(r, { claimed: false, error: "boom" });
});
