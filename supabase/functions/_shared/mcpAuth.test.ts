// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { authenticateMcp, generateToken, hashToken, TOKEN_PREFIX } from "./mcpAuth.ts";
import { fakeDb } from "./testDb.ts";

const reqWith = (token?: string) => new Request("https://x.test/mcp", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });
const NOW = Date.parse("2026-10-30T12:00:00Z");
const row = (over: Record<string, unknown> = {}) => ({ id: "t1", user_id: "u1", scopes: ["read", "propose"], client_account_ids: null, expires_at: null, revoked_at: null, last_used_at: null, ...over });

Deno.test("generateToken: prefixed, long, unique; hash is stable hex and differs from the token", async () => {
  const a = generateToken(), b = generateToken();
  assert(a.startsWith(TOKEN_PREFIX));
  assert(a.length > 40);
  assertNotEquals(a, b);
  const h = await hashToken(a);
  assertEquals(h, await hashToken(a));
  assert(/^[0-9a-f]{64}$/.test(h));
  assert(!h.includes(a));
});

Deno.test("authenticateMcp: valid token for a current admin yields scopes and client limits", async () => {
  const db = fakeDb({ mcp_tokens: row({ client_account_ids: ["c1"] }), user_roles: { role: "admin" } });
  const p = await authenticateMcp(reqWith("odm_abc"), db, NOW);
  assertEquals(p, { tokenId: "t1", userId: "u1", scopes: ["read", "propose"], allowedClientIds: ["c1"] });
});

Deno.test("authenticateMcp: rejects missing, malformed, unknown, revoked, expired tokens", async () => {
  const admin = { role: "admin" };
  assertEquals(await authenticateMcp(reqWith(), fakeDb({}), NOW), null);
  assertEquals(await authenticateMcp(reqWith("not-our-prefix"), fakeDb({ mcp_tokens: row(), user_roles: admin }), NOW), null);
  assertEquals(await authenticateMcp(reqWith("odm_abc"), fakeDb({ mcp_tokens: null, user_roles: admin }), NOW), null);
  assertEquals(await authenticateMcp(reqWith("odm_abc"), fakeDb({ mcp_tokens: row({ revoked_at: "2026-10-01T00:00:00Z" }), user_roles: admin }), NOW), null);
  assertEquals(await authenticateMcp(reqWith("odm_abc"), fakeDb({ mcp_tokens: row({ expires_at: "2026-10-30T11:59:59Z" }), user_roles: admin }), NOW), null);
});

Deno.test("authenticateMcp: a token dies with its owner's admin role", async () => {
  assertEquals(await authenticateMcp(reqWith("odm_abc"), fakeDb({ mcp_tokens: row(), user_roles: null }), NOW), null);
});

Deno.test("authenticateMcp: last_used_at is written at most once a minute", async () => {
  const stale = fakeDb({ mcp_tokens: row({ last_used_at: "2026-10-30T11:00:00Z" }), user_roles: { role: "admin" } });
  await authenticateMcp(reqWith("odm_abc"), stale, NOW);
  assertEquals(stale.writes.filter((w) => w.op === "update").length, 1);
  const fresh = fakeDb({ mcp_tokens: row({ last_used_at: "2026-10-30T11:59:30Z" }), user_roles: { role: "admin" } });
  await authenticateMcp(reqWith("odm_abc"), fresh, NOW);
  assertEquals(fresh.writes.length, 0);
});
