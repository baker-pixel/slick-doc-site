// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { runStewardLoop, type ModelTurn, type ReadTool, type StewardDeps } from "./loop.ts";
import { SEO_ACTIONS } from "./actions.ts";

const call = (name: string, args: unknown, id = `${name}-${Math.random()}`): ModelTurn =>
  ({ content: null, toolCalls: [{ id, type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
const finish = (summary = "done") => call("finish", { summary });

/** A model that plays back a script. A script entry may be a function of the requested tool choice. */
function scripted(script: (ModelTurn | ((choice: any) => ModelTurn))[]) {
  const seen: any[] = [];
  let i = 0;
  const callModel: StewardDeps["callModel"] = async (_m, _t, choice) => {
    seen.push(choice);
    const next = script[Math.min(i++, script.length - 1)];
    return typeof next === "function" ? next(choice) : next;
  };
  return { callModel, seen, count: () => i };
}

const submitted: any[] = [];
const deps = (callModel: StewardDeps["callModel"], over: Partial<StewardDeps> = {}): StewardDeps => ({
  callModel, now: () => 0,
  submit: async (action, args, rationale) => { submitted.push({ name: action.name, args, rationale }); return { status: "queued", proposalId: `p${submitted.length}`, message: "ok" }; },
  ...over,
});
const readTool: ReadTool = { name: "get_audit", description: "d", inputSchema: { type: "object", properties: {} }, run: async () => ({ score: 71 }) };
const base = { system: "s", context: "c", task: "t", readTools: [readTool], actions: SEO_ACTIONS };
const goodFix = { check_id: "meta_desc", title: "Add meta descriptions", priority: "high", steps: "Write one per page", rationale: "7 pages lack one" };

Deno.test("happy path: reads, proposes, finishes; tokens and actions are tallied", async () => {
  submitted.length = 0;
  const m = scripted([call("get_audit", {}), call("recommend_fix", goodFix), finish("Proposed one fix.")]);
  const r = await runStewardLoop({ ...base, deps: deps(m.callModel) });
  assertEquals(r.status, "completed");
  assertEquals(r.summary, "Proposed one fix.");
  assertEquals(r.steps, 3);
  assertEquals(r.tokens, { prompt: 300, completion: 60 });
  assertEquals(r.actions, [{ name: "recommend_fix", status: "queued", proposalId: "p1" }]);
  assertEquals(submitted[0].rationale, "7 pages lack one");
  assert(!("rationale" in submitted[0].args), "rationale is passed separately, not as an action argument");
  assertEquals(m.seen[0], "required");
});

Deno.test("invalid action arguments are bounced back to the model, never submitted", async () => {
  submitted.length = 0;
  const m = scripted([call("recommend_fix", { ...goodFix, priority: "urgent" }), call("recommend_fix", { title: "x" }), finish()]);
  const r = await runStewardLoop({ ...base, deps: deps(m.callModel) });
  assertEquals(submitted.length, 0);
  assertEquals(r.trace.filter((t) => !t.ok).length, 2);
  assertEquals(r.status, "completed");
});

Deno.test("an action needs a rationale", async () => {
  submitted.length = 0;
  const { rationale: _r, ...noWhy } = goodFix;
  const r = await runStewardLoop({ ...base, deps: deps(scripted([call("recommend_fix", noWhy), finish()]).callModel) });
  assertEquals(submitted.length, 0);
  assert(r.trace[0].note?.includes("rationale"));
});

Deno.test("the same action twice in one run is submitted once", async () => {
  submitted.length = 0;
  await runStewardLoop({ ...base, deps: deps(scripted([call("recommend_fix", goodFix), call("recommend_fix", goodFix), finish()]).callModel) });
  assertEquals(submitted.length, 1);
});

Deno.test("action limit: extra proposals are refused and the model is told to finish", async () => {
  submitted.length = 0;
  const fixes = ["a", "b", "c"].map((id) => call("recommend_fix", { ...goodFix, check_id: id }));
  const r = await runStewardLoop({ ...base, limits: { maxActions: 2 }, deps: deps(scripted([...fixes, finish()]).callModel) });
  assertEquals(submitted.length, 2);
  assertEquals(r.actions.length, 2);
  assert(r.trace.some((t) => t.note === "action limit"));
});

Deno.test("unknown tools and bad JSON are survivable", async () => {
  const r = await runStewardLoop({ ...base, deps: deps(scripted([call("delete_everything", {}), call("get_audit", "{not json"), finish()]).callModel) });
  assertEquals(r.status, "completed");
  assertEquals(r.trace.map((t) => t.ok), [false, false, true]);
});

Deno.test("a read tool that throws returns an error to the model instead of crashing the run", async () => {
  const boom: ReadTool = { ...readTool, run: async () => { throw new Error("db down"); } };
  const r = await runStewardLoop({ ...base, readTools: [boom], deps: deps(scripted([call("get_audit", {}), finish()]).callModel) });
  assertEquals(r.status, "completed");
  assertEquals(r.trace[0], { step: 1, tool: "get_audit", ok: false, note: "db down" });
});

Deno.test("budget: near the step limit the model is forced to finish", async () => {
  const m = scripted([call("get_audit", {}), (choice) => (choice === "required" ? call("get_audit", {}) : finish("wrapped up"))]);
  const r = await runStewardLoop({ ...base, limits: { maxSteps: 4 }, deps: deps(m.callModel) });
  assertEquals(r.status, "completed");
  assertEquals(r.summary, "wrapped up");
  assertEquals(m.seen.at(-1), { type: "function", function: { name: "finish" } });
});

Deno.test("budget: a model that never finishes is stopped, not looped forever", async () => {
  const m = scripted([call("get_audit", {})]);
  const r = await runStewardLoop({ ...base, limits: { maxSteps: 3 }, deps: deps(m.callModel) });
  assertEquals(r.status, "stopped");
  assertEquals(r.stopReason, "step_limit");
  assert(m.count() <= 3);
});

Deno.test("budget: token and time limits trigger the wrap-up too", async () => {
  const tokens = scripted([call("get_audit", {}), (c) => (c === "required" ? call("get_audit", {}) : finish("t"))]);
  const r1 = await runStewardLoop({ ...base, limits: { maxTokens: 100 }, deps: deps(tokens.callModel) });
  assertEquals(r1.summary, "t");
  let clock = 0;
  const timed = scripted([call("get_audit", {}), (c) => (c === "required" ? call("get_audit", {}) : finish("late"))]);
  const r2 = await runStewardLoop({ ...base, limits: { deadlineMs: 1000 }, deps: deps(timed.callModel, { now: () => (clock += 600) }) });
  assertEquals(r2.summary, "late");
});

Deno.test("in wrap-up, action calls are refused", async () => {
  submitted.length = 0;
  const m = scripted([call("get_audit", {}), call("recommend_fix", goodFix), finish()]);
  await runStewardLoop({ ...base, limits: { maxSteps: 2 }, deps: deps(m.callModel) });
  assertEquals(submitted.length, 0);
});

Deno.test("a text-only reply is nudged, a model failure ends as failed with the reason", async () => {
  const text: ModelTurn = { content: "I think the site is fine", toolCalls: [] };
  const r = await runStewardLoop({ ...base, deps: deps(scripted([text, finish("ok")]).callModel) });
  assertEquals(r.status, "completed");
  const failing = await runStewardLoop({ ...base, deps: deps(async () => { throw new Error("rate limited"); }) });
  assertEquals(failing.status, "failed");
  assertEquals(failing.stopReason, "rate limited");
});

Deno.test("a submit that throws is reported to the model, and the run continues", async () => {
  const r = await runStewardLoop({ ...base, deps: deps(scripted([call("recommend_fix", goodFix), finish()]).callModel, { submit: async () => { throw new Error("insert failed"); } }) });
  assertEquals(r.status, "completed");
  assertEquals(r.actions.length, 0);
});

Deno.test("onStep fires once per model call", async () => {
  const steps: number[] = [];
  await runStewardLoop({ ...base, deps: deps(scripted([call("get_audit", {}), finish()]).callModel, { onStep: (s) => { steps.push(s); } }) });
  assertEquals(steps, [1, 2]);
});
