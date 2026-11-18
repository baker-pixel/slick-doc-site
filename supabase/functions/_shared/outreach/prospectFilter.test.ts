import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { filterProspectCandidates, isNonProspectDomain } from "./prospectFilter.ts";

Deno.test("drops the non-prospects Resonant's first batch actually contained", () => {
  for (const u of [
    "http://www.techcrunch.com", "http://www.wired.com", "http://www.twitter.com",
    "http://www.ycombinator.com", "http://www.upwork.com", "http://www.technologyreview.com",
    "http://www.towardsdatascience.com",
  ]) assert(isNonProspectDomain(u), u);
});

Deno.test("matches subdomains and bare hosts, ignores www and case", () => {
  assert(isNonProspectDomain("https://blog.medium.com/post"));
  assert(isNonProspectDomain("MEDIUM.com"));
  assert(isNonProspectDomain("https://WWW.Forbes.com/x"));
});

Deno.test("does not over-match lookalike or unrelated domains", () => {
  for (const u of ["https://notmedium.com", "https://usebraintrust.com", "https://avenuecode.com", "https://xcorp.io", "https://mycrunchbase.co"]) {
    assert(!isNonProspectDomain(u), u);
  }
});

Deno.test("empty / garbage input is kept (the scorer decides), never throws", () => {
  assertEquals(isNonProspectDomain(""), false);
  assertEquals(isNonProspectDomain(null), false);
  assertEquals(isNonProspectDomain("::::"), false);
});

Deno.test("filterProspectCandidates splits kept and dropped, preserving order", () => {
  const { kept, dropped } = filterProspectCandidates([
    { name: "A", website_url: "https://acme.io" },
    { name: "B", website_url: "https://wired.com" },
    { name: "C", website_url: "https://beta.co" },
  ]);
  assertEquals(kept.map((c) => c.name), ["A", "C"]);
  assertEquals(dropped.map((c) => c.name), ["B"]);
});
