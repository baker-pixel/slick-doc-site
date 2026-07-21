import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { recentDiscoveryRun } from "./discoveryCooldown.ts";

function fakeSupabase(rows: { created_at: string }[]) {
  return {
    from(_table: string) {
      const q: any = {
        _gte: null as string | null,
        select() { return q; },
        eq() { return q; },
        in() { return q; },
        gte(_col: string, value: string) { q._gte = value; return q; },
        limit() { return q; },
        async maybeSingle() {
          const match = rows.find((r) => r.created_at >= q._gte);
          return { data: match ? { id: "x" } : null };
        },
      };
      return q;
    },
  };
}

Deno.test("recentDiscoveryRun: true when a row falls inside the window", async () => {
  const supabase = fakeSupabase([{ created_at: new Date().toISOString() }]);
  assertEquals(await recentDiscoveryRun(supabase, "client-1", 60_000), true);
});

Deno.test("recentDiscoveryRun: false when the only row is outside the window", async () => {
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = fakeSupabase([{ created_at: old }]);
  assertEquals(await recentDiscoveryRun(supabase, "client-1", 60 * 60 * 1000), false);
});

Deno.test("recentDiscoveryRun: false with no usage rows at all", async () => {
  const supabase = fakeSupabase([]);
  assertEquals(await recentDiscoveryRun(supabase, "client-1", 60 * 60 * 1000), false);
});
