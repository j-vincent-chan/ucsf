-- Canonical PubMed PMID URLs before hashing signal_group_key so the same PMID always maps to one key
-- (fixes duplicate Signals when URLs differ only by trailing slash, legacy www.ncbi.nlm.nih.gov/pubmed/, or europepmc MED links).

create or replace function public.normalize_source_url_for_dedup(p_url text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  s text;
  m text[];
begin
  if p_url is null or length(trim(p_url)) < 8 then
    return null;
  end if;
  s := lower(trim(p_url));

  m := regexp_match(s, '^https?://europepmc\.org/article/med/([0-9]+)');
  if m is not null then
    return 'https://pubmed.ncbi.nlm.nih.gov/' || m[1] || '/';
  end if;

  m := regexp_match(s, 'pubmed\.ncbi\.nlm\.nih\.gov/([0-9]+)');
  if m is not null then
    return 'https://pubmed.ncbi.nlm.nih.gov/' || m[1] || '/';
  end if;

  m := regexp_match(s, '\.nih\.gov/pubmed/([0-9]+)');
  if m is not null then
    return 'https://pubmed.ncbi.nlm.nih.gov/' || m[1] || '/';
  end if;

  s := regexp_replace(s, '[#].*$', '');
  s := regexp_replace(s, '[?].*$', '');
  return s;
end;
$$;

comment on function public.normalize_source_url_for_dedup(text) is
  'Normalize URL before signal_group_key hash; PubMed article URLs (incl. legacy ncbi host and Europe PMC MED) collapse to canonical pubmed.ncbi…/PMID/.';

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

-- Backfill keys only when this project has source_items (initial schema may not be applied yet).
do $$
begin
  if to_regclass('public.source_items') is not null then
    update public.source_items
    set signal_group_key = public.compute_signal_group_key(
      community_id,
      title,
      published_at,
      source_url,
      source_type,
      nih_project_num
    );
  end if;
end $$;
