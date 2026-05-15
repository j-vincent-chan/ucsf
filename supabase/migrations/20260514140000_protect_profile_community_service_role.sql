-- Allow service_role (server-side admin client) to reassign community_id without JWT is_admin().
-- Keeps end-user rule: only admins can change assignment when using authenticated sessions.

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
       and not public.is_admin() then
      raise exception 'Only admins can change community assignment';
    end if;
  end if;
  return new;
end;
$$;
