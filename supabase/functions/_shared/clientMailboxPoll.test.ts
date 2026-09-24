import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { extractReplySnippet } from "./clientMailboxPoll.ts";

function raw(headers: string, body: string): Uint8Array {
  return new TextEncoder().encode(`${headers}\n\n${body}`);
}

Deno.test("extractReplySnippet: plain 7bit body", () => {
  const msg = raw(
    "From: a@b.com\nSubject: Re: hi\nContent-Type: text/plain",
    "Sure, let's talk Thursday.",
  );
  assertEquals(extractReplySnippet(msg), "Sure, let's talk Thursday.");
});

Deno.test("extractReplySnippet: quoted-printable decodes soft breaks and hex escapes", () => {
  const msg = raw(
    "Content-Type: text/plain\nContent-Transfer-Encoding: quoted-printable",
    "Sounds good =E2=80=94 I'm=\r\n interested.",
  );
  assertEquals(extractReplySnippet(msg), "Sounds good — I'm interested.");
});

Deno.test("extractReplySnippet: base64 decodes", () => {
  const body = "Sure, let's talk Thursday.";
  const msg = raw(
    "Content-Type: text/plain\nContent-Transfer-Encoding: base64",
    btoa(body),
  );
  assertEquals(extractReplySnippet(msg), body);
});

Deno.test("extractReplySnippet: multipart/alternative prefers text/plain over text/html", () => {
  const boundary = "abc123";
  const msg = raw(
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    [
      `--${boundary}`,
      "Content-Type: text/plain",
      "",
      "Plain version here.",
      `--${boundary}`,
      "Content-Type: text/html",
      "",
      "<p>HTML version here.</p>",
      `--${boundary}--`,
    ].join("\n"),
  );
  assertEquals(extractReplySnippet(msg), "Plain version here.");
});

Deno.test("extractReplySnippet: html-only body is stripped to text", () => {
  const msg = raw(
    "Content-Type: text/html",
    "<p>Interested, <b>call me</b>.</p>",
  );
  assertEquals(extractReplySnippet(msg), "Interested, call me.");
});

Deno.test("extractReplySnippet: trims quoted history after 'On ... wrote:'", () => {
  const msg = raw(
    "Content-Type: text/plain",
    "Yes let's do it.\n\nOn Mon, Jan 5, 2026 at 3:00 PM Jane <jane@x.com> wrote:\n> original outreach text\n> more quoted text",
  );
  assertEquals(extractReplySnippet(msg), "Yes let's do it.");
});

Deno.test("extractReplySnippet: nested multipart/mixed wrapping multipart/alternative", () => {
  const inner = "inner-boundary";
  const outer = "outer-boundary";
  const innerPart = [
    `--${inner}`,
    "Content-Type: text/plain",
    "",
    "Nested plain reply.",
    `--${inner}--`,
  ].join("\n");
  const msg = raw(
    `Content-Type: multipart/mixed; boundary="${outer}"`,
    [
      `--${outer}`,
      `Content-Type: multipart/alternative; boundary="${inner}"`,
      "",
      innerPart,
      `--${outer}--`,
    ].join("\n"),
  );
  assertEquals(extractReplySnippet(msg), "Nested plain reply.");
});

Deno.test("extractReplySnippet: no text part returns null instead of throwing", () => {
  const msg = raw("Content-Type: application/pdf", "%PDF-1.4 binary junk");
  assertEquals(extractReplySnippet(msg), null);
});

Deno.test("extractReplySnippet: truncates to 4000 chars", () => {
  const long = "a".repeat(5000);
  const msg = raw("Content-Type: text/plain", long);
  const out = extractReplySnippet(msg)!;
  assertEquals(out.length, 4000);
  assertStringIncludes(out, "aaaa");
});
