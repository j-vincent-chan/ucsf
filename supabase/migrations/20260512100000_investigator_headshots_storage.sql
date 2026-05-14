-- Object key within bucket investigator-headshots: {community_id}/{entity_id}/headshot (no extension; MIME set on upload).
alter table public.tracked_entities
  add column if not exists headshot_storage_path text null;

comment on column public.tracked_entities.headshot_storage_path is
  'Path inside investigator-headshots bucket; public URL is derived at read time. Takes display precedence over headshot_url.';

-- Public read via CDN URL; writes scoped to authenticated admin in the same community as the entity row.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'investigator-headshots',
  'investigator-headshots',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "investigator_headshots_insert" on storage.objects;
drop policy if exists "investigator_headshots_update" on storage.objects;
drop policy if exists "investigator_headshots_delete" on storage.objects;
drop policy if exists "investigator_headshots_select_public" on storage.objects;

-- Path: {community_id}/{tracked_entity_id}/{filename}
create policy "investigator_headshots_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'investigator-headshots'
  and split_part(name, '/', 1) = (select community_id::text from public.profiles where id = auth.uid())
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) <> ''
  and exists (
    select 1
    from public.tracked_entities te
    inner join public.profiles p on p.id = auth.uid()
    where te.id = (split_part(name, '/', 2))::uuid
      and te.community_id = p.community_id
      and te.community_id::text = split_part(name, '/', 1)
  )
);

create policy "investigator_headshots_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'investigator-headshots'
  and split_part(name, '/', 1) = (select community_id::text from public.profiles where id = auth.uid())
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) <> ''
  and exists (
    select 1
    from public.tracked_entities te
    inner join public.profiles p on p.id = auth.uid()
    where te.id = (split_part(name, '/', 2))::uuid
      and te.community_id = p.community_id
      and te.community_id::text = split_part(name, '/', 1)
  )
)
with check (
  bucket_id = 'investigator-headshots'
  and split_part(name, '/', 1) = (select community_id::text from public.profiles where id = auth.uid())
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) <> ''
  and exists (
    select 1
    from public.tracked_entities te
    inner join public.profiles p on p.id = auth.uid()
    where te.id = (split_part(name, '/', 2))::uuid
      and te.community_id = p.community_id
      and te.community_id::text = split_part(name, '/', 1)
  )
);

create policy "investigator_headshots_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'investigator-headshots'
  and split_part(name, '/', 1) = (select community_id::text from public.profiles where id = auth.uid())
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) <> ''
  and exists (
    select 1
    from public.tracked_entities te
    inner join public.profiles p on p.id = auth.uid()
    where te.id = (split_part(name, '/', 2))::uuid
      and te.community_id = p.community_id
      and te.community_id::text = split_part(name, '/', 1)
  )
);

create policy "investigator_headshots_select_public"
on storage.objects for select
to public
using (bucket_id = 'investigator-headshots');
