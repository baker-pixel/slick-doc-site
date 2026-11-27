import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claimSlot } from "./claims.ts";

const rpc = (result: { data?: unknown; error?: { message: string } | null }) => ({
  rpc: (_n: string, _a: unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
});

Deno.test("claimSlot: first caller gets the lease, an overlapping caller does not", async () => {
  assertEquals(await claimSlot(rpc({ data: true }), "s1"), true);
  assertEquals(await claimSlot(rpc({ data: false }), "s1"), false);
});

Deno.test("claimSlot: a database error is raised, not treated as claimed", async () => {
  await assertRejects(() => claimSlot(rpc({ error: { message: "boom" } }), "s1"), Error, "boom");
});

Deno.test("claimSlot passes the id and a ttl to the database", async () => {
  let seen: unknown[] = [];
  await claimSlot({ rpc: (n: string, a: unknown) => { seen = [n, a]; return Promise.resolve({ data: true, error: null }); } }, "slot-9", 5);
  assertEquals(seen, ["claim_content_slot", { p_id: "slot-9", p_ttl: "5 minutes" }]);
});
