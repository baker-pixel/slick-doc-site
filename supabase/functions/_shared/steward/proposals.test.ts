// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { decideProposal, runProposal, submitAction } from "./proposals.ts";
import { findAction } from "./actions.ts";
import { fakeDb, seq } from "../testDb.ts";

const C = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const fix = findAction("recommend_fix")!;
const request = findAction("request_content_support")!;
const audit = findAction("run_seo_audit")!;
const fixArgs = { check_id: "meta_desc", title: "Add meta descriptions", priority: "high", steps: "Write one per page" };
const input = (action: any, args: any, autonomy: any) => ({ runId: "r1", clientId: C, action, args, rationale: "because", autonomy });
const statusOf = (db: any) => db.writes.filter((w: any) => w.table === "agent_proposals").map((w: any) => w.value.status ?? w.value);

Deno.test("shadow: recorded with status shadow, nothing executes", async () => {
  const db = fakeDb({ agent_proposals: { id: "p1" } });
  const r = await submitAction(db, input(request, { topic: "t", why: "w" }, "shadow"));
  assertEquals(r.status, "recorded");
  assertEquals((db.writes[0].value as any).status, "shadow");
  assertEquals(db.writes.filter((w) => w.table === "agent_requests").length, 0);
});

Deno.test("propose: queued as pending, nothing executes", async () => {
  const db = fakeDb({ agent_proposals: { id: "p1" } });
  const r = await submitAction(db, input(request, { topic: "t", why: "w" }, "propose"));
  assertEquals(r.status, "queued");
  assertEquals((db.writes[0].value as any).status, "pending");
  assertEquals(db.writes.filter((w) => w.table === "agent_requests").length, 0);
});

Deno.test("auto_internal: an executable internal action runs and is marked executed", async () => {
  const db = fakeDb({ agent_proposals: seq({ id: "p1" }, [{ id: "p1", client_account_id: C, tool: "request_content_support", args: { topic: "t", why: "w" } }]) });
  const r = await submitAction(db, input(request, { topic: "t", why: "w" }, "auto_internal"));
  assertEquals(r.status, "executed");
  const req = db.writes.find((w) => w.table === "agent_requests")!.value as any;
  assertEquals([req.client_account_id, req.from_engine, req.to_engine, req.kind], [C, "seo", "social", "content_support"]);
  assertEquals(statusOf(db).at(-1), "executed");
});

Deno.test("auto_internal: an advisory action still waits for a person", async () => {
  const db = fakeDb({ agent_proposals: { id: "p1" } });
  assertEquals((await submitAction(db, input(fix, fixArgs, "auto_internal"))).status, "queued");
});

Deno.test("auto-run that fails is marked failed with the reason, not silently dropped", async () => {
  const recent = new Date().toISOString();
  const db = fakeDb({
    agent_proposals: seq({ id: "p1" }, [{ id: "p1", client_account_id: C, tool: "run_seo_audit", args: { reason: "stale" } }]),
    seo_audits: { created_at: recent },
  });
  const r = await submitAction(db, input(audit, { reason: "stale" }, "auto_internal"));
  assertEquals(r.status, "failed");
  assert(r.message.includes("last 6 hours"));
  const failed = db.writes.find((w) => (w.value as any).status === "failed")!.value as any;
  assertEquals(failed.result.error, "an audit already finished in the last 6 hours");
  assertEquals(db.rpcs.length, 0, "no audit was queued");
});

Deno.test("run_seo_audit queues the audit once, keyed to the proposal", async () => {
  const db = fakeDb({
    agent_proposals: seq([{ id: "p9", client_account_id: C, tool: "run_seo_audit", args: { reason: "stale" } }]),
    seo_audits: { created_at: "2020-01-01T00:00:00Z" },
  });
  const out = await runProposal(db, "p9", { decidedBy: "u1" });
  assertEquals(out.ok, true);
  assertEquals(db.rpcs[0], { fn: "agent_jobs_enqueue", args: { msg: { target: "seo-audit", idempotencyKey: "steward:p9", body: { clientId: C } } } });
});

Deno.test("submit rejects arguments that do not fit the action before anything is written", async () => {
  const db = fakeDb({});
  await assertRejects(() => submitAction(db, input(fix, { ...fixArgs, priority: "urgent" }, "propose")), Error, "priority");
  assertEquals(db.writes.length, 0);
});

Deno.test("claim race: a proposal someone else already decided is not executed twice", async () => {
  const db = fakeDb({ agent_proposals: seq([]) });
  const out = await runProposal(db, "p1", { decidedBy: "u1" });
  assertEquals(out, { ok: false, error: "this proposal was already decided" });
  assertEquals(db.rpcs.length, 0);
});

Deno.test("decide approve on an advisory proposal ends approved and executes nothing", async () => {
  const pending = { id: "p1", client_account_id: C, engine: "seo", summary: "Fix", status: "pending", goal_id: null };
  const db = fakeDb({ agent_proposals: seq(pending, [{ id: "p1", client_account_id: C, tool: "recommend_fix", args: fixArgs }]) });
  const out = await decideProposal(db, { proposalId: "p1", decision: "approve", actorUserId: "u1", allowedClientIds: null });
  assertEquals(out, { ok: true, status: "approved" });
  assertEquals(db.rpcs.length, 0);
});

Deno.test("decide: not pending, missing, or another client's proposal all look the same or say why", async () => {
  const done = fakeDb({ agent_proposals: { id: "p1", client_account_id: C, status: "executed" } });
  assertEquals(await decideProposal(done, { proposalId: "p1", decision: "approve", actorUserId: null, allowedClientIds: null }), { ok: false, error: "this proposal is executed, not pending" });
  const missing = fakeDb({ agent_proposals: null });
  assertEquals(await decideProposal(missing, { proposalId: "p1", decision: "reject", actorUserId: null, allowedClientIds: null }), { ok: false, error: "proposal not found" });
  const foreign = fakeDb({ agent_proposals: { id: "p1", client_account_id: OTHER, status: "pending" } });
  assertEquals(await decideProposal(foreign, { proposalId: "p1", decision: "approve", actorUserId: null, allowedClientIds: [C] }), { ok: false, error: "proposal not found" });
  assertEquals(foreign.writes.length, 0);
});

Deno.test("reject with a note becomes memory the steward will read; without a note it does not", async () => {
  const pending = { id: "p1", client_account_id: C, engine: "seo", summary: "Fix: Add meta descriptions", status: "pending", goal_id: "g1" };
  const withNote = fakeDb({ agent_proposals: seq(pending, [{ id: "p1" }]) });
  assertEquals(await decideProposal(withNote, { proposalId: "p1", decision: "reject", note: "Client is replacing the site in November", actorUserId: "u1", allowedClientIds: null }), { ok: true, status: "rejected" });
  const mem = withNote.writes.find((w) => w.table === "agent_memory")!.value as any;
  assertEquals([mem.kind, mem.engine, mem.goal_id], ["observation", "seo", "g1"]);
  assert(mem.content.includes("Client is replacing the site in November"));
  const noNote = fakeDb({ agent_proposals: seq(pending, [{ id: "p1" }]) });
  await decideProposal(noNote, { proposalId: "p1", decision: "reject", actorUserId: "u1", allowedClientIds: null });
  assertEquals(noNote.writes.filter((w) => w.table === "agent_memory").length, 0);
});

Deno.test("reject race: losing the claim reports it and writes no memory", async () => {
  const pending = { id: "p1", client_account_id: C, engine: "seo", summary: "Fix", status: "pending", goal_id: null };
  const db = fakeDb({ agent_proposals: seq(pending, []) });
  assertEquals(await decideProposal(db, { proposalId: "p1", decision: "reject", note: "no", actorUserId: "u1", allowedClientIds: null }), { ok: false, error: "this proposal was already decided" });
  assertEquals(db.writes.filter((w) => w.table === "agent_memory").length, 0);
});
