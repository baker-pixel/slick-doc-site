import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { handleMessage, type McpDeps } from "./mcpServer.ts";
import { TOOLS, ToolError } from "./stewardTools.ts";

const deps = (call: McpDeps["call"] = async () => ({ ok: true })): McpDeps => ({ tools: TOOLS, call, serverInfo: { name: "t", version: "0" } });

Deno.test("initialize: echoes a supported version, falls back for an unknown one, declares tools only", async () => {
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, deps());
  assertEquals(r.result.protocolVersion, "2025-03-26");
  assertEquals(Object.keys(r.result.capabilities), ["tools"]);
  const r2: any = await handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, deps());
  assertEquals(r2.result.protocolVersion, "2025-06-18");
});

Deno.test("notifications get no reply", async () => {
  assertEquals(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, deps()), null);
  assertEquals(await handleMessage({ jsonrpc: "2.0", method: "whatever" }, deps()), null);
});

Deno.test("tools/list: every tool has a schema, and read tools are annotated read-only", async () => {
  const r: any = await handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, deps());
  assertEquals(r.result.tools.length, TOOLS.length);
  const list = r.result.tools.find((t: any) => t.name === "list_clients");
  assertEquals(list.annotations.readOnlyHint, true);
  assertEquals(r.result.tools.find((t: any) => t.name === "set_goal").annotations.readOnlyHint, false);
  for (const t of r.result.tools) assertEquals(t.inputSchema.type, "object");
});

Deno.test("tools/call: success returns JSON text, ToolError becomes isError, other errors are masked", async () => {
  const good: any = await handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_clients", arguments: {} } }, deps());
  assertEquals(good.result.isError, false);
  assertEquals(JSON.parse(good.result.content[0].text), { ok: true });

  const bad: any = await handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "list_clients" } }, deps(async () => { throw new ToolError("client not found"); }));
  assertEquals(bad.result.isError, true);
  assertEquals(bad.result.content[0].text, "client not found");

  const secret: any = await handleMessage({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "list_clients" } }, deps(async () => { throw new Error("password=hunter2 at db.internal"); }));
  assertEquals(secret.result.isError, true);
  assertEquals(secret.result.content[0].text, "internal error");
});

Deno.test("tools/call: unknown tool and missing name are protocol errors; unknown method errors", async () => {
  const a: any = await handleMessage({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "nope" } }, deps());
  assertEquals(a.error.code, -32602);
  const b: any = await handleMessage({ jsonrpc: "2.0", id: 8, method: "tools/call", params: {} }, deps());
  assertEquals(b.error.code, -32602);
  const c: any = await handleMessage({ jsonrpc: "2.0", id: 9, method: "resources/list" }, deps());
  assertEquals(c.error.code, -32601);
  const d: any = await handleMessage({ id: 10, method: "ping" }, deps());
  assertEquals(d.error.code, -32600);
  assert((await handleMessage({ jsonrpc: "2.0", id: 11, method: "ping" }, deps()) as any).result !== undefined);
});
