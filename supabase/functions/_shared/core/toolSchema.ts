// JSON-schema subset shared by the tool registry and the steward loop: the
// shape tools declare, and the check that runs before any handler does.

export interface PropSchema {
  type: "string" | "number" | "integer" | "boolean";
  description?: string;
  enum?: readonly (string | number)[];
  format?: "uuid" | "date";
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}
export interface InputSchema {
  type: "object";
  properties: Record<string, PropSchema>;
  required?: readonly string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Minimal JSON-schema check. Rejects unknown keys so a misspelt argument fails loudly. */
export function validateArgs(schema: InputSchema, args: unknown): string | null {
  if (args == null || typeof args !== "object" || Array.isArray(args)) return "arguments must be an object";
  const a = args as Record<string, unknown>;
  for (const k of Object.keys(a)) if (!(k in schema.properties)) return `unknown argument "${k}"`;
  for (const k of schema.required ?? []) if (a[k] === undefined || a[k] === null) return `missing required argument "${k}"`;
  for (const [k, p] of Object.entries(schema.properties)) {
    const v = a[k];
    if (v === undefined || v === null) continue;
    if (p.type === "string") {
      if (typeof v !== "string") return `"${k}" must be a string`;
      if (p.maxLength && v.length > p.maxLength) return `"${k}" is longer than ${p.maxLength} characters`;
      if (p.format === "uuid" && !UUID.test(v)) return `"${k}" must be a UUID`;
      if (p.format === "date" && !DATE.test(v)) return `"${k}" must be a date like 2026-12-31`;
    } else if (p.type === "boolean") {
      if (typeof v !== "boolean") return `"${k}" must be true or false`;
    } else {
      if (typeof v !== "number" || !Number.isFinite(v)) return `"${k}" must be a number`;
      if (p.type === "integer" && !Number.isInteger(v)) return `"${k}" must be an integer`;
      if (p.minimum !== undefined && v < p.minimum) return `"${k}" must be at least ${p.minimum}`;
      if (p.maximum !== undefined && v > p.maximum) return `"${k}" must be at most ${p.maximum}`;
    }
    if (p.enum && !p.enum.includes(v as any)) return `"${k}" must be one of: ${p.enum.join(", ")}`;
  }
  return null;
}

