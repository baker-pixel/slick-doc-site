import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { decideProspectGate, repairPreferencesLinks } from "./outreachEmail.ts";

Deno.test("gate: nurture prospect on a fresh step sends", () => {
  assertEquals(decideProspectGate({ status: "nurture", drip_step: 1 }, 2), { action: "send" });
});

Deno.test("gate: replied / bounced / unsubscribed / converted / rejected / exhausted cancel", () => {
  for (const status of ["replied", "bounced", "unsubscribed", "converted", "rejected", "exhausted"]) {
    assertEquals(decideProspectGate({ status, drip_step: 0 }, 1).action, "cancel", status);
  }
});

Deno.test("gate: paused / pending / discovered hold instead of cancelling", () => {
  for (const status of ["paused", "pending", "discovered"]) {
    assertEquals(decideProspectGate({ status, drip_step: 0 }, 1).action, "hold", status);
  }
});

Deno.test("gate: a step at or below drip_step is superseded, not re-sent", () => {
  assertEquals(decideProspectGate({ status: "nurture", drip_step: 3 }, 2).action, "cancel");
  assertEquals(decideProspectGate({ status: "nurture", drip_step: 3 }, 3).action, "cancel");
  assertEquals(decideProspectGate({ status: "nurture", drip_step: 3 }, 4).action, "send");
});

Deno.test("gate: deleted prospect cancels; null drip_step counts as 0", () => {
  assertEquals(decideProspectGate(undefined, 1).action, "cancel");
  assertEquals(decideProspectGate({ status: "nurture", drip_step: null }, 1).action, "send");
});

Deno.test("repairPreferencesLinks: adds a token to tokenless preferences links only", () => {
  const email = "a@b.com";
  const tok = btoa(email);
  const html = `<a href="https://orangedoormarketing.com/email-preferences?email=a%40b.com">x</a>`;
  assertEquals(
    repairPreferencesLinks(html, email),
    `<a href="https://orangedoormarketing.com/email-preferences?email=a%40b.com&token=${tok}">x</a>`,
  );
  const already = `<a href="https://orangedoormarketing.com/email-preferences?email=a%40b.com&token=${tok}">x</a>`;
  assertEquals(repairPreferencesLinks(already, email), already);
  const other = `<a href="https://example.com/page">x</a>`;
  assertEquals(repairPreferencesLinks(other, email), other);
});
