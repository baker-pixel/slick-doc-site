// deno-lint-ignore-file no-explicit-any
// Tiny chainable stand-in for the supabase-js query builder, for unit tests.
// Any filter method (eq, in, gte, ...) returns the builder; awaiting it, or
// maybeSingle/single, yields the canned rows for that table. Inserts, updates
// and upserts are recorded in `writes`. For a table that is queried several
// times with different answers, use seq(...): each from(table) consumes the
// next item, and once they run out the table answers with an empty result.
export class Seq { constructor(public items: any[]) {} }
export const seq = (...items: any[]) => new Seq(items);

export function fakeDb(tables: Record<string, any>) {
  const writes: { table: string; op: string; value: unknown }[] = [];
  const cursors = new Map<string, number>();
  const db = {
    writes,
    rpcs: [] as { fn: string; args: unknown }[],
    rpc(fn: string, args: unknown) { db.rpcs.push({ fn, args }); return Promise.resolve({ data: null, error: null }); },
    from(table: string) {
      let canned = tables[table];
      if (canned instanceof Seq) {
        const i = cursors.get(table) ?? 0;
        cursors.set(table, i + 1);
        canned = i < canned.items.length ? canned.items[i] : undefined;
      }
      const first = () => (Array.isArray(canned) ? canned[0] ?? null : canned ?? null);
      const record = (op: string) => (v: unknown) => { writes.push({ table, op, value: v }); return q; };
      const own: Record<string, any> = {
        insert: record("insert"), update: record("update"), upsert: record("upsert"),
        maybeSingle: () => Promise.resolve({ data: first(), error: null }),
        single: () => Promise.resolve({ data: first() ?? { id: "new" }, error: null }),
        then: (res: any, rej: any) => Promise.resolve({ data: canned ?? [], error: null, count: Array.isArray(canned) ? canned.length : 0 }).then(res, rej),
      };
      const q: any = new Proxy(own, { get: (t, k: string) => (k in t ? t[k] : () => q) });
      return q;
    },
  };
  return db;
}
