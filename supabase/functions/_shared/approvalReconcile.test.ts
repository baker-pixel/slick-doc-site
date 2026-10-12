import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { type CalendarRowLite, type OrphanApproval, planOrphan } from "./approvalReconcile.ts";

const CLIENT = "client-1";
const approval: OrphanApproval = {
  id: "ap-1",
  content_id: "gc-approved",
  client_account_id: CLIENT,
  platform: "linkedin",
  scheduled_for: "2026-10-13T09:00:00+00:00",
};

const row = (over: Partial<CalendarRowLite>): CalendarRowLite => ({
  id: "slot-1",
  client_account_id: CLIENT,
  platform: "linkedin",
  status: "draft",
  client_approved: false,
  scheduled_for: "2026-10-13T09:00:00+00:00",
  content_id: "gc-other",
  ...over,
});

Deno.test("no calendar row at all -> insert a scheduled row", () => {
  assertEquals(planOrphan(approval, []), { action: "insert" });
});

Deno.test("replacement unapproved draft on the same day -> adopt that slot (Innermetrix LinkedIn case)", () => {
  assertEquals(planOrphan(approval, [row({})]), { action: "adopt", slotId: "slot-1" });
});

Deno.test("already linked by content_id -> nothing to do", () => {
  assertEquals(planOrphan(approval, [row({ content_id: "gc-approved", status: "scheduled", client_approved: true })]), { action: "linked" });
});

Deno.test("already linked by approval id in slot metadata -> nothing to do", () => {
  assertEquals(planOrphan(approval, [row({ content_id: null, status: "scheduled", approval_id: "ap-1" })]), { action: "linked" });
});

Deno.test("another approved post owns the day -> covered, never double-post", () => {
  assertEquals(planOrphan(approval, [row({ status: "scheduled", client_approved: true })]), { action: "covered" });
});

Deno.test("a post moved off its day (publish-now) still covers its original day", () => {
  const moved = row({ status: "published", client_approved: true, scheduled_for: "2026-10-12T09:28:00+00:00", gen_scheduled_for: "2026-10-13T09:00:00+00:00" });
  assertEquals(planOrphan(approval, [moved]), { action: "covered" });
});

Deno.test("a failed post on the day is not re-posted behind it", () => {
  assertEquals(planOrphan(approval, [row({ status: "failed", client_approved: true })]), { action: "covered" });
});

Deno.test("other platforms and other clients are ignored", () => {
  const rows = [
    row({ id: "a", platform: "facebook", status: "scheduled", client_approved: true }),
    row({ id: "b", client_account_id: "client-2", status: "scheduled", client_approved: true }),
  ];
  assertEquals(planOrphan(approval, rows), { action: "insert" });
});

Deno.test("a draft on a different day is not adopted", () => {
  assertEquals(planOrphan(approval, [row({ scheduled_for: "2026-10-20T09:00:00+00:00" })]), { action: "insert" });
});
