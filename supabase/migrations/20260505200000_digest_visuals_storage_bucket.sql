-- Public bucket for digest hero pixels (URLs are unguessable UUID paths; writes restricted by policy).

drop policy if exists "digest_visuals_insert_own_community" on storage.objects;
drop policy if exists "digest_visuals_update_own_community" on storage.objects;
drop policy if exists "digest_visuals_delete_own_community" on storage.objects;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'digest-visuals',
  'digest-visuals',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: {community_id}/{source_item_id}/{filename}

create policy "digest_visuals_insert_own_community"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'digest-visuals'
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 2
  and (storage.foldername(name))[1] = (select community_id::text from public.profiles where id = auth.uid())
  and exists (
    select 1
    from public.source_items si
    inner join public.profiles p on p.id = auth.uid()
    where si.id = ((storage.foldername(name))[2])::uuid
      and si.community_id = p.community_id
      and si.community_id::text = (storage.foldername(name))[1]
  )
);

create policy "digest_visuals_update_own_community"
on storage.objects for update to authenticated
using (
  bucket_id = 'digest-visuals'
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 2
  and (storage.foldername(name))[1] = (select community_id::text from public.profiles where id = auth.uid())
  and exists (
    select 1
    from public.source_items si
    inner join public.profiles p on p.id = auth.uid()
    where si.id = ((storage.foldername(name))[2])::uuid
      and si.community_id = p.community_id
      and si.community_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'digest-visuals'
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 2
  and (storage.foldername(name))[1] = (select community_id::text from public.profiles where id = auth.uid())
  and exists (
    select 1
    from public.source_items si
    inner join public.profiles p on p.id = auth.uid()
    where si.id = ((storage.foldername(name))[2])::uuid
      and si.community_id = p.community_id
      and si.community_id::text = (storage.foldername(name))[1]
  )
);

create policy "digest_visuals_delete_own_community"
on storage.objects for delete to authenticated
using (
  bucket_id = 'digest-visuals'
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 2
  and (storage.foldername(name))[1] = (select community_id::text from public.profiles where id = auth.uid())
  and exists (
    select 1
    from public.source_items si
    inner join public.profiles p on p.id = auth.uid()
    where si.id = ((storage.foldername(name))[2])::uuid
      and si.community_id = p.community_id
      and si.community_id::text = (storage.foldername(name))[1]
  )
);
