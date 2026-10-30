// Stateless MCP (Model Context Protocol) server core: JSON-RPC 2.0 over the
// Streamable HTTP transport, tools only. No I/O here; the edge function feeds it
// parsed messages and a call function. Stateless means no session ids and no
// server-initiated stream, which is all a tools-only server needs and works on
// edge functions where each request may land on a different instance.
import { type ToolDef, ToolError } from "./stewardTools.ts";

export const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface RpcRequest { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any }
export type RpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string; data?: unknown } };

export const RPC = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

export interface McpDeps {
  tools: readonly ToolDef[];
  call: (name: string, args: unknown) => Promise<unknown>;
  serverInfo: { name: string; version: string };
  instructions?: string;
}

const ok = (id: RpcRequest["id"], result: unknown): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: RpcRequest["id"], code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export function describeTool(t: ToolDef) {
  return {
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { readOnlyHint: t.sideEffect === "read", destructiveHint: false, openWorldHint: false },
  };
}

/** Handles one JSON-RPC message. Returns null for notifications and responses, which get no reply. */
export async function handleMessage(msg: unknown, deps: McpDeps): Promise<RpcResponse | null> {
  const m = msg as Partial<RpcRequest> | null;
  if (!m || typeof m !== "object" || m.jsonrpc !== "2.0") return fail(null, RPC.invalidRequest, "not a JSON-RPC 2.0 message");
  if (typeof m.method !== "string") return null; // a response object from the client: nothing to answer
  const isNotification = m.id === undefined;

  try {
    switch (m.method) {
      case "initialize": {
        const asked = m.params?.protocolVersion;
        const version = (SUPPORTED_VERSIONS as readonly string[]).includes(asked) ? asked : SUPPORTED_VERSIONS[0];
        return ok(m.id, {
          protocolVersion: version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: deps.serverInfo,
          ...(deps.instructions ? { instructions: deps.instructions } : {}),
        });
      }
      case "ping":
        return ok(m.id, {});
      case "tools/list":
        return ok(m.id, { tools: deps.tools.map(describeTool) });
      case "tools/call": {
        const name = m.params?.name;
        if (typeof name !== "string") return fail(m.id, RPC.invalidParams, "tools/call needs a tool name");
        if (!deps.tools.some((t) => t.name === name)) return fail(m.id, RPC.invalidParams, `unknown tool "${name}"`);
        try {
          const result = await deps.call(name, m.params?.arguments ?? {});
          return ok(m.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false });
        } catch (e) {
          // Errors the model can act on come back as a tool result, so it can correct itself.
          if (e instanceof ToolError) return ok(m.id, { content: [{ type: "text", text: e.message }], isError: true });
          console.error(`[mcp] tool ${name} failed:`, e);
          return ok(m.id, { content: [{ type: "text", text: "internal error" }], isError: true });
        }
      }
      default:
        // Notifications (notifications/initialized, notifications/cancelled, ...) need no reply.
        if (isNotification || m.method.startsWith("notifications/")) return null;
        return fail(m.id, RPC.methodNotFound, `method "${m.method}" is not supported`);
    }
  } catch (e) {
    console.error("[mcp] handler crashed:", e);
    return isNotification ? null : fail(m.id, RPC.internal, "internal error");
  }
}
