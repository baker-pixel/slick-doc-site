-- inviteLeadToPortal stores industry = 'General' when a lead had none. That is a placeholder, not an answer, so the
-- website profile may replace it (same rule as planWrite in _shared/profile/merge.ts). Anything else a person
-- wrote is still never overwritten. Only the industry condition changes from the original function.
create or replace function public.apply_website_profile(
  p_client uuid, p_summary text, p_industry text, p_fill jsonb, p_suggestions jsonb, p_meta jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  c public.client_accounts%rowtype;
  cp jsonb;
  k text;
  v jsonb;
  filled text[] := '{}';
  allowed constant text[] := array['business_summary', 'target_audience', 'services', 'differentiators', 'location'];
begin
  select * into c from public.client_accounts where id = p_client for update;
  if not found then return jsonb_build_object('filled', '[]'::jsonb, 'error', 'client not found'); end if;
  cp := coalesce(c.context_profile, '{}'::jsonb);

  if p_summary is not null and btrim(p_summary) <> '' and coalesce(btrim(c.website_summary), '') = '' then
    update public.client_accounts set website_summary = p_summary where id = p_client;
    filled := array_append(filled, 'website_summary');
  end if;
  if p_industry is not null and btrim(p_industry) <> ''
     and (coalesce(btrim(c.industry), '') = '' or lower(btrim(c.industry)) ~ '^(general|other|n/?a|none|unknown|misc(ellaneous)?)$') then
    update public.client_accounts set industry = p_industry where id = p_client;
    filled := array_append(filled, 'industry');
  end if;

  for k, v in select * from jsonb_each(coalesce(p_fill, '{}'::jsonb)) loop
    continue when not (k = any(allowed));
    if cp -> k is null or cp -> k = 'null'::jsonb or cp -> k = '[]'::jsonb or cp -> k = '""'::jsonb
       or (jsonb_typeof(cp -> k) = 'string' and btrim(cp ->> k) = '') then
      cp := jsonb_set(cp, array[k], v, true);
      filled := array_append(filled, k);
    end if;
  end loop;

  cp := cp || jsonb_build_object(
    'website_suggestions', coalesce(p_suggestions, '{}'::jsonb),
    'website_profile', coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('filled', to_jsonb(filled))
  );
  update public.client_accounts set context_profile = cp where id = p_client;
  return jsonb_build_object('filled', to_jsonb(filled));
end $$;

revoke all on function public.apply_website_profile(uuid, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_website_profile(uuid, text, text, jsonb, jsonb, jsonb) to service_role;
