-- Lightweight flag for list queries: avoid loading multi-megabyte digest_cover JSON on every digest row.
alter table public.source_items
  add column if not exists digest_cover_has_asset boolean
  generated always as (digest_cover is not null) stored;
