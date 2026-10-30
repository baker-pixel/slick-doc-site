import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkAdminAuth } from "../_shared/auth.ts";
import { generateToken, hashToken, TOKEN_PREFIX, VALID_SCOPES } from "../_shared/mcpAuth.ts";

// Admin-only management of MCP access tokens: create (plaintext returned once),
// list (never returns the token), revoke. Requires a real admin session, not
// the legacy shared password, because a token acts as that person.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return errorResponse("use POST", 405);

  const supabase = serviceClient();
  const auth = await checkAdminAuth(req, supabase);
  if (!auth.authorized || auth.via !== "session" || !auth.userId) return errorResponse("admin session required", 401);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid JSON", 400);
  }

  try {
    if (body.action === "list") {
      const { data, error } = await supabase.from("mcp_tokens")
        .select("id, name, token_prefix, scopes, client_account_ids, expires_at, last_used_at, revoked_at, created_at")
        .eq("user_id", auth.userId).order("created_at", { ascending: false });
      if (error) throw error;
      return jsonResponse({ tokens: data });
    }

    if (body.action === "revoke") {
      if (typeof body.id !== "string" || !UUID.test(body.id)) return errorResponse("id must be a UUID", 400);
      const { data, error } = await supabase.from("mcp_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", body.id).eq("user_id", auth.userId).is("revoked_at", null).select("id");
      if (error) throw error;
      if (!data?.length) return errorResponse("token not found", 404);
      return jsonResponse({ revoked: body.id });
    }

    if (body.action === "create") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 80) return errorResponse("name is required (80 characters max)", 400);
      const scopes: string[] = Array.isArray(body.scopes) && body.scopes.length ? body.scopes : ["read"];
      if (!scopes.every((s) => (VALID_SCOPES as readonly string[]).includes(s))) {
        return errorResponse(`scopes must be from: ${VALID_SCOPES.join(", ")}`, 400);
      }
      const ids = body.client_account_ids;
      if (ids != null && (!Array.isArray(ids) || !ids.every((i) => typeof i === "string" && UUID.test(i)))) {
        return errorResponse("client_account_ids must be a list of UUIDs, or omitted for all clients", 400);
      }
      const days = body.expires_in_days;
      if (days != null && (!Number.isInteger(days) || days < 1 || days > 365)) {
        return errorResponse("expires_in_days must be 1 to 365", 400);
      }

      const token = generateToken();
      const { data, error } = await supabase.from("mcp_tokens").insert({
        user_id: auth.userId,
        name,
        token_hash: await hashToken(token),
        token_prefix: token.slice(0, TOKEN_PREFIX.length + 6),
        scopes,
        client_account_ids: ids ?? null,
        expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
      }).select("id, name, token_prefix, scopes, client_account_ids, expires_at").single();
      if (error) throw error;
      return jsonResponse({ token, ...data, note: "Copy the token now. It cannot be shown again." });
    }

    return errorResponse('action must be "create", "list" or "revoke"', 400);
  } catch (e) {
    console.error("[mcp-tokens]", e);
    return errorResponse(e, 500);
  }
});
