-- Seeded dev admin (admin@community-signal.local) should not be tied to ImmunoX after platform-admin model.
-- Requires 20260515180500_protect_profile_community_allow_sql_superuser.sql so this UPDATE works in SQL Editor / migrations.
-- Safe if the user does not exist or email differs (no-op).

update public.profiles p
set community_id = null
from auth.users u
where u.id = p.id
  and p.role = 'admin'::public.profile_role
  and lower(coalesce(u.email, '')) = 'admin@community-signal.local';
