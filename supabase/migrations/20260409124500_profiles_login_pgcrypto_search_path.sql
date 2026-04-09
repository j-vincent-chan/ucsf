-- Fix: crypt()/gen_salt() live in pgcrypto; on Supabase they often resolve from schema "extensions".
-- Run this if an older revision of 20260409120000 used set search_path = public only.

create extension if not exists pgcrypto;

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
grant execute on function public.admin_set_profile_login(uuid, text, text) to service_role;
