import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { checkApolloContacts, peopleSearchBody, selectReachable, type ContactCheck, type FetchLike } from "./apolloContacts.ts";

const reply = (status: number, body: unknown): FetchLike => () =>
  Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

Deno.test("no people on file -> no_people", async () => {
  assertEquals((await checkApolloContacts("k", "a.com", reply(200, { people: [] }))).status, "no_people");
});

Deno.test("people with emails or unknown email flag -> reachable", async () => {
  assertEquals((await checkApolloContacts("k", "a.com", reply(200, { people: [{ id: "1", has_email: true }] }))).status, "reachable");
  // field absent: cannot tell, so do not guess unreachable
  const r = await checkApolloContacts("k", "a.com", reply(200, { people: [{ id: "1" }, { id: "2" }] }));
  assertEquals([r.status, r.people], ["reachable", 2]);
});

Deno.test("every person known to have no email -> no_email_on_file", async () => {
  const r = await checkApolloContacts("k", "a.com", reply(200, { people: [{ id: "1", has_email: false }, { id: "2", has_email: false }] }));
  assertEquals(r.status, "no_email_on_file");
  // one with an email is enough
  assertEquals((await checkApolloContacts("k", "a.com", reply(200, { people: [{ id: "1", has_email: false }, { id: "2", has_email: true }] }))).status, "reachable");
});

Deno.test("errors fail open as unknown; 429 also flags rate limiting", async () => {
  assertEquals((await checkApolloContacts("k", "a.com", reply(500, "boom"))).status, "unknown");
  assertEquals((await checkApolloContacts("k", "a.com", reply(200, "not json"))).status, "unknown");
  assertEquals((await checkApolloContacts("k", "a.com", reply(200, { nope: 1 }))).status, "unknown");
  const rl = await checkApolloContacts("k", "a.com", reply(429, "slow down"));
  assertEquals([rl.status, rl.rateLimited], ["unknown", true]);
  assertEquals((await checkApolloContacts("k", "a.com", () => Promise.reject(new Error("net")))).status, "unknown");
  assertEquals((await checkApolloContacts("k", "", reply(200, { people: [] }))).status, "unknown");
});

Deno.test("request is the free people search for the domain", async () => {
  let seen: { url: string; body: Record<string, unknown>; key: string | null } | null = null;
  const f: FetchLike = (url, init) => {
    seen = { url, body: JSON.parse(String(init.body)), key: new Headers(init.headers).get("x-api-key") };
    return Promise.resolve(new Response(JSON.stringify({ people: [] })));
  };
  await checkApolloContacts("secret", "acme.com", f);
  assert(seen !== null);
  const s = seen as { url: string; body: Record<string, unknown>; key: string | null };
  assertEquals(s.url, "https://api.apollo.io/api/v1/mixed_people/api_search");
  assertEquals(s.body.q_organization_domains_list, ["acme.com"]);
  assertEquals(s.key, "secret");
});

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ website_url: `https://c${i}.com`, i }));
const byIndex = (m: Record<number, ContactCheck["status"]>) => (it: { i: number }): Promise<ContactCheck> =>
  Promise.resolve({ status: m[it.i] ?? "reachable", people: 1 });

Deno.test("selectReachable fills the quota with reachable companies and rejects the rest it checked", async () => {
  const sel = await selectReachable(items(10), 3, byIndex({ 0: "no_people", 1: "no_people", 4: "no_email_on_file" }), { concurrency: 2 });
  assertEquals(sel.chosen.map((c) => c.i), [2, 3, 5]);
  assertEquals(sel.rejected.map((x) => [x.item.i, x.status]), [[0, "no_people"], [1, "no_people"], [4, "no_email_on_file"]]);
});

Deno.test("selectReachable never drops unknowns: they fill leftover space after reachable ones", async () => {
  const sel = await selectReachable(items(4), 3, byIndex({ 0: "unknown", 1: "no_people", 2: "reachable", 3: "reachable" }), { concurrency: 4 });
  assertEquals(sel.chosen.map((c) => c.i), [2, 3, 0]);
  assertEquals(sel.rejected.length, 1);
});

Deno.test("selectReachable stops on rate limit and passes untouched candidates through", async () => {
  let calls = 0;
  const sel = await selectReachable(items(10), 4, (it) => {
    calls++;
    return Promise.resolve(it.i === 1 ? { status: "unknown" as const, people: 0, rateLimited: true } : { status: "no_people" as const, people: 0 });
  }, { concurrency: 2 });
  assertEquals(sel.rateLimited, true);
  assertEquals(calls, 2); // stopped after the first group
  assertEquals(sel.chosen.length, 4); // unknown + untouched fill the batch
  assertEquals(sel.rejected.map((x) => x.item.i), [0]);
});

Deno.test("selectReachable honours maxChecks and never exceeds quota", async () => {
  let calls = 0;
  const sel = await selectReachable(items(50), 5, (it) => { calls++; return Promise.resolve({ status: "no_people" as const, people: 0 }); }, { concurrency: 5, maxChecks: 10 });
  assertEquals(calls, 10);
  assertEquals(sel.checks, 10);
  assertEquals(sel.chosen.length, 5); // 40 untouched pass through, capped at quota
  assertEquals(sel.rejected.length, 10);
});

Deno.test("selectReachable handles empty input", async () => {
  const sel = await selectReachable([], 5, () => Promise.resolve({ status: "reachable" as const, people: 1 }));
  assertEquals([sel.chosen.length, sel.rejected.length, sel.checks], [0, 0, 0]);
});

Deno.test("peopleSearchBody uses persona titles when given, else the seniority ladder", () => {
  const t = peopleSearchBody("a.com", { titles: ["Head of People"] });
  assertEquals(t.person_titles, ["Head of People"]);
  assertEquals("person_seniorities" in t, false);
  const s = peopleSearchBody("a.com");
  assertEquals("person_titles" in s, false);
  assert(Array.isArray(s.person_seniorities));
});

Deno.test("checkApolloContacts with titles searches by title first, then falls back to seniority", async () => {
  const bodies: Record<string, unknown>[] = [];
  const f: FetchLike = (_u, init) => {
    const b = JSON.parse(String(init.body));
    bodies.push(b);
    return Promise.resolve(new Response(JSON.stringify({ people: "person_titles" in b ? [] : [{ id: "1", has_email: true }] })));
  };
  const r = await checkApolloContacts("k", "a.com", f, ["Head of People"]);
  assertEquals(r.status, "reachable");
  assertEquals(bodies.length, 2);
  assertEquals("person_titles" in bodies[0], true);
  assertEquals("person_seniorities" in bodies[1], true);
});

Deno.test("checkApolloContacts stops after a reachable title match and on rate limit", async () => {
  let calls = 0;
  const ok: FetchLike = () => { calls++; return Promise.resolve(new Response(JSON.stringify({ people: [{ id: "1", has_email: true }] }))); };
  await checkApolloContacts("k", "a.com", ok, ["CEO"]);
  assertEquals(calls, 1);
  calls = 0;
  const rl: FetchLike = () => { calls++; return Promise.resolve(new Response("x", { status: 429 })); };
  const r = await checkApolloContacts("k", "a.com", rl, ["CEO"]);
  assertEquals([calls, r.rateLimited], [1, true]);
});
