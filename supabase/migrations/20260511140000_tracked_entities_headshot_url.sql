-- Public URL for investigator headshot (bulk Excel/CSV import or manual edit).
alter table public.tracked_entities
  add column if not exists headshot_url text null;

comment on column public.tracked_entities.headshot_url is
  'HTTPS URL for profile/headshot image (e.g. LinkedIn photo URL from bulk import).';
