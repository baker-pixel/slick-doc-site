-- Social posts must never carry a visible "In depth" label line. Generators now
-- strip it (stripInDepthLabel), but posts stored before that fix still had it, and
-- a trigger guarantees no code path (generator, regenerate, admin edit, import)
-- can store one again. Mirrors LABEL_LINE in supabase/functions/_shared/frontLoaded.ts.

create or replace function public.strip_in_depth_label(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when t is null then null else
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(t, '^[ \t]*(\*\*|#+[ \t]*)?in[- ]depth([ \t]+view)?[ \t]*:?[ \t]*(\*\*)?[ \t]*$', '', 'gni'),
          '[ \t]+$', '', 'gn'),
        '\n{3,}', E'\n\n', 'g'),
      E' \n\t')
  end
$$;

create or replace function public.trg_strip_in_depth_label()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'content_calendar' and new.content_type = 'social_post' then
    new.content := public.strip_in_depth_label(new.content);
  elsif tg_table_name = 'content_approvals' and new.content_type = 'social_post' then
    new.full_content := public.strip_in_depth_label(new.full_content);
    new.content_preview := public.strip_in_depth_label(new.content_preview);
  elsif tg_table_name = 'generated_content' and new.content_type = 'social_post' then
    new.content := public.strip_in_depth_label(new.content);
  end if;
  return new;
end $$;

create trigger strip_in_depth_label before insert or update of content on public.content_calendar
  for each row execute function public.trg_strip_in_depth_label();
create trigger strip_in_depth_label before insert or update of full_content, content_preview on public.content_approvals
  for each row execute function public.trg_strip_in_depth_label();
create trigger strip_in_depth_label before insert or update of content on public.generated_content
  for each row execute function public.trg_strip_in_depth_label();

-- Backfill: only posts that have not gone out. Triggers do the work on UPDATE.
update public.content_calendar set content = content
  where content_type = 'social_post' and status <> 'published'
    and content ~* '(^|\n)[ \t]*(\*\*|#+[ \t]*)?in[- ]depth';
update public.content_approvals set full_content = full_content
  where content_type = 'social_post' and status in ('pending','changes_requested','approved')
    and coalesce(publish_status,'') not in ('published','publishing')
    and (full_content ~* '(^|\n)[ \t]*(\*\*|#+[ \t]*)?in[- ]depth' or content_preview ~* '(^|\n)[ \t]*(\*\*|#+[ \t]*)?in[- ]depth');
update public.generated_content set content = content
  where content_type = 'social_post' and content ~* '(^|\n)[ \t]*(\*\*|#+[ \t]*)?in[- ]depth';
