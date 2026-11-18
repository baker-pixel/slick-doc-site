import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { type AutoApproveCandidate, type AutoApproveClient, autoApproveEnabled, autoApproveReason, selectForAutoApproval } from "./autoApprove.ts";

const client: AutoApproveClient = {
  status: "active",
  paused_for_billing: false,
  hasMailbox: true,
  prospectingEnabled: true,
  outreach_settings: {},
  minFit: 60,
};

const lead = (over: Partial<AutoApproveCandidate> = {}): AutoApproveCandidate => ({
  id: "p1",
  client_id: "c1",
  status: "discovered",
  approved_at: null,
  source: "outbound",
  campaign_id: null,
  submission_id: null,
  email: "owner@acme.com",
  icp_fit_score: 80,
  context_profile: { retry: false },
  created_at: "2026-11-01T09:00:00Z",
  ...over,
});

Deno.test("a scored, enriched, emailed lead for a sending client is approvable", () => {
  assertEquals(autoApproveReason(lead(), client), "ok");
});

Deno.test("only discovered outbound leads are ever auto-approved", () => {
  for (const over of [
    { status: "pending" }, { status: "nurture" }, { source: "inbound" }, { source: null },
    { campaign_id: "camp" }, { submission_id: "sub" }, { approved_at: "2026-11-01T00:00:00Z" },
  ]) assertEquals(autoApproveReason(lead(over), client), "not_discovered_outbound");
});

Deno.test("needs a plausible email", () => {
  for (const email of [null, "", "no-at-sign", "a@b", "two words@x.com"]) {
    assertEquals(autoApproveReason(lead({ email }), client), "no_valid_email");
  }
});

Deno.test("needs a fit score at or above the client's minimum", () => {
  assertEquals(autoApproveReason(lead({ icp_fit_score: null }), client), "not_scored");
  assertEquals(autoApproveReason(lead({ icp_fit_score: 59 }), client), "below_min_fit");
  assertEquals(autoApproveReason(lead({ icp_fit_score: 60 }), client), "ok");
  assertEquals(autoApproveReason(lead({ icp_fit_score: 59 }), { ...client, minFit: 40 }), "ok");
});

Deno.test("needs finished enrichment (a failed scan that will retry does not count)", () => {
  assertEquals(autoApproveReason(lead({ context_profile: null }), client), "not_enriched");
  assertEquals(autoApproveReason(lead({ context_profile: { retry: true } }), client), "not_enriched");
  // gave up after retries: scoring ran from name/type/city, still approvable
  assertEquals(autoApproveReason(lead({ context_profile: { retry: false } }), client), "ok");
});

Deno.test("client must be able to send", () => {
  assertEquals(autoApproveReason(lead(), { ...client, status: "paused" }), "client_inactive");
  assertEquals(autoApproveReason(lead(), { ...client, paused_for_billing: true }), "billing_paused");
  assertEquals(autoApproveReason(lead(), { ...client, prospectingEnabled: false }), "plan_has_no_prospecting");
  assertEquals(autoApproveReason(lead(), { ...client, hasMailbox: false }), "no_mailbox");
});

Deno.test("auto_approve=false opts a client out; anything else leaves it on", () => {
  assertEquals(autoApproveEnabled({ auto_approve: false }), false);
  assertEquals(autoApproveEnabled({ auto_approve: true }), true);
  assertEquals(autoApproveEnabled({}), true);
  assertEquals(autoApproveEnabled(null), true);
  assertEquals(autoApproveReason(lead(), { ...client, outreach_settings: { auto_approve: false } }), "auto_approve_off");
});

Deno.test("selection is best fit first, oldest on a tie, capped by the budget", () => {
  const leads = [
    lead({ id: "a", email: "a@x.com", icp_fit_score: 70, created_at: "2026-11-02T00:00:00Z" }),
    lead({ id: "b", email: "b@x.com", icp_fit_score: 90 }),
    lead({ id: "c", email: "c@x.com", icp_fit_score: 70, created_at: "2026-11-01T00:00:00Z" }),
    lead({ id: "d", email: "d@x.com", icp_fit_score: 10 }), // below min fit
  ];
  assertEquals(selectForAutoApproval(leads, client, 3).map((p) => p.id), ["b", "c", "a"]);
  assertEquals(selectForAutoApproval(leads, client, 2).map((p) => p.id), ["b", "c"]);
  assertEquals(selectForAutoApproval(leads, client, 0), []);
});

Deno.test("selection never approves a duplicate email or one already in the funnel", () => {
  const leads = [
    lead({ id: "a", email: "Same@x.com", icp_fit_score: 90 }),
    lead({ id: "b", email: "same@x.com", icp_fit_score: 80 }),
    lead({ id: "c", email: "taken@x.com", icp_fit_score: 85 }),
    lead({ id: "d", email: "new@x.com", icp_fit_score: 70 }),
  ];
  assertEquals(selectForAutoApproval(leads, client, 10, new Set(["taken@x.com"])).map((p) => p.id), ["a", "d"]);
});
