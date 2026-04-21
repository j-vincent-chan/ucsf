-- NIH RePORTER: same Program/Project number can appear for multiple PIs (overall + subprojects).
-- Store ProjectNum and use signal_group_key = community|nih:{PROJECTNUM} so Discover links investigators
-- onto one row instead of duplicating per faculty.

alter table public.source_items
  add column if not exists nih_project_num text;

comment on column public.source_items.nih_project_num is
  'NIH RePORTER ProjectNum when source_type=reporter; drives cross-investigator dedup via signal_group_key.';

create index if not exists source_items_nih_project_num_idx
  on public.source_items (nih_project_num)
  where nih_project_num is not null;

drop function if exists public.compute_signal_group_key(uuid, text, timestamptz, text);

create or replace function public.compute_signal_group_key(
  p_community_id uuid,
  p_title text,
  p_published timestamptz,
  p_source_url text,
  p_source_type public.source_type,
  p_nih_project_num text
) returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  nu text;
  day_utc text;
  url_hash text;
  nih_norm text;
begin
  if p_source_type::text = 'reporter'
     and p_nih_project_num is not null
     and length(btrim(p_nih_project_num)) > 0 then
    nih_norm := upper(regexp_replace(btrim(p_nih_project_num), '\s+', '', 'g'));
    return coalesce(p_community_id::text, '') || '|nih:' || nih_norm;
  end if;

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
    new.source_url,
    new.source_type,
    new.nih_project_num
  );
  return new;
end;
$$;

drop trigger if exists source_items_duplicate_key on public.source_items;

create trigger source_items_duplicate_key
  before insert or update of title, tracked_entity_id, published_at, community_id, source_url, source_type, nih_project_num
  on public.source_items
  for each row execute function public.source_items_set_duplicate_key();

-- Backfill ProjectNum from title tail "(5U19AI077439-19)" for existing reporter rows
update public.source_items
set nih_project_num = upper(
  trim(
    (regexp_match(title, '\(([A-Z0-9]+-[0-9A-Za-z,-]+)\)\s*$'))[1]
  )
)
where source_type = 'reporter'
  and nih_project_num is null
  and title ~ '\([A-Z0-9]+-[0-9A-Za-z,-]+\)\s*$';

update public.source_items
set signal_group_key = public.compute_signal_group_key(
  community_id,
  title,
  published_at,
  source_url,
  source_type,
  nih_project_num
)
where source_type = 'reporter'
  and nih_project_num is not null;
