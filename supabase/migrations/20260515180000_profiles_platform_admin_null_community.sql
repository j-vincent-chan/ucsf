-- Platform admins: no tenant (community_id NULL). Editors must remain in a workspace.

alter table public.profiles
  alter column community_id drop not null;

alter table public.profiles
  add constraint profiles_community_required_for_editors check (
    (role = 'editor'::public.profile_role and community_id is not null)
    or (role = 'admin'::public.profile_role)
  );
