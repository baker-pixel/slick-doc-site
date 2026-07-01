-- Create generated-images bucket (idempotent) and add public read policy
insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', true)
on conflict (id) do update set public = true;

-- Allow public read on all objects in the bucket
drop policy if exists "Public read generated-images" on storage.objects;
create policy "Public read generated-images"
  on storage.objects for select
  using (bucket_id = 'generated-images');

-- Allow service role to insert/update (edge functions use service role)
drop policy if exists "Service role write generated-images" on storage.objects;
create policy "Service role write generated-images"
  on storage.objects for insert
  with check (bucket_id = 'generated-images');
