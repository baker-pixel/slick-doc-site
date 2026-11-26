import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DIGEST_SEVERITIES,
  groupAlerts,
  severityColor,
  staleJobAlert,
} from "./alertDigest.ts";

Deno.test("digest severities include critical and high, never warning or info", () => {
  // stripe-webhook writes duplicate-payment alerts as critical; stalled-workflow alerts are high.
  assertEquals([...DIGEST_SEVERITIES].sort(), ["critical", "error", "high"]);
  assert(!(DIGEST_SEVERITIES as readonly string[]).includes("warning"));
  assert(!(DIGEST_SEVERITIES as readonly string[]).includes("info"));
});

Deno.test("critical and error are red, high is amber", () => {
  assertEquals(severityColor("critical"), "#DC2626");
  assertEquals(severityColor("error"), "#DC2626");
  assertEquals(severityColor("high"), "#D97706");
});

Deno.test("stale job alert names the job and is stable for dedupe", () => {
  const job = { jobname: "weekly-client-reports", schedule: "0 13 * * 1", last_run: null, expected_gap: "7 days" };
  const a = staleJobAlert(job);
  const b = staleJobAlert({ ...job, last_run: "2026-11-01T00:00:00Z" });
  assertEquals(a.title, b.title); // title is the dedupe key, independent of last_run
  assert(a.title.includes("weekly-client-reports"));
  assert(a.message.includes("never"));
  assert(b.message.includes("2026"));
});

Deno.test("identical alerts still collapse into one group with a count", () => {
  const mk = (id: string) => ({ id, title: "t", message: "m", source: "s", created_at: "2026-11-26T00:00:00Z", metadata: {} });
  const groups = groupAlerts([mk("1"), mk("2"), mk("3")]);
  assertEquals(groups.length, 1);
  assertEquals(groups[0].count, 3);
});
