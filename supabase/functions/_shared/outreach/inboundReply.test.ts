import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  buildReplyToAddress,
  extractTagFromRecipients,
  extractTrackingIdFromHeaders,
  handleInboundEmail,
  replyBodyFrom,
  type ReceivedEmail,
} from "./inboundReply.ts";

const TID = "0a1b2c3d-1111-4222-8333-444455556666";

Deno.test("reply-to: built only when a valid domain is configured", () => {
  assertEquals(buildReplyToAddress(TID, "replies.orangedoormarketing.com"), `replies+${TID}@replies.orangedoormarketing.com`);
  assertEquals(buildReplyToAddress(TID, undefined), null);
  assertEquals(buildReplyToAddress(TID, ""), null);
  assertEquals(buildReplyToAddress(TID, "not a domain"), null);
});

Deno.test("tag: read from recipients, case-insensitive, ignores other addresses", () => {
  assertEquals(extractTagFromRecipients(["x@y.com", `Replies+${TID.toUpperCase()}@replies.orangedoormarketing.com`]), TID);
  assertEquals(extractTagFromRecipients([`Orange Door <replies+${TID}@replies.orangedoormarketing.com>`]), TID);
  assertEquals(extractTagFromRecipients(["replies@replies.orangedoormarketing.com", "replies+nope@x.com"]), null);
  assertEquals(extractTagFromRecipients([`notreplies+${TID}@x.com`]), null);
});

Deno.test("headers fallback: odm- Message-ID in In-Reply-To or References", () => {
  assertEquals(extractTrackingIdFromHeaders({ "in-reply-to": `<odm-${TID}@intermetrics.com>` }), TID);
  assertEquals(extractTrackingIdFromHeaders({ references: `<a@b> <odm-${TID}@x.io>` }), TID);
  assertEquals(extractTrackingIdFromHeaders({ "in-reply-to": "<random@x.io>" }), null);
});

Deno.test("reply body: text preferred, quoted history cut, html fallback", () => {
  assertEquals(replyBodyFrom("Sounds good, call me.\n\nOn Mon, Oct 5, Jim wrote:\n> hi", null), "Sounds good, call me.");
  assertEquals(replyBodyFrom(null, "<p>Yes please</p>"), "Yes please");
  assertEquals(replyBodyFrom("  ", null), null);
});

// Minimal chainable fake of the supabase-js calls replyIngest/inboundReply make.
function fakeDb(tables: Record<string, unknown>) {
  const writes: { table: string; op: string; data: unknown }[] = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "filter", "limit", "gt", "gte", "lt", "in", "order", "not", "ilike"]) chain[m] = self;
    chain.maybeSingle = () => Promise.resolve({ data: tables[table] ?? null, error: null });
    chain.upsert = (data: unknown) => { writes.push({ table, op: "upsert", data }); return chain; };
    chain.update = (data: unknown) => { writes.push({ table, op: "update", data }); return chain; };
    chain.insert = (data: unknown) => { writes.push({ table, op: "insert", data }); return Promise.resolve({ error: null }); };
    // deno-lint-ignore no-explicit-any
    chain.then = (res: any) => res({ data: null, error: null });
    return chain;
  };
  return { db: { from }, writes };
}

const received = (over: Partial<ReceivedEmail> = {}): ReceivedEmail => ({
  id: "e1",
  from: "Pat Prospect <pat@acme.com>",
  to: [`replies+${TID}@replies.orangedoormarketing.com`],
  subject: "Re: Quick question",
  text: "Yes, let's talk Tuesday.\n\nOn Mon Jim wrote:\n> hi",
  html: null,
  headers: { from: "Pat Prospect <pat@acme.com>", "message-id": "<reply-1@acme.com>", "in-reply-to": `<odm-${TID}@intermetrics.com>` },
  message_id: "<reply-1@acme.com>",
  created_at: "2026-10-16T10:00:00Z",
  ...over,
});
const ev = { email_id: "e1", from: "pat@acme.com", to: [`replies+${TID}@replies.orangedoormarketing.com`] };

Deno.test("inbound reply: stored against the client, prospect flipped to replied", async () => {
  const { db, writes } = fakeDb({
    email_logs: { id: "log1", metadata: { client_id: "c1", prospect_id: "p1" } },
    prospects: { name: "Pat", status: "nurture", reply_snippet: null },
  });
  const out = await handleInboundEmail(db, ev, () => Promise.resolve(received()));
  assertEquals(out, { handled: true, classification: "reply", stored: true });
  const reply = writes.find((w) => w.table === "prospect_replies" && w.op === "upsert")!.data as Record<string, unknown>;
  assertEquals(reply.client_id, "c1");
  assertEquals(reply.prospect_id, "p1");
  assertEquals(reply.message_id, "reply-1@acme.com");
  assertEquals(reply.from_address, "pat@acme.com");
  assertEquals(reply.body_text, "Yes, let's talk Tuesday.");
  const prospect = writes.find((w) => w.table === "prospects" && w.op === "update")!.data as Record<string, unknown>;
  assertEquals(prospect.status, "replied");
  assertEquals(writes.some((w) => w.table === "email_queue" && w.op === "update"), true);
});

Deno.test("inbound: out-of-office is dropped, mail without a tag is ignored", async () => {
  const { db, writes } = fakeDb({ email_logs: { id: "log1", metadata: { client_id: "c1", prospect_id: "p1" } } });
  const ooo = await handleInboundEmail(db, ev, () => Promise.resolve(received({ subject: "Automatic reply: Quick question" })));
  assertEquals(ooo, { handled: false, reason: "auto_reply" });
  const untagged = await handleInboundEmail(db, { ...ev, to: ["replies@replies.orangedoormarketing.com"] }, () =>
    Promise.resolve(received({ to: ["replies@replies.orangedoormarketing.com"], headers: { from: "x@y.com" } })));
  assertEquals(untagged, { handled: false, reason: "no_tracking_id" });
  assertEquals(writes.length, 0);
});

Deno.test("inbound: a tag with no matching send is dropped, never filed", async () => {
  const { db, writes } = fakeDb({});
  const out = await handleInboundEmail(db, ev, () => Promise.resolve(received()));
  assertEquals(out, { handled: false, reason: "unknown_send" });
  assertEquals(writes.length, 0);
});

Deno.test("inbound: a fetch failure propagates so the webhook 5xxs and Resend retries", async () => {
  const { db } = fakeDb({});
  let threw = false;
  try { await handleInboundEmail(db, ev, () => Promise.reject(new Error("503"))); } catch { threw = true; }
  assertEquals(threw, true);
});
