-- Allow editors (and admins) to insert/update/delete watchlist rows scoped to their profile's community.
-- Replaces admin-only write policies from 20260416150000_communities_multitenancy.sql.

drop policy if exists "tracked_entities_insert_admin_community" on public.tracked_entities;
drop policy if exists "tracked_entities_update_admin_community" on public.tracked_entities;
drop policy if exists "tracked_entities_delete_admin_community" on public.tracked_entities;

create policy "tracked_entities_insert_community"
  on public.tracked_entities for insert
  to authenticated
  with check (
    community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );

create policy "tracked_entities_update_community"
  on public.tracked_entities for update
  to authenticated
  using (
    community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );

create policy "tracked_entities_delete_community"
  on public.tracked_entities for delete
  to authenticated
  using (
    community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );
