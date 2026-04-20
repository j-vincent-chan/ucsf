
grant execute on function public.admin_set_profile_login(uuid, text, text) to service_role;
-- App login identifiers + bcrypt hashes on profiles (pgcrypto).
-- Plain passwords are never stored; verify with crypt(plain, password_hash).
-- Supabase often installs pgcrypto in schema "extensions"; SECURITY DEFINER
-- functions must include that schema in search_path (or qualify extensions.crypt).

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists login_username text;

alter table public.profiles
  add column if not exists password_hash text;

create unique index if not exists profiles_login_username_lower_idx
  on public.profiles (lower(login_username))
  where login_username is not null;

-- Hide password_hash from the PostgREST API for authenticated users.
revoke select on public.profiles from authenticated;
grant select (
  id,
  full_name,
  role,
  created_at,
  updated_at,
  login_username
) on public.profiles to authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name, role) on public.profiles to authenticated;

-- Match login_username + password; returns profile id (auth user id). Server-only (service_role).
create or replace function public.profile_password_matches(p_username text, p_plain text)
returns uuid
language sql
security definer
set search_path = public, extensions
stable
as $$
  select id
  from public.profiles
  where login_username is not null
    and password_hash is not null
    and lower(trim(login_username)) = lower(trim(p_username))
    and password_hash = crypt(p_plain, password_hash)
  limit 1;
$$;

revoke all on function public.profile_password_matches(text, text) from public;
grant execute on function public.profile_password_matches(text, text) to service_role;

-- Set login + hash for a profile row (service_role / seed only).
create or replace function public.admin_set_profile_login(
  p_user_id uuid,
  p_username text,
  p_plain_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n int;
begin
  update public.profiles
  set
    login_username = trim(p_username),
    password_hash = crypt(p_plain_password, gen_salt('bf'::text)),
    updated_at = now()
  where id = p_user_id;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'profile not found for user %', p_user_id;
  end if;
end;
$$;

revoke all on function public.admin_set_profile_login(uuid, text, text) from public;