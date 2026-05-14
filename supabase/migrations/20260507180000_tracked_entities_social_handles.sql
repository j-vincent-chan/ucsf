-- Optional social handles for @-mentions in digest / social publishing (store without @).
alter table public.tracked_entities
  add column if not exists x_handle text,
  add column if not exists bluesky_handle text;

comment on column public.tracked_entities.x_handle is 'X (Twitter) username without @, for post mentions';
comment on column public.tracked_entities.bluesky_handle is 'Bluesky handle (e.g. name.bsky.social) without @';
