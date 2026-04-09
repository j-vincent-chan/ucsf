-- NIH RePORTER PI profile ID (numeric string) for funding discovery via api.reporter.nih.gov

alter table public.tracked_entities
  add column if not exists nih_profile_id text;

comment on column public.tracked_entities.nih_profile_id is
  'NIH RePORTER project investigator profile ID; when set, Discover fetches recent NIH awards for this PI.';
