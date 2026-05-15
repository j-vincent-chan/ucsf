-- Let app admins manage tenants without service_role (fixes RLS on communities INSERT from Server Actions).

drop policy if exists "communities_select_admin" on public.communities;
create policy "communities_select_admin"
  on public.communities for select
  to authenticated
  using (public.is_admin());

drop policy if exists "communities_insert_admin" on public.communities;
create policy "communities_insert_admin"
  on public.communities for insert
  to authenticated
  with check (public.is_admin());

-- Admin workspace UI: list all profiles for assignment (OR with existing same-community policy).
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());
