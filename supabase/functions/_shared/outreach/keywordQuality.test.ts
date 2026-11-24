import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { mergeAuditKeywords, normalizeKeyword, normalizeKeywords, pickKeywords, probeKeywords, type ProbeResult } from "./keywordQuality.ts";
import type { FoundCompany } from "./apolloSearch.ts";

const co = (n: number): FoundCompany[] => Array.from({ length: n }, (_, i) => ({ name: `Co ${i}`, website_url: `https://co${i}.com` }));
const r = (tag: string, found: number, rate: number | null): ProbeResult => ({
  tag, found, judged: rate === null ? 0 : found, fit: rate === null ? 0 : Math.round(found * rate), rate,
});

Deno.test("normalizeKeyword strips filler nouns", () => {
  assertEquals(normalizeKeyword("leadership coaching firms"), "leadership coaching");
  assertEquals(normalizeKeyword("behavioral analytics companies"), "behavioral analytics");
  assertEquals(normalizeKeyword("employee engagement solutions"), "employee engagement");
  assertEquals(normalizeKeyword("  talent   management SaaS "), "talent management SaaS");
});

Deno.test("normalizeKeyword keeps meaningful nouns and rejects generic/short/long", () => {
  assertEquals(normalizeKeyword("learning and development platforms"), "learning and development platforms");
  assertEquals(normalizeKeyword("software companies"), "");
  assertEquals(normalizeKeyword("AI"), "");
  assertEquals(normalizeKeyword("hr"), "");
  assertEquals(normalizeKeyword("x".repeat(61)), "");
  assertEquals(normalizeKeyword(""), "");
});

Deno.test("normalizeKeywords dedupes after normalizing, case-insensitively, in order", () => {
  assertEquals(
    normalizeKeywords(["Team development software", "executive coaching firms", "executive coaching", "software"]),
    ["Team development software", "executive coaching"],
  );
});

Deno.test("pickKeywords keeps tags at or above the bar and drops weak or narrow ones", () => {
  const results = [r("good", 20, 0.6), r("edge", 20, 0.4), r("weak", 20, 0.15), r("narrow", 3, 1)];
  assertEquals(pickKeywords(results), ["good", "edge"]);
});

Deno.test("pickKeywords keeps an unjudged tag (judge down must not block discovery)", () => {
  assertEquals(pickKeywords([r("a", 20, null), r("b", 20, 0.1)]), ["a"]);
});

Deno.test("pickKeywords minKeep falls back to the best judged tags only when none pass", () => {
  const results = [r("a", 20, 0.3), r("b", 20, 0.35), r("c", 20, 0)];
  assertEquals(pickKeywords(results, { minKeep: 2 }), ["b", "a"]);
  assertEquals(pickKeywords(results, { minKeep: 0 }), []);
  assertEquals(pickKeywords([r("a", 20, 0.9), r("b", 20, 0.1)], { minKeep: 2 }), ["a"]);
});

Deno.test("probeKeywords probes each tag once and computes rates", async () => {
  const searched: string[] = [];
  const out = await probeKeywords(["a", "b"], {
    search: (t) => { searched.push(t); return Promise.resolve(co(10)); },
    judge: (t) => Promise.resolve(t === "a" ? 8 : 2),
  });
  assertEquals(searched, ["a", "b"]);
  assertEquals(out.map((x) => [x.tag, x.found, x.judged, x.rate]), [["a", 10, 10, 0.8], ["b", 10, 10, 0.2]]);
});

Deno.test("probeKeywords stops when the search throws (credits/auth/rate limit)", async () => {
  const out = await probeKeywords(["a", "b", "c"], {
    search: (t) => (t === "b" ? Promise.reject(new Error("429")) : Promise.resolve(co(10))),
    judge: () => Promise.resolve(5),
  });
  assertEquals(out.map((x) => x.tag), ["a"]);
});

Deno.test("probeKeywords records a judge failure as unjudged, and skips judging tiny samples", async () => {
  const out = await probeKeywords(["a", "tiny"], {
    search: (t) => Promise.resolve(co(t === "tiny" ? 2 : 10)),
    judge: () => Promise.reject(new Error("model down")),
  });
  assertEquals(out[0].rate, null);
  assertEquals(out[0].found, 10);
  assertEquals([out[1].found, out[1].judged, out[1].rate], [2, 0, null]);
});

Deno.test("probeKeywords honours the per-run limit and clamps an over-reporting judge", async () => {
  let calls = 0;
  const out = await probeKeywords(["a", "b", "c"], {
    search: () => { calls++; return Promise.resolve(co(10)); },
    judge: () => Promise.resolve(99),
  }, 2);
  assertEquals(calls, 2);
  assertEquals(out[0].fit, 10);
  assertEquals(out[0].rate, 1);
});

Deno.test("mergeAuditKeywords keeps passed tags and untested ones, never a pruned tag in its original wording", () => {
  const before = ["employee engagement solutions", "team development software", "personality assessment platforms", "people analytics"];
  // probe budget reached the first three (reported normalized); only "team development software" passed
  const out = mergeAuditKeywords(before, ["team development software"], ["employee engagement", "team development software", "personality assessment platforms"]);
  assertEquals(out, ["team development software", "people analytics"]);
});

Deno.test("mergeAuditKeywords drops generic leftovers and de-duplicates", () => {
  assertEquals(mergeAuditKeywords(["software", "talent management", "Talent Management"], ["talent management"], []), ["talent management"]);
  assertEquals(mergeAuditKeywords([], [], []), []);
});
