import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildAttention, cronHealth, describeSchedule, expectedGapMs, headline, JOBS, nextRun, plainResult, type CronRow } from "./commandCenter.ts";

const NOW = new Date("2026-10-13T12:00:00Z");

Deno.test("describeSchedule reads the schedules in use as plain English", () => {
  assertEquals(describeSchedule("* * * * *"), "Every minute");
  assertEquals(describeSchedule("*/15 * * * *"), "Every 15 minutes");
  assertEquals(describeSchedule("30 * * * *"), "Every hour at :30");
  assertEquals(describeSchedule("17 */3 * * *"), "Every 3 hours at :17");
  assertEquals(describeSchedule("0 7 * * *"), "Daily at 07:00 UTC");
  assertEquals(describeSchedule("0 6 * * 1"), "Mondays at 06:00 UTC");
  assertEquals(describeSchedule("0 7 1 * *"), "Monthly on day 1 at 07:00 UTC");
  assertEquals(describeSchedule("1-5 2 * * 1,3"), "1-5 2 * * 1,3"); // unknown shape: show raw rather than lie
});

Deno.test("nextRun handles minutes, hours, weekdays and months", () => {
  assertEquals(nextRun("*/15 * * * *", NOW)?.toISOString(), "2026-10-13T12:15:00.000Z");
  assertEquals(nextRun("17 */3 * * *", NOW)?.toISOString(), "2026-10-13T12:17:00.000Z");
  assertEquals(nextRun("0 7 * * *", NOW)?.toISOString(), "2026-10-14T07:00:00.000Z");
  assertEquals(nextRun("0 6 * * 1", NOW)?.toISOString(), "2026-10-19T06:00:00.000Z"); // next Monday
  assertEquals(nextRun("0 7 1 * *", NOW)?.toISOString(), "2026-11-01T07:00:00.000Z");
  assertEquals(nextRun("not a cron", NOW), null);
});

Deno.test("expectedGapMs", () => {
  assertEquals(expectedGapMs("*/10 * * * *", NOW), 10 * 60_000);
  assertEquals(expectedGapMs("0 * * * *", NOW), 3_600_000);
  assertEquals(expectedGapMs("0 6 * * 1", NOW), 7 * 86_400_000);
});

const job = (over: Partial<CronRow>): CronRow => ({
  jobname: "x", schedule: "*/10 * * * *", active: true,
  last_start: "2026-10-13T11:55:00Z", last_end: "2026-10-13T11:55:01Z", last_status: "succeeded", last_message: "", fn: null, ...over,
});

Deno.test("cronHealth", () => {
  assertEquals(cronHealth(job({}), NOW).state, "ok");
  assertEquals(cronHealth(job({ active: false }), NOW).state, "paused");
  assertEquals(cronHealth(job({ last_status: "failed", last_message: "boom" }), NOW), { state: "failed", note: "boom" });
  assertEquals(cronHealth(job({ last_start: "2026-10-13T09:00:00Z" }), NOW).state, "late");
  assertEquals(cronHealth(job({ last_start: null }), NOW).state, "late"); // a 10-minute job that never fired
  assertEquals(cronHealth(job({ schedule: "0 6 * * 1", last_start: null }), NOW).state, "idle"); // weekly, simply not due
});

const client = (over: Record<string, unknown> = {}) => ({
  id: "c1", name: "Acme", status: "active", subscription: "active", payment_failed_at: null, paused_for_billing: false,
  website: "https://acme.test",
  cycle: { no: 1, status: "active", steps: { learn: { status: "ok" } }, issues: [] },
  social: { placeholders: 0, held_for_admin: 0, awaiting_client: 0, failed: 0, images_pending: 0 },
  prospects: { to_review: 0, to_review_no_email: 0 },
  insights: { seo_score: 80, seo_at: "2026-10-01T00:00:00Z" },
  connections: { channels: ["linkedin"], mailbox: true },
  ...over,
});
const overview = (clients: unknown[], over: Record<string, unknown> = {}) => ({
  cron: [], failed_http_24h: { count: 0, recent: [] }, alerts: [], queues: { emails_failed_24h: 0 }, clients, ...over,
}) as Parameters<typeof buildAttention>[0];

Deno.test("a healthy client produces nothing to attend to", () => {
  const items = buildAttention(overview([client()]), NOW);
  assertEquals(items, []);
  assertEquals(headline(items).level, "ok");
});

Deno.test("attention surfaces the problems an owner cares about, worst first", () => {
  const items = buildAttention(overview([client({
    social: { placeholders: 3, held_for_admin: 2, awaiting_client: 5, failed: 1, images_pending: 4 },
    prospects: { to_review: 20, to_review_no_email: 20 },
    insights: { seo_score: null, seo_at: null },
  })], { failed_http_24h: { count: 2, recent: [{ status: 401, body: "no auth" }] } }), NOW);

  assertEquals(items[0].level, "critical");
  assertEquals(items[0].title, "Acme: 1 post failed to publish");
  const titles = items.map((i) => i.title);
  assertEquals(titles.includes("Acme: 3 posts still need captions"), true);
  assertEquals(titles.includes("Acme: 2 drafts held for your review"), true);
  assertEquals(titles.includes("Acme: 20 prospects found, none has an email yet"), true);
  assertEquals(titles.includes("2 scheduled calls were refused or crashed in the last 24 hours"), true);
  assertEquals(items.find((i) => i.title.includes("still need captions"))?.action?.job, "write_captions");
  assertEquals(items.find((i) => i.title.includes("no SEO audit"))?.action?.job, "seo_audit");
  const order = items.map((i) => i.level);
  assertEquals(order, [...order].sort((a, b) => ({ critical: 0, warning: 1, info: 2 } as Record<string, number>)[a] - ({ critical: 0, warning: 1, info: 2 } as Record<string, number>)[b]));
  assertEquals(headline(items).level, "critical");
});

Deno.test("posts queued for a network with no connected account are flagged before they fail", () => {
  const items = buildAttention(overview([client({ orphan_platforms: { linkedin: 2 } })]), NOW);
  assertEquals(items.length, 1);
  assertEquals(items[0].title, "Acme: 2 upcoming posts for Linkedin, but no Linkedin account is connected");
  assertEquals(items[0].level, "warning");
  assertEquals(buildAttention(overview([client({ orphan_platforms: {} })]), NOW), []);
});

Deno.test("a paying client with no cycle, or a payment failure, is flagged", () => {
  assertEquals(buildAttention(overview([client({ cycle: null })]), NOW)[0].action?.job, "build_cycle");
  const pay = buildAttention(overview([client({ payment_failed_at: "2026-10-12T00:00:00Z" })]), NOW);
  assertEquals(pay[0].level, "critical");
});

Deno.test("only error-level alerts are surfaced, de-duplicated", () => {
  const a = { severity: "error", type: "t", title: "Same", message: "m" };
  const items = buildAttention(overview([], { alerts: [a, a, { ...a, severity: "info", title: "Quiet" }] }), NOW);
  assertEquals(items.length, 1);
});

Deno.test("the job catalogue is safe to expose", () => {
  for (const j of Object.values(JOBS)) {
    assertEquals(j.fn.startsWith("http"), false);
    if (j.scope === "client") assertEquals(j.body("abc").client_id, "abc");
  }
  // Jobs with real-world side effects must ask first.
  assertEquals(typeof JOBS.send_emails.confirm, "string");
  assertEquals(typeof JOBS.publish_posts.confirm, "string");
});

Deno.test("plainResult", () => {
  assertEquals(plainResult(JOBS.write_captions, { processed: 4, successful: 4, failed: 0 }), "Wrote 4 caption(s).");
  assertEquals(plainResult(JOBS.schedule_posts, { total_created: 7 }), "Created 7 new post slot(s).");
  assertEquals(plainResult(JOBS.build_cycle, { skipped: "cycle already active" }), "Skipped: cycle already active.");
});
