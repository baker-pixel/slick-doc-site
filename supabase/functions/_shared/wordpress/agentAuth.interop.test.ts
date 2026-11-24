// The PHP plugin and the Deno backend must agree on the wire format byte for byte.
// This runs the real plugin signing code (wp-plugin/includes/agent.php, with WordPress
// stubbed) and verifies its output with the backend's verifier. Skipped without `php`.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { checkSignedRequest, readSignedHeaders, verifySignature } from "./agentAuth.ts";

async function phpSigned() {
  const script = new URL("../../../../wp-plugin/tests/sign_cli.php", import.meta.url).pathname;
  const out = await new Deno.Command("php", { args: [script] }).output();
  if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
  return JSON.parse(new TextDecoder().decode(out.stdout));
}

async function hasPhp(): Promise<boolean> {
  try {
    return (await new Deno.Command("php", { args: ["-v"], stdout: "null", stderr: "null" }).output()).success;
  } catch {
    return false;
  }
}

const php = await hasPhp();

Deno.test({ name: "interop: a request signed by the PHP plugin passes the backend check", ignore: !php, permissions: "inherit" }, async () => {
  const s = await phpSigned();
  const headers = new Headers(s.headers);
  const failure = await checkSignedRequest({
    method: "POST",
    path: "/site-agent",
    body: s.body,
    headers: readSignedHeaders(headers),
    publicKeyB64: s.public_key,
  });
  assertEquals(failure, null);
});

Deno.test({ name: "interop: tampering with the body after signing is caught", ignore: !php }, async () => {
  const s = await phpSigned();
  const failure = await checkSignedRequest({
    method: "POST",
    path: "/site-agent",
    body: s.body.replace("heartbeat", "pull"),
    headers: readSignedHeaders(new Headers(s.headers)),
    publicKeyB64: s.public_key,
  });
  assertEquals(failure, "bad_signature");
});

Deno.test({ name: "interop: the registration challenge answer verifies", ignore: !php }, async () => {
  const s = await phpSigned();
  assertEquals(await verifySignature(s.public_key, s.challenge_signature, `od-register\n${s.challenge}`), true);
  assertEquals(await verifySignature(s.public_key, s.challenge_signature, `od-register\nffffffffffffffffffffffffffffffff`), false);
});
