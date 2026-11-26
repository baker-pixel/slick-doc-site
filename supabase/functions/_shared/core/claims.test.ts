import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claimSlot, isUniqueViolation } from "./claims.ts";

const rpc = (result: { data?: unknown; error?: { code?: string; message: string } | null }) => ({
  rpc: (_n: string, _a: unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
});

Deno.test("claimSlot: first caller gets the lease, an overlapping caller is told it is taken", async () => {
  assertEquals(await claimSlot(rpc({ data: true }), "s1"), "claimed");
  assertEquals(await claimSlot(rpc({ data: false }), "s1"), "taken");
});

Deno.test("claimSlot: migration not applied yet must not stop all drafting", async () => {
  assertEquals(await claimSlot(rpc({ error: { code: "42883", message: "function does not exist" } }), "s1"), "unavailable");
  assertEquals(await claimSlot(rpc({ error: { code: "PGRST202", message: "not found" } }), "s1"), "unavailable");
});

Deno.test("claimSlot: any other database error is raised, not treated as claimed", async () => {
  await assertRejects(() => claimSlot(rpc({ error: { code: "XX000", message: "boom" } }), "s1"), Error, "boom");
});

Deno.test("claimSlot passes the id and a ttl to the database", async () => {
  let seen: unknown[] = [];
  await claimSlot({ rpc: (n: string, a: unknown) => { seen = [n, a]; return Promise.resolve({ data: true, error: null }); } }, "slot-9", 5);
  assertEquals(seen, ["claim_content_slot", { p_id: "slot-9", p_ttl: "5 minutes" }]);
});

Deno.test("isUniqueViolation: only 23505", () => {
  assertEquals(isUniqueViolation({ code: "23505" }), true);
  assertEquals(isUniqueViolation({ code: "23503" }), false);
  assertEquals(isUniqueViolation(null), false);
});
