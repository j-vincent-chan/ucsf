-- Platform admin = admin role with no workspace. Only they may use global Workspaces APIs (RLS) and
-- reassign profiles.community_id for others. Tenant/workspace admins keep is_admin() for other features.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'::public.profile_role
      and p.community_id is null
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

drop policy if exists "communities_select_admin" on public.communities;
create policy "communities_select_admin"
  on public.communities for select
  to authenticated
  using (public.is_platform_admin());

drop policy if exists "communities_insert_admin" on public.communities;
create policy "communities_insert_admin"
  on public.communities for insert
  to authenticated
  with check (public.is_platform_admin());

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_platform_admin());

create or replace function public.protect_profile_community()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.community_id is distinct from old.community_id then
    -- First workspace assignment on another user's profile
    if old.community_id is null
       and new.community_id is not null
       and new.id is distinct from auth.uid()
       and coalesce(auth.role(), '') is distinct from 'service_role'
       and auth.uid() is not null
       and not public.is_platform_admin() then
      raise exception 'Only platform administrators can assign users to a workspace';
    end if;

    -- Changing or clearing an existing tenant attachment
    if old.community_id is not null
       and coalesce(auth.role(), '') is distinct from 'service_role'
       and auth.uid() is not null
       and not public.is_platform_admin()
       and not (
         auth.uid() = new.id
         and new.community_id is null
         and exists (
           select 1
           from public.profiles p
           where p.id = auth.uid()
             and p.role = 'admin'::public.profile_role
         )
       ) then
      raise exception 'Only platform administrators can change community assignment';
    end if;
  end if;
  return new;
end;
$$;
