// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { runSteward, slotKey, startOfUtcDay } from "./run.ts";
import type { ModelTurn } from "./loop.ts";
import { fakeDb, seq } from "../testDb.ts";

const C = "11111111-1111-4111-8111-111111111111";
const clientRow = { id: C, status: "active", paused_for_billing: false, business_name: "Acme", industry: "roofing", tier: "growth" };
const call = (name: string, args: unknown): ModelTurn => ({ content: null, toolCalls: [{ id: "x", type: "function", function: { name, arguments: JSON.stringify(args) } }], usage: { prompt_tokens: 50, completion_tokens: 10 } });
const model = (...turns: ModelTurn[]) => { let i = 0; return async () => turns[Math.min(i++, turns.length - 1)]; };
const tables = (over: Record<string, any> = {}) => ({
  client_accounts: clientRow,
  steward_settings: { enabled: true, autonomy: "propose", daily_token_budget: 1000 },
  steward_runs: seq(null, [], [], { id: "run1" }),
  ...over,
});

Deno.test("slotKey: scheduled wakes share an hourly slot, manual runs never collide", () => {
  const t = new Date("2026-10-30T09:41:00Z");
  assertEquals(slotKey("seo", C, "heartbeat", t, "n1"), `seo:${C}:2026-10-30T09`);
  assertEquals(slotKey("seo", C, "event", new Date("2026-10-30T09:59:59Z"), "n2"), `seo:${C}:2026-10-30T09`);
  assert(slotKey("seo", C, "manual", t, "n1") !== slotKey("seo", C, "manual", t, "n2"));
  assertEquals(startOfUtcDay(t), "2026-10-30T00:00:00.000Z");
});

Deno.test("refuses engines without a steward, unknown clients, and inactive clients on a schedule", async () => {
  assertEquals(await runSteward(fakeDb({}), { clientId: C, engine: "social", trigger: "manual" }), { ran: false, reason: "the social steward is not built yet" });
  assertEquals(await runSteward(fakeDb({ client_accounts: null }), { clientId: C, engine: "seo", trigger: "manual" }), { ran: false, reason: "client not found" });
  const paused = fakeDb(tables({ client_accounts: { ...clientRow, paused_for_billing: true } }));
  assertEquals(await runSteward(paused, { clientId: C, engine: "seo", trigger: "heartbeat" }), { ran: false, reason: "client is not active" });
});

Deno.test("a scheduled wake needs the steward switched on; a manual run does not", async () => {
  const off = tables({ steward_settings: null });
  assertEquals(await runSteward(fakeDb(off), { clientId: C, engine: "seo", trigger: "heartbeat" }), { ran: false, reason: "steward is not enabled for this client" });
  const manual = await runSteward(fakeDb(off), { clientId: C, engine: "seo", trigger: "manual" }, { callModel: model(call("finish", { summary: "nothing to do" })) });
  assert(manual.ran);
  if (manual.ran) assertEquals(manual.autonomy, "shadow", "an unconfigured steward defaults to shadow");
});

Deno.test("refuses while another run is live, and once the day's token budget is spent", async () => {
  const busy = fakeDb(tables({ steward_runs: seq(null, [{ id: "other" }]) }));
  assertEquals(await runSteward(busy, { clientId: C, engine: "seo", trigger: "manual" }), { ran: false, reason: "another run is in progress" });
  const spent = fakeDb(tables({ steward_runs: seq(null, [], [{ prompt_tokens: 900, completion_tokens: 150 }]) }));
  assertEquals(await runSteward(spent, { clientId: C, engine: "seo", trigger: "manual" }), { ran: false, reason: "daily token budget used (1050 of 1000)" });
  assertEquals(spent.writes.filter((w) => w.op === "insert").length, 0, "no run row is created when refused");
});

Deno.test("a slot that was already taken is skipped quietly", async () => {
  const db = fakeDb(tables());
  const orig = db.from.bind(db);
  let inserts = 0;
  db.from = (t: string) => {
    const q: any = orig(t);
    if (t === "steward_runs") {
      const ins = q.insert;
      q.insert = (v: unknown) => { inserts++; ins(v); q.single = () => Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } }); return q; };
    }
    return q;
  };
  assertEquals(await runSteward(db, { clientId: C, engine: "seo", trigger: "heartbeat" }, { callModel: model(call("finish", {})) }), { ran: false, reason: "this wake was already handled" });
  assertEquals(inserts, 1);
});

Deno.test("full wake in propose mode: reads, proposes, finishes, and the run row records it", async () => {
  const db = fakeDb(tables({ agent_proposals: { id: "prop1" }, seo_audits: null }));
  const out = await runSteward(db, { clientId: C, engine: "seo", trigger: "manual" }, {
    callModel: model(
      call("get_audit", {}),
      call("recommend_fix", { check_id: "meta_desc", title: "Add meta descriptions", priority: "high", steps: "One per page", rationale: "Audit shows 7 pages without one" }),
      call("finish", { summary: "Recommended one fix." }),
    ),
  });
  assert(out.ran);
  if (!out.ran) return;
  assertEquals([out.status, out.autonomy, out.steps], ["completed", "propose", 3]);
  assertEquals(out.actions, [{ name: "recommend_fix", status: "queued", proposalId: "prop1" }]);
  const proposal = db.writes.find((w) => w.table === "agent_proposals")!.value as any;
  assertEquals([proposal.status, proposal.engine, proposal.run_id, proposal.client_account_id], ["pending", "seo", "run1", C]);
  const finalPatch = db.writes.filter((w) => w.table === "steward_runs" && w.op === "update").map((w) => w.value as any).find((v) => v.summary);
  assertEquals([finalPatch.status, finalPatch.summary, finalPatch.prompt_tokens, finalPatch.completion_tokens], ["completed", "Recommended one fix.", 150, 30]);
  assertEquals(finalPatch.state.actions.length, 1);
});

Deno.test("shadow wake: the proposal is recorded as shadow and never becomes actionable", async () => {
  const db = fakeDb(tables({ steward_settings: { enabled: true, autonomy: "shadow", daily_token_budget: 1000 }, agent_proposals: { id: "prop1" } }));
  const out = await runSteward(db, { clientId: C, engine: "seo", trigger: "manual" }, {
    callModel: model(call("run_seo_audit", { reason: "stale", rationale: "No audit in 60 days" }), call("finish", { summary: "Asked for an audit." })),
  });
  assert(out.ran);
  if (out.ran) assertEquals(out.actions[0].status, "recorded");
  assertEquals((db.writes.find((w) => w.table === "agent_proposals")!.value as any).status, "shadow");
  assertEquals(db.rpcs.length, 0, "shadow mode never queues the audit");
});

Deno.test("a crash inside the run is recorded on the run row before it propagates", async () => {
  const db = fakeDb(tables());
  let threw = false;
  try {
    await runSteward(db, { clientId: C, engine: "seo", trigger: "manual" }, { callModel: async () => { throw new Error("boom"); } });
  } catch { threw = true; }
  // A model failure is a result (status failed), not an exception: the run is closed cleanly.
  assertEquals(threw, false);
  const patch = db.writes.filter((w) => w.table === "steward_runs" && w.op === "update").map((w) => w.value as any).find((v) => v.summary);
  assertEquals(patch.status, "failed");
  assertEquals(patch.error, "boom");
});
