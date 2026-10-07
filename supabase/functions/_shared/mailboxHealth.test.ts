import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { domainOf, evaluateMailbox, lookupMx, type PollRunRow } from "./mailboxHealth.ts";

const NOW = new Date("2026-10-07T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const run = (h: number, over: Partial<PollRunRow> = {}): PollRunRow =>
  ({ ok: true, messages_seen: 0, finished_at: hoursAgo(h), error: null, ...over });
// every 15 min for `hours`, newest first
const everyQuarterHour = (hours: number, over: Partial<PollRunRow> = {}) =>
  Array.from({ length: hours * 4 }, (_, i) => run(i / 4, over));

Deno.test("no runs yet -> unknown, never an alert", () => {
  assertEquals(evaluateMailbox([], 50, NOW).status, "unknown");
});

Deno.test("3 consecutive failed polls -> failing with the latest error", () => {
  const runs = [run(0, { ok: false, error: "auth" }), run(0.25, { ok: false, error: "x" }), run(0.5, { ok: false, error: "y" })];
  assertEquals(evaluateMailbox(runs, 0, NOW), { status: "failing", reason: "auth" });
});

Deno.test("2 failures then a success is not failing", () => {
  const runs = [run(0, { ok: false }), run(0.25, { ok: false }), run(0.5, { messages_seen: 4 })];
  assertEquals(evaluateMailbox(runs, 0, NOW).status, "healthy");
});

Deno.test("silent: 48h of empty successful polls + real outreach -> alert (the Innermetrix case)", () => {
  assertEquals(evaluateMailbox(everyQuarterHour(50), 36, NOW).status, "silent");
});

Deno.test("empty inbox but little outreach is normal, not an alert", () => {
  assertEquals(evaluateMailbox(everyQuarterHour(50), 2, NOW).status, "healthy");
});

Deno.test("any message seen in the window means the mailbox is alive", () => {
  const runs = everyQuarterHour(50);
  runs[40] = run(10, { messages_seen: 3 });
  assertEquals(evaluateMailbox(runs, 36, NOW).status, "healthy");
});

Deno.test("a mailbox watched for only a few hours can't be called silent yet", () => {
  assertEquals(evaluateMailbox(everyQuarterHour(6), 36, NOW).status, "healthy");
});

Deno.test("domainOf", () => {
  assertEquals(domainOf("Immy@IMXProfiles.com"), "imxprofiles.com");
  assertEquals(domainOf("nope"), null);
  assertEquals(domainOf(null), null);
});

const dns = (body: unknown, ok = true): typeof fetch =>
  (() => Promise.resolve({ ok, status: ok ? 200 : 502, json: () => Promise.resolve(body) } as Response)) as typeof fetch;

Deno.test("MX lookup: records, none, nxdomain, and failures are distinguished", async () => {
  assertEquals(
    await lookupMx("a.com", dns({ Status: 0, Answer: [{ type: 15, data: "10 mail.a.com." }] })),
    { status: "ok", hosts: ["mail.a.com"] },
  );
  assertEquals(await lookupMx("b.com", dns({ Status: 0 })), { status: "none" });
  assertEquals(await lookupMx("c.com", dns({ Status: 3 })), { status: "none" });
  // A resolver failure must never read as "domain has no MX".
  assertEquals((await lookupMx("d.com", dns({ Status: 2 }))).status, "error");
  assertEquals((await lookupMx("e.com", dns({}, false))).status, "error");
  assertEquals((await lookupMx("f.com", (() => Promise.reject(new Error("net"))) as typeof fetch)).status, "error");
});
