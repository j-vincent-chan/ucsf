-- Restrict profile directory reads to own row + same-workspace teammates (multi-tenant beta).
-- Uses SECURITY DEFINER helper to avoid RLS recursion (policy on profiles cannot subquery profiles).

create or replace function public.current_profile_community_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.community_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_profile_community_id() from public;
grant execute on function public.current_profile_community_id() to authenticated;

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_same_community" on public.profiles;

create policy "profiles_select_same_community"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or community_id is not distinct from public.current_profile_community_id()
  );
