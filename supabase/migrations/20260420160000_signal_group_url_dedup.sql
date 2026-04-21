-- Stronger cross-investigator dedup:
-- 1) When source_url is present, group by MD5(normalized URL) + community (query + fragment stripped).
-- 2) Otherwise title + UTC calendar day (avoids timestamptz session-TZ drift).
-- 3) merge_duplicate_source_items_by_signal_group() consolidates existing rows that share signal_group_key.

create or replace function public.normalize_source_url_for_dedup(p_url text)
returns text
language sql
immutable
as $$
  select case
    when p_url is null or length(btrim(p_url)) < 8 then null
    else
      regexp_replace(
        regexp_replace(lower(btrim(p_url)), '[#].*$', ''),
        '[?].*$',
        ''
      )
  end;
$$;

-- Replace 3-arg version from 20260420140000
drop function if exists public.compute_signal_group_key(uuid, text, timestamptz);

create or replace function public.compute_signal_group_key(
  p_community_id uuid,
  p_title text,
  p_published timestamptz,
  p_source_url text
) returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  nu text;
  day_utc text;
  url_hash text;
begin
  nu := public.normalize_source_url_for_dedup(p_source_url);
  if nu is not null and nu ~ '^https?://' then
    url_hash := encode(
      extensions.digest(convert_to(nu, 'UTF8'), 'md5'),
      'hex'
    );
    return coalesce(p_community_id::text, '') || '|url:' || url_hash;
  end if;

  day_utc := coalesce(
    to_char((p_published at time zone 'UTC')::date, 'YYYY-MM-DD'),
    'nodate'
  );

  return coalesce(p_community_id::text, '')
    || '|'
    || regexp_replace(lower(trim(coalesce(p_title, ''))), '\s+', ' ', 'g')
    || '|'
    || day_utc;
end;
$$;

create or replace function public.source_items_set_duplicate_key()
returns trigger
language plpgsql
as $$
declare
  cid uuid;
begin
  new.duplicate_key := public.compute_duplicate_key(
    new.title,
    new.tracked_entity_id,
    new.published_at
  );
  cid := coalesce(
    new.community_id,
    (
      select te.community_id
      from public.tracked_entities te
      where te.id = new.tracked_entity_id
    )
  );
  new.signal_group_key := public.compute_signal_group_key(
    cid,
    new.title,
    new.published_at,
    new.source_url
  );
  return new;
end;
$$;

drop trigger if exists source_items_duplicate_key on public.source_items;

create trigger source_items_duplicate_key
  before insert or update of title, tracked_entity_id, published_at, community_id, source_url
  on public.source_items
  for each row execute function public.source_items_set_duplicate_key();

update public.source_items
set signal_group_key = public.compute_signal_group_key(
  community_id,
  title,
  published_at,
  source_url
);

-- One-shot: merge rows that share signal_group_key (admin-only RPC).
create or replace function public.merge_duplicate_source_items_by_signal_group()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n_merged int := 0;
  g record;
  keeper_id uuid;
  loser_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  for g in
    select signal_group_key as sgk
    from public.source_items
    where signal_group_key is not null
    group by signal_group_key
    having count(*) > 1
  loop
    select si.id into keeper_id
    from public.source_items si
    where si.signal_group_key = g.sgk
    order by si.found_at asc nulls last, si.created_at asc
    limit 1;

    for loser_id in
      select si.id
      from public.source_items si
      where si.signal_group_key = g.sgk
        and si.id <> keeper_id
    loop
      insert into public.source_item_tracked_entities (source_item_id, tracked_entity_id)
      select keeper_id, sie.tracked_entity_id
      from public.source_item_tracked_entities sie
      where sie.source_item_id = loser_id
      on conflict do nothing;

      insert into public.source_item_tracked_entities (source_item_id, tracked_entity_id)
      select keeper_id, si.tracked_entity_id
      from public.source_items si
      where si.id = loser_id
        and si.tracked_entity_id is not null
      on conflict do nothing;

      update public.summaries
      set source_item_id = keeper_id
      where source_item_id = loser_id;

      delete from public.source_items where id = loser_id;
      n_merged := n_merged + 1;
    end loop;
  end loop;

  return n_merged;
end;
$$;

grant execute on function public.merge_duplicate_source_items_by_signal_group() to authenticated;

comment on function public.merge_duplicate_source_items_by_signal_group() is
  'Merges duplicate source_items rows sharing signal_group_key; call once from admin after deploy.';
