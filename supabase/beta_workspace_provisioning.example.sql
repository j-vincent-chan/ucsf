-- =============================================================================
-- Beta: provision a new workspace (community) and assign users — EXAMPLE ONLY
--
-- Prefer the in-app UI (admin only): **Admin → Workspaces** at `/admin/workspaces`
-- (requires `SUPABASE_SERVICE_ROLE_KEY` on the server). Use this file for SQL-only ops.
--
-- Run fragments in Supabase SQL Editor after adapting names/UUIDs.
-- Migrations must already be applied (communities, profiles.community_id, RLS).
-- =============================================================================

-- 1) Create community (slug: lowercase, unique; used by signup metadata community_slug)
-- insert into public.communities (slug, name, social_settings)
-- values (
--   'myprogram',
--   'My Program Workspace',
--   '{}'::jsonb
-- )
-- returning id;

-- 2) Point an existing profile at that community.
--    Easiest: use the app **Admin → Workspaces** (`/admin/workspaces`) — “Assign user to workspace”.
--    Raw SQL in the Supabase SQL Editor often fails here (no JWT admin context) unless you temporarily
--    disable `profiles_protect_community` or apply migration `20260514140000_*` and run updates via
--    the service-role API (the admin page does this for you).

-- update public.profiles
-- set community_id = '<COMMUNITY_UUID_FROM_STEP_1>'::uuid
-- where id = '<AUTH_USER_UUID>'::uuid;

-- 3) New Supabase Auth users: pass user_metadata when inviting / signing up:
--    { "community_slug": "myprogram", "full_name": "Ada Lovelace", "role": "editor" }
--    handle_new_user() resolves slug to communities.id (defaults to immunox if slug missing).

-- 4) Seed tracked_entities for that community_id (CSV upload in app as admin, or SQL).

-- 5) Optional: promote to admin for that workspace
-- update public.profiles set role = 'admin' where id = '<AUTH_USER_UUID>'::uuid;
