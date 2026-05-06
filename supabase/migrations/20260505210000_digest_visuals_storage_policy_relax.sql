-- Relax digest-visuals storage policies: the previous EXISTS(source_items) subquery could fail under RLS
-- evaluation when inserting storage.objects. Scope uploads to the user's community folder only.

drop policy if exists "digest_visuals_insert_own_community" on storage.objects;
drop policy if exists "digest_visuals_update_own_community" on storage.objects;
drop policy if exists "digest_visuals_delete_own_community" on storage.objects;

-- Path: {community_id}/{source_item_id}/{filename} — require three slash-separated segments.
create policy "digest_visuals_insert_own_community"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'digest-visuals'
  and split_part(name, '/', 1) = (select community_id::text from public.profiles where id = auth.uid())
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) <> ''
);

create policy "digest_visuals_update_own_community"
on storage.objects for update to authenticated
using (
  bucket_id = 'digest-visuals'
  and split_part(name, '/', 1) = (select community_id::text from public.profiles where id = auth.uid())
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) <> ''
)
with check (
  bucket_id = 'digest-visuals'
  and split_part(name, '/', 1) = (select community_id::text from public.profiles where id = auth.uid())
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) <> ''
);

create policy "digest_visuals_delete_own_community"
on storage.objects for delete to authenticated
using (
  bucket_id = 'digest-visuals'
  and split_part(name, '/', 1) = (select community_id::text from public.profiles where id = auth.uid())
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) <> ''
);
