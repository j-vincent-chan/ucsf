-- X OAuth 2.0 user tokens for posting (written only via service-role API routes).
alter table public.profiles
  add column if not exists x_oauth jsonb;

comment on column public.profiles.x_oauth is 'X/Twitter OAuth 2.0 token bundle (access/refresh); server-only; never expose to client.';
