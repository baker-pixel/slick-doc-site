import { groupAlerts, type DigestAlert } from "./alertDigest.ts";

const eq = (a: unknown, b: unknown) => {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
};
const mk = (id: string, over: Partial<DigestAlert> = {}): DigestAlert => ({
  id, title: "facebook post failed on the platform", message: "Account needs to be reconnected",
  source: "postforme-webhook", created_at: "2026-11-04T09:00:00Z",
  metadata: { client_account_id: "c1", title: "Facebook Post" }, ...over,
});

Deno.test("identical alerts collapse into one row with a count", () => {
  const g = groupAlerts([mk("a"), mk("b"), mk("c"), mk("d"), mk("e"), mk("f")]);
  eq(g.length, 1);
  eq(g[0].count, 6);
  eq(g[0].alert.id, "a"); // newest kept
});

Deno.test("different clients, posts or sources stay separate", () => {
  const g = groupAlerts([
    mk("a"),
    mk("b", { metadata: { client_account_id: "c2", title: "Facebook Post" } }),
    mk("c", { metadata: { client_account_id: "c1", title: "Other post" } }),
    mk("d", { source: "postforme-publish-post" }),
  ]);
  eq(g.length, 4);
});
