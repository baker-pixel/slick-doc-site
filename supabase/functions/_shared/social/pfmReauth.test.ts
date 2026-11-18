import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { flagNeedsReauth, isReconnectError, platformLabel } from "./pfmReauth.ts";

Deno.test("isReconnectError: the real Facebook message from production matches", () => {
  assertEquals(
    isReconnectError(
      '"Account needs to be reconnected: Any of the pages_read_engagement, pages_manage_metadata,\n pages_read_user_content, pages_manage_ads, pages_show_list or\n pages_messaging permission(s) must be granted before impersonating a user\'s page."',
    ),
    true,
  );
});

Deno.test("isReconnectError: common expired / revoked token wordings match", () => {
  for (const m of [
    "Error validating access token: Session has expired on Tuesday",
    "The access token is invalid",
    "OAuthException: Invalid OAuth access token.",
    "(#190) token revoked",
    "Please reconnect your account",
    "Authorization has been revoked",
    "Facebook error code: 190",
  ]) assertEquals(isReconnectError(m), true, m);
});

Deno.test("isReconnectError: generic and transient failures do not match", () => {
  for (const m of [
    "Invalid Request",
    "PfM API error 502",
    "PfM API error 429",
    "No PfM account for facebook",
    "Post content is empty or still a placeholder",
    "Tweet too long after truncation (300 chars).",
    "Invalid Request: invalid social accounts, not owned by user",
    "Platform rejected the post",
    "",
  ]) assertEquals(isReconnectError(m), false, m);
  assertEquals(isReconnectError(null), false);
  assertEquals(isReconnectError(undefined), false);
});

// A chainable stand-in that records what the helper writes.
function fakeSupabase() {
  const calls: { table: string; update?: unknown; filters: [string, unknown][]; inserted?: unknown }[] = [];
  const from = (table: string) => {
    const call: (typeof calls)[number] = { table, filters: [] };
    calls.push(call);
    // deno-lint-ignore no-explicit-any
    const chain: any = {
      update(v: unknown) { call.update = v; return chain; },
      insert(v: unknown) { call.inserted = v; return Promise.resolve({ error: null }); },
      select() { return chain; },
      eq(k: string, v: unknown) { call.filters.push([k, v]); return chain; },
      gt() { return chain; },
      limit() { return Promise.resolve({ data: [] }); },
      then(res: (v: unknown) => unknown) { return Promise.resolve({ error: null }).then(res); },
    };
    return chain;
  };
  return { calls, client: { from } };
}

Deno.test("flagNeedsReauth: flags only connected rows of that client+platform, and notifies the client", async () => {
  const { calls, client } = fakeSupabase();
  await flagNeedsReauth(client, { clientId: "c1", platform: "facebook" });
  const upd = calls.find((c) => c.table === "client_postforme_accounts")!;
  assertEquals(upd.update, { status: "needs_reauth" });
  assertEquals(upd.filters, [["client_id", "c1"], ["platform", "facebook"], ["status", "connected"]]);
  const note = calls.find((c) => c.table === "client_notifications" && c.inserted)!;
  assertEquals((note.inserted as { title: string }).title, "Your Facebook connection needs to be reconnected");
  assertEquals((note.inserted as { notification_type: string }).notification_type, "integration_needs_reauth");
});

Deno.test("flagNeedsReauth: a specific PfM account id narrows the update to that account", async () => {
  const { calls, client } = fakeSupabase();
  await flagNeedsReauth(client, { clientId: "c1", platform: "facebook", pfmAccountId: "spa_123" });
  const upd = calls.find((c) => c.table === "client_postforme_accounts")!;
  assertEquals(upd.filters.at(-1), ["postforme_account_id", "spa_123"]);
});

Deno.test("platformLabel", () => {
  assertEquals(platformLabel("facebook"), "Facebook");
});
