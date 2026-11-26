import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decryptToken, encryptToken } from "./tokenCrypto.ts";
import { safeReturnOrigin, signState, verifyState } from "./oauth.ts";

Deno.env.set("GOOGLE_TOKEN_KEY", btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));
Deno.env.set("GOOGLE_CLIENT_SECRET", "test-secret");

Deno.test("token encryption round-trips and hides the plaintext", async () => {
  const enc = await encryptToken("1//refresh-token");
  assert(!enc.includes("refresh-token"));
  assertEquals(await decryptToken(enc), "1//refresh-token");
});

Deno.test("signed state verifies; tampering and forgery are rejected", async () => {
  const st = await signState({ c: "client-1", u: "user-1", o: "http://localhost:8080" });
  assertEquals((await verifyState(st))?.c, "client-1");
  assertEquals(await verifyState(st.slice(0, -2) + "xx"), null);
  const forged = btoa('{"c":"other","exp":9999999999999}').replace(/=/g, "") + "." + st.split(".")[1];
  assertEquals(await verifyState(forged), null);
  assertEquals(await verifyState(null), null);
});

Deno.test("return origin is limited to our own hosts", () => {
  Deno.env.set("APP_URL", "https://orangedoormarketing.com");
  assertEquals(safeReturnOrigin("https://evil.com/x"), "https://orangedoormarketing.com");
  assertEquals(safeReturnOrigin("http://orangedoormarketing.com"), "https://orangedoormarketing.com");
  assertEquals(safeReturnOrigin("http://localhost:8080/portal"), "http://localhost:8080");
});
