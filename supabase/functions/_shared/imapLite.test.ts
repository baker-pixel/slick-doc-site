import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { ImapLite } from "./imapLite.ts";

// Speaks just enough Dovecot-style IMAP (incl. the tagged reply that broke the
// old library and a literal-bearing FETCH) over plain TCP-via-TLS is not
// possible without certs, so exercise the parser through a stubbed connection.
function stubConn(script: string[]): Deno.TlsConn {
  const chunks = script.map((s) => new TextEncoder().encode(s));
  let i = 0;
  return {
    read(p: Uint8Array) { const c = chunks[i++]; if (!c) return Promise.resolve(null); p.set(c); return Promise.resolve(c.length); },
    write(p: Uint8Array) { return Promise.resolve(p.length); },
    close() {},
  } as unknown as Deno.TlsConn;
}

Deno.test("ImapLite parses Dovecot tagged OK text, SEARCH and literal FETCH headers", async () => {
  const hdr = "From: a@b.com\r\nIn-Reply-To: <odm-11111111-2222-3333-4444-555555555555@x.com>\r\n\r\n";
  const c = new ImapLite({ host: "x" }) as unknown as { conn: Deno.TlsConn; searchSince(d: Date): Promise<number[]>; fetchHeaders(u: number[], f: string[]): Promise<Map<number, Record<string, string>>> };
  c.conn = stubConn([
    "* SEARCH 7 9\r\nt1 OK Search completed (0.001 + 0.000 secs).\r\n",
    `* 1 FETCH (UID 9 BODY[HEADER.FIELDS (FROM)] {${hdr.length}}\r\n${hdr})\r\nt2 OK Fetch completed.\r\n`,
  ]);
  assertEquals(await c.searchSince(new Date()), [7, 9]);
  const h = await c.fetchHeaders([9], ["FROM"]);
  assertEquals(h.get(9)?.["in-reply-to"], "<odm-11111111-2222-3333-4444-555555555555@x.com>");
});

Deno.test("ImapLite throws (without echoing the command) on NO", async () => {
  const c = new ImapLite({ host: "x" }) as unknown as { conn: Deno.TlsConn; login(u: string, p: string): Promise<void> };
  c.conn = stubConn(["t1 NO [AUTHENTICATIONFAILED] Authentication failed.\r\n"]);
  let msg = "";
  try { await c.login("u", "secret-pw"); } catch (e) { msg = (e as Error).message; }
  assertEquals(msg.includes("secret-pw"), false);
  assertEquals(msg.startsWith("IMAP command failed: NO"), true);
});
