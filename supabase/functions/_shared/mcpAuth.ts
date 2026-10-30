// deno-lint-ignore-file no-explicit-any
// Bearer-token auth for the MCP endpoint. Tokens are random, shown once, and
// stored only as a SHA-256 hash. A token is only as powerful as the admin who
// made it: it stops working the moment that user loses the admin role.
export const TOKEN_PREFIX = "odm_";
export const VALID_SCOPES = ["read", "propose", "decide"] as const;

export interface McpPrincipal {
  tokenId: string;
  userId: string;
  scopes: string[];
  allowedClientIds: string[] | null;
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return TOKEN_PREFIX + b64;
}

export function bearerOf(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("Authorization") ?? "");
  return m ? m[1] : null;
}

/** Returns the principal for a valid token, or null. Never says why, so a probe learns nothing. */
export async function authenticateMcp(req: Request, supabase: any, now = Date.now()): Promise<McpPrincipal | null> {
  const token = bearerOf(req);
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;

  const { data: row } = await supabase
    .from("mcp_tokens")
    .select("id, user_id, scopes, client_account_ids, expires_at, revoked_at, last_used_at")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  if (!row || row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return null;

  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", row.user_id).eq("role", "admin").maybeSingle();
  if (!role) return null;

  // Best-effort, and at most once a minute so a busy client does not write on every call.
  if (!row.last_used_at || now - new Date(row.last_used_at).getTime() > 60_000) {
    supabase.from("mcp_tokens").update({ last_used_at: new Date(now).toISOString() }).eq("id", row.id)
      .then(() => {}, () => {});
  }

  return {
    tokenId: row.id,
    userId: row.user_id,
    scopes: Array.isArray(row.scopes) ? row.scopes : ["read"],
    allowedClientIds: Array.isArray(row.client_account_ids) ? row.client_account_ids : null,
  };
}
