-- The strip_in_depth_label trigger only fired for content_type = 'social_post'.
-- Introductory approval drafts (generate-approval-draft) are stored as
-- '<platform>_post' (e.g. linkedin_post), so their "In depth" label line was
-- never stripped -- found live on Hey Girl Hey's intro LinkedIn post.

create or replace function public.trg_strip_in_depth_label()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_social boolean := new.content_type in ('social_post', 'linkedin_post', 'facebook_post', 'instagram_post', 'twitter_post');
begin
  if not is_social then
    return new;
  end if;
  if tg_table_name = 'content_calendar' or tg_table_name = 'generated_content' then
    new.content := public.strip_in_depth_label(new.content);
  elsif tg_table_name = 'content_approvals' then
    new.full_content := public.strip_in_depth_label(new.full_content);
    new.content_preview := public.strip_in_depth_label(new.content_preview);
  end if;
  return new;
end $$;

-- Backfill: re-save rows still carrying the label so the trigger cleans them.
update public.content_approvals
   set full_content = full_content
 where content_type in ('linkedin_post', 'facebook_post', 'instagram_post', 'twitter_post');
update public.content_calendar
   set content = content
 where content_type in ('linkedin_post', 'facebook_post', 'instagram_post', 'twitter_post');
update public.generated_content
   set content = content
 where content_type in ('linkedin_post', 'facebook_post', 'instagram_post', 'twitter_post');
