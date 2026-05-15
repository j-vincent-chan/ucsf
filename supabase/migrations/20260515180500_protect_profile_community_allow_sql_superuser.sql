-- SQL Editor / migration runs have no JWT (auth.uid() is null). Without this, clearing
-- community_id for platform admins fails with "Only admins can change community assignment".
-- Still enforced for authenticated requests: service_role bypass unchanged; is_admin() when uid set.

create or replace function public.protect_profile_community()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.community_id is distinct from old.community_id then
    if old.community_id is not null
       and coalesce(auth.role(), '') is distinct from 'service_role'
       and auth.uid() is not null
       and not public.is_admin() then
      raise exception 'Only admins can change community assignment';
    end if;
  end if;
  return new;
end;
$$;
