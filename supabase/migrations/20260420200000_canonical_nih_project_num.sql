-- Collapse NIH ProjectNum variants (type prefix 3/5/…, supplement S1/S2/…) to one parent key
-- so signal_group_key matches across supplements and competing segments for the same core award.

create or replace function public.canonical_nih_project_num(p_raw text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  s text;
begin
  if p_raw is null or length(btrim(p_raw)) = 0 then
    return null;
  end if;
  s := upper(regexp_replace(btrim(p_raw), '\s+', '', 'g'));
  s := regexp_replace(s, 'S[0-9]+$', '', 'i');
  s := regexp_replace(s, '^([1-9])([A-Z].*)$', '\2');
  return s;
end;
$$;

comment on function public.canonical_nih_project_num(text) is
  'Strips NIH application-type leading digit and trailing S-supplement suffix for dedup keys; must match src/lib/nih-project-num.ts.';

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
    nih_norm := public.canonical_nih_project_num(p_nih_project_num);
    if nih_norm is null or length(btrim(nih_norm)) = 0 then
      nih_norm := upper(regexp_replace(btrim(p_nih_project_num), '\s+', '', 'g'));
    end if;
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
