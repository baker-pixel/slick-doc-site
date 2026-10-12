-- Supabase advisor `unindexed_foreign_keys`: foreign keys with no covering index
-- make joins, ON DELETE CASCADE checks and RLS ownership lookups scan the whole
-- table. Create a btree index for every public FK that has none. Additive and
-- idempotent; names are deterministic (idx_<table>_<cols>_fk).
do $$
declare r record;
begin
  for r in
    select
      left('idx_' || cl.relname || '_' ||
           (select string_agg(a.attname, '_' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) || '_fk', 63) as idx_name,
      cl.relname as tbl,
      (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
         from unnest(c.conkey) with ordinality k(attnum, ord)
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
      )
  loop
    execute format('create index if not exists %I on public.%I (%s)', r.idx_name, r.tbl, r.cols);
  end loop;
end $$;
