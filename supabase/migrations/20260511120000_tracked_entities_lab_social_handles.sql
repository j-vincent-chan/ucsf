-- Lab / program social handles (distinct from PI personal handles).
alter table public.tracked_entities
  add column if not exists x_lab_handle text,
  add column if not exists bluesky_lab_handle text;

comment on column public.tracked_entities.x_lab_handle is 'Lab or program X username without @';
comment on column public.tracked_entities.bluesky_lab_handle is 'Lab or program Bluesky handle without @';
