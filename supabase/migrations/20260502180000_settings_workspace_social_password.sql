-- Workspace display name + social publishing placeholders; sync app login bcrypt from settings password change.

alter table public.communities
  add column if not exists social_settings jsonb not null default '{}'::jsonb;

comment on column public.communities.social_settings is
  'Optional JSON: X/Bluesky/Instagram handles, LinkedIn URL, notes for Social Signals UI (not OAuth secrets).';

grant update (name, social_settings) on table public.communities to authenticated;

drop policy if exists "communities_update_own" on public.communities;
create policy "communities_update_own"
  on public.communities for update
  to authenticated
  using (id = (select p.community_id from public.profiles p where p.id = auth.uid()))
  with check (id = (select p.community_id from public.profiles p where p.id = auth.uid()));

create extension if not exists pgcrypto;

create or replace function public.set_own_profile_password(p_plain text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_plain is null or length(trim(p_plain)) < 8 then
    raise exception 'password must be at least 8 characters';
  end if;
  update public.profiles
  set
    password_hash = crypt(p_plain, gen_salt('bf'::text)),
    updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.set_own_profile_password(text) from public;
grant execute on function public.set_own_profile_password(text) to authenticated;
