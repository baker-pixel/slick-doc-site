import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { callTool, scopeAllows, TOOLS, ToolError, validateArgs, type ToolCtx } from "./stewardTools.ts";
import { fakeDb } from "./testDb.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ctxOf = (db: unknown, scopes: string[], allowed: string[] | null = null): ToolCtx =>
  ({ supabase: db, scopes, allowedClientIds: allowed, actor: { kind: "mcp", userId: "u1" } });

Deno.test("scopeAllows: ladder read < propose < decide", () => {
  assert(scopeAllows(["read"], "read"));
  assert(!scopeAllows(["read"], "propose"));
  assert(scopeAllows(["propose"], "read"));
  assert(scopeAllows(["decide"], "propose"));
  assert(!scopeAllows(["propose"], "decide"));
  assert(!scopeAllows(["bogus"], "read"));
  assert(!scopeAllows([], "read"));
});

Deno.test("validateArgs: required, types, uuid, enum, unknown keys", () => {
  const s = TOOLS.find((t) => t.name === "set_goal")!.inputSchema;
  assertEquals(validateArgs(s, { client_id: A, engine: "seo", objective: "x" }), null);
  assertEquals(validateArgs(s, { engine: "seo", objective: "x" }), 'missing required argument "client_id"');
  assertEquals(validateArgs(s, { client_id: "nope", engine: "seo", objective: "x" }), '"client_id" must be a UUID');
  assertEquals(validateArgs(s, { client_id: A, engine: "tv", objective: "x" }), '"engine" must be one of: seo, social, prospect, reporting');
  assertEquals(validateArgs(s, { client_id: A, engine: "seo", objective: "x", target_value: "80" }), '"target_value" must be a number');
  assertEquals(validateArgs(s, { client_id: A, engine: "seo", objective: "x", due_date: "soon" }), '"due_date" must be a date like 2026-12-31');
  assertEquals(validateArgs(s, { client_id: A, engine: "seo", objective: "x", clientid: A }), 'unknown argument "clientid"');
  assertEquals(validateArgs(s, null), "arguments must be an object");
});

Deno.test("callTool: unknown tool, and a read token cannot call a propose tool", async () => {
  const db = fakeDb({});
  await assertRejects(() => callTool(ctxOf(db, ["read"]), "nope", {}), ToolError, "unknown tool");
  await assertRejects(
    () => callTool(ctxOf(db, ["read"]), "set_goal", { client_id: A, engine: "seo", objective: "x" }),
    ToolError, 'does not have the "propose" scope',
  );
  assertEquals(db.writes.length, 0);
});

Deno.test("callTool: a token limited to client A cannot touch client B, and the error does not reveal B exists", async () => {
  const db = fakeDb({});
  const ctx = ctxOf(db, ["decide"], [A]);
  for (const [name, args] of [
    ["get_client_context", { client_id: B }],
    ["list_goals", { client_id: B }],
    ["set_goal", { client_id: B, engine: "seo", objective: "x" }],
    ["record_memory", { client_id: B, kind: "lesson", content: "x" }],
    ["set_steward_settings", { client_id: B, engine: "seo", enabled: true }],
  ] as const) {
    await assertRejects(() => callTool(ctx, name, args), ToolError, "client not found");
  }
  assertEquals(db.writes.length, 0);
});

Deno.test("update_goal: a goal owned by another client is refused before any write", async () => {
  const db = fakeDb({ client_goals: { id: "g9", client_account_id: B } });
  await assertRejects(() => callTool(ctxOf(db, ["propose"], [A]), "update_goal", { goal_id: "33333333-3333-4333-8333-333333333333", status: "dropped" }), ToolError, "client not found");
  assertEquals(db.writes.length, 0);
});

Deno.test("set_goal: writes the goal stamped with who created it", async () => {
  const db = fakeDb({});
  await callTool(ctxOf(db, ["propose"]), "set_goal", { client_id: A, engine: "seo", objective: "  Raise score  ", metric: "seo_score", target_value: 80 });
  const w = db.writes[0];
  assertEquals(w.table, "client_goals");
  assertEquals((w.value as any).objective, "Raise score");
  assertEquals((w.value as any).created_by, "mcp");
  assertEquals((w.value as any).client_account_id, A);
});

Deno.test("set_steward_settings: auto_publish is not settable through the tool", () => {
  const s = TOOLS.find((t) => t.name === "set_steward_settings")!.inputSchema;
  assertEquals(validateArgs(s, { client_id: A, engine: "seo", autonomy: "auto_publish" }), '"autonomy" must be one of: shadow, propose, auto_internal');
});

Deno.test("list_clients: restricted token only asks for its own clients", async () => {
  const db = fakeDb({ client_accounts: [{ id: A, business_name: "A Co" }] });
  const out: any = await callTool(ctxOf(db, ["read"], [A]), "list_clients", {});
  assertEquals(out.clients.length, 1);
});

Deno.test("every tool has a description and only declares read or internal side effects", () => {
  const names = new Set<string>();
  for (const t of TOOLS) {
    assert(t.description.length > 20, t.name);
    assert(["read", "internal"].includes(t.sideEffect), t.name);
    assert(!names.has(t.name), `duplicate ${t.name}`);
    names.add(t.name);
    if (t.sideEffect === "read") assertEquals(t.scope, "read", `${t.name} reads only, so it needs only read scope`);
  }
});

Deno.test("steward tools: decide needs the decide scope, run needs propose, list needs read", async () => {
  const db = fakeDb({});
  const P = "33333333-3333-4333-8333-333333333333";
  await assertRejects(() => callTool(ctxOf(db, ["propose"]), "decide_proposal", { proposal_id: P, decision: "approve" }), ToolError, '"decide" scope');
  await assertRejects(() => callTool(ctxOf(db, ["read"]), "run_steward", { client_id: A, engine: "seo" }), ToolError, '"propose" scope');
  const out: any = await callTool(ctxOf(db, ["read"]), "list_proposals", {});
  assertEquals(out.proposals, []);
  assertEquals(db.writes.length, 0);
});

Deno.test("steward tools: a token limited to client A cannot run a steward or list proposals for B", async () => {
  const db = fakeDb({});
  const ctx = ctxOf(db, ["decide"], [A]);
  await assertRejects(() => callTool(ctx, "run_steward", { client_id: B, engine: "seo" }), ToolError, "client not found");
  await assertRejects(() => callTool(ctx, "list_proposals", { client_id: B }), ToolError, "client not found");
  assertEquals(db.writes.length, 0);
});

Deno.test("decide_proposal: another client's proposal is reported as not found", async () => {
  const db = fakeDb({ agent_proposals: { id: "p", client_account_id: B, status: "pending" } });
  await assertRejects(
    () => callTool(ctxOf(db, ["decide"], [A]), "decide_proposal", { proposal_id: "33333333-3333-4333-8333-333333333333", decision: "approve" }),
    ToolError, "proposal not found",
  );
  assertEquals(db.writes.length, 0);
});

Deno.test("run_steward: an engine without a steward is explained, not an error", async () => {
  const out: any = await callTool(ctxOf(fakeDb({}), ["propose"]), "run_steward", { client_id: A, engine: "social" });
  assertEquals(out, { ran: false, reason: "the social steward is not built yet" });
});
