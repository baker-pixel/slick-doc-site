import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  buildLeads,
  classifyLeads,
  detectMapping,
  estimateSendDays,
  isRoleAddress,
  isValidEmail,
  normalizeWebsite,
  parseCsv,
  prospectDisplayName,
} from "./leadImport.ts";

Deno.test("parseCsv: quotes, escaped quotes, embedded commas and newlines", () => {
  const rows = parseCsv('name,note\n"Smith, Jo","said ""hi""\nthen left"\nBob,plain\n');
  assertEquals(rows, [["name", "note"], ["Smith, Jo", 'said "hi"\nthen left'], ["Bob", "plain"]]);
});

Deno.test("parseCsv: CRLF, BOM, blank lines, no trailing newline", () => {
  assertEquals(parseCsv("﻿a,b\r\n1,2\r\n\r\n3,4"), [["a", "b"], ["1", "2"], ["3", "4"]]);
});

Deno.test("parseCsv: semicolon and tab delimiters are detected", () => {
  assertEquals(parseCsv("email;name\na@x.com;Al"), [["email", "name"], ["a@x.com", "Al"]]);
  assertEquals(parseCsv("email\tname\na@x.com\tAl"), [["email", "name"], ["a@x.com", "Al"]]);
});

Deno.test("parseCsv: empty input", () => {
  assertEquals(parseCsv(""), []);
  assertEquals(parseCsv("  \n  "), []);
});

Deno.test("detectMapping: common header spellings", () => {
  const m = detectMapping(["First Name", "Last Name", "E-mail", "Company Name", "Website URL", "Job Title", "Notes"]);
  assertEquals(m, { first_name: 0, last_name: 1, email: 2, company: 3, website: 4, title: 5, note: 6 });
});

Deno.test("detectMapping: 'Name' alone is the full name; unknown headers are ignored", () => {
  const m = detectMapping(["Name", "Email", "Favourite colour"]);
  assertEquals(m, { full_name: 0, email: 1 });
});

Deno.test("email validation", () => {
  for (const ok of ["a@b.co", "first.last+tag@sub.example.com", "x_y@ex-ample.org"]) assert(isValidEmail(ok), ok);
  for (const bad of ["", "nope", "a@b", "a@@b.com", "a b@c.com", "a..b@c.com", "@c.com", "a@-c.com"]) assert(!isValidEmail(bad), bad);
});

Deno.test("role addresses", () => {
  assert(isRoleAddress("info@x.com"));
  assert(isRoleAddress("sales+cold@x.com"));
  assert(!isRoleAddress("jane@x.com"));
});

Deno.test("normalizeWebsite: origin only, no www, https; garbage becomes empty", () => {
  assertEquals(normalizeWebsite("https://www.Acme.com/about?x=1"), "https://acme.com");
  assertEquals(normalizeWebsite("acme.io"), "https://acme.io");
  assertEquals(normalizeWebsite("localhost"), "");
  assertEquals(normalizeWebsite(""), "");
  assertEquals(normalizeWebsite(undefined), "");
});

const csv = [
  "First Name,Last Name,Email,Company,Website,Notes",
  "jane,doe,Jane@Acme.com,Acme,www.acme.com,met at SaaStr",
  "Bob,,bob@globex.com,Globex,,",
  ",,not-an-email,X,,",
  ",,,Y,,",
  "Jane,Doe,jane@acme.com,Acme,,dup",
  "Amy,Lee,amy@initech.com,Initech,,",
  "Sam,Roe,info@umbrella.com,Umbrella,,",
  "Una,Sub,una@hooli.com,Hooli,,",
  "Bo,Bounce,bo@piedpiper.com,Pied,,",
].join("\n");

Deno.test("buildLeads: maps columns, normalises, rejects bad rows with line numbers", () => {
  const rows = parseCsv(csv);
  const { leads, rejected } = buildLeads(rows.slice(1), detectMapping(rows[0]));
  assertEquals(leads[0].email, "jane@acme.com");
  assertEquals(leads[0].first_name, "Jane"); // title-cased from "jane"
  assertEquals(leads[0].website, "https://acme.com");
  assertEquals(leads[0].note, "met at SaaStr");
  assertEquals(rejected, [
    { line: 4, reason: "invalid_email", value: "not-an-email" },
    { line: 5, reason: "missing_email", value: "" },
  ]);
});

Deno.test("buildLeads: full name splits into first/last when no separate columns", () => {
  const { leads } = buildLeads([["Mary Ann Smith", "m@x.com"]], detectMapping(["Name", "Email"]));
  assertEquals([leads[0].first_name, leads[0].last_name], ["Mary", "Ann Smith"]);
});

Deno.test("classifyLeads: dedupes in file and applies suppression with the strongest reason", () => {
  const rows = parseCsv(csv);
  const { leads, rejected } = buildLeads(rows.slice(1), detectMapping(rows[0]));
  const { accepted, summary } = classifyLeads(leads, rejected, {
    existing: new Set(["amy@initech.com"]),
    unsubscribed: new Set(["una@hooli.com"]),
    bounced: new Set(["bo@piedpiper.com"]),
  });
  assertEquals(accepted.map((l) => l.email), ["jane@acme.com", "bob@globex.com", "info@umbrella.com"]);
  assertEquals(summary, {
    total_rows: 9,
    accepted: 3,
    invalid: 2,
    duplicates_in_file: 1,
    already_in_pipeline: 1,
    unsubscribed: 1,
    bounced: 1,
    role_addresses: 1,
    without_first_name: 0,
  });
});

Deno.test("classifyLeads: an unsubscribed address that is also an existing prospect counts as unsubscribed", () => {
  const { leads } = buildLeads([["a@x.com"]], { email: 0 });
  const { summary } = classifyLeads(leads, [], {
    existing: new Set(["a@x.com"]), unsubscribed: new Set(["a@x.com"]), bounced: new Set(),
  });
  assertEquals([summary.unsubscribed, summary.already_in_pipeline], [1, 0]);
});

Deno.test("estimateSendDays", () => {
  assertEquals(estimateSendDays(0, 50), 0);
  assertEquals(estimateSendDays(1, 50), 1);
  assertEquals(estimateSendDays(101, 50), 3);
  assertEquals(estimateSendDays(10, 0), 10);
});

Deno.test("prospectDisplayName: company, else person, else domain", () => {
  const base = { email: "a@x.com", first_name: "", last_name: "", company: "", website: "", title: "", city: "", note: "", role_address: false };
  assertEquals(prospectDisplayName({ ...base, company: "Acme" }), "Acme");
  assertEquals(prospectDisplayName({ ...base, first_name: "Jo", last_name: "Lee" }), "Jo Lee");
  assertEquals(prospectDisplayName(base), "x.com");
});

import { assignWebsites, leadToProspectRow } from "./leadImport.ts";

const mk = (email: string, website: string) => ({
  email, first_name: "A", last_name: "B", company: "Acme", website, title: "CEO", city: "", note: "met", role_address: false,
});

Deno.test("assignWebsites: first lead per company keeps the site, the rest get empty", () => {
  const m = assignWebsites(
    [mk("a@acme.com", "https://acme.com"), mk("b@acme.com", "https://acme.com"), mk("c@other.io", "https://other.io"), mk("d@nosite.io", "")],
    [],
  );
  assertEquals([m.get("a@acme.com"), m.get("b@acme.com"), m.get("c@other.io"), m.get("d@nosite.io")], ["https://acme.com", "", "https://other.io", ""]);
});

Deno.test("assignWebsites: a company that is already a prospect (any URL spelling) gets no site", () => {
  const m = assignWebsites([mk("a@acme.com", "https://acme.com")], ["http://www.Acme.com/about"]);
  assertEquals(m.get("a@acme.com"), "");
});

Deno.test("leadToProspectRow: pending + approved, real contact fields, no fit score", () => {
  const row = leadToProspectRow(mk("a@acme.com", "https://acme.com"), {
    clientId: "c1", campaignId: "k1", website: "https://acme.com", approvedAt: "2026-10-09T00:00:00Z", approvedBy: "u1",
  });
  assertEquals(row.status, "pending");
  assertEquals(row.source, "outbound");
  assertEquals(row.campaign_id, "k1");
  assertEquals(row.contact_first_name, "A");
  assertEquals(row.personalization_hook, "met");
  assertEquals(row.name, "Acme");
  assert(!("icp_fit_score" in row));
});
