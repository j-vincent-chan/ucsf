-- Lab website: distinct source type + optional PI lab URL on watchlist (for discovery / validation).

alter type public.source_type add value if not exists 'lab_website';

alter table public.tracked_entities
  add column if not exists lab_website text;

comment on column public.tracked_entities.lab_website is
  'Principal investigator lab or group homepage. Discovery may ingest RSS from common paths when set; also used to contextualize PubMed and news.';
