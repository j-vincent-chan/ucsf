-- Multi-tenant communities: profiles, tracked_entities, and source_items are scoped per community.
-- Default tenant: ImmunoX (slug immunox). New users join via handle_new_user; optional auth metadata community_slug.

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  constraint communities_slug_key unique (slug)
);

insert into public.communities (name, slug)
values ('ImmunoX', 'immunox')
on conflict (slug) do nothing;

-- Profiles
alter table public.profiles
  add column if not exists community_id uuid references public.communities (id);

update public.profiles p
set community_id = c.id
from public.communities c
where c.slug = 'immunox'
  and p.community_id is null;

alter table public.profiles
  alter column community_id set not null;

-- Tracked entities
alter table public.tracked_entities
  add column if not exists community_id uuid references public.communities (id);

update public.tracked_entities te
set community_id = c.id
from public.communities c
where c.slug = 'immunox'
  and te.community_id is null;

alter table public.tracked_entities
  alter column community_id set not null;

alter table public.tracked_entities
  drop constraint if exists tracked_entities_slug_key;

create unique index if not exists tracked_entities_community_slug_uidx
  on public.tracked_entities (community_id, slug);

create index if not exists tracked_entities_community_id_idx
  on public.tracked_entities (community_id);

-- Source items
alter table public.source_items
  add column if not exists community_id uuid references public.communities (id);

update public.source_items si
set community_id = te.community_id
from public.tracked_entities te
where si.tracked_entity_id = te.id
  and si.community_id is null;

update public.source_items si
set community_id = p.community_id
from public.profiles p
where si.tracked_entity_id is null
  and si.submitted_by = p.id
  and si.community_id is null;

update public.source_items si
set community_id = c.id
from public.communities c
where c.slug = 'immunox'
  and si.community_id is null;

alter table public.source_items
  alter column community_id set not null;

create index if not exists source_items_community_id_idx on public.source_items (community_id);

-- Faculty defaults: assign community from current user on insert when not set (JWT sessions; service role passes explicit community_id)
create or replace function public.tracked_entities_faculty_defaults()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.community_id is null and auth.uid() is not null then
    new.community_id := (
      select p.community_id from public.profiles p where p.id = auth.uid()
    );
  end if;

  new.entity_type := 'faculty'::public.entity_type;
  new.name := trim(both ' ' from (coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')));
  if new.name = '' then
    new.name := coalesce(nullif(trim(new.slug), ''), 'faculty');
  end if;
  new.priority_tier := case
    when new.member_status = 'leadership_committee' then 1
    when new.member_status in ('member', 'full_member') then 2
    else 3
  end;
  return new;
end;
$$;

-- source_items.community_id from entity, submitter, or session user
create or replace function public.source_items_set_community()
returns trigger
language plpgsql
as $$
begin
  if new.tracked_entity_id is not null then
    select te.community_id into new.community_id
    from public.tracked_entities te
    where te.id = new.tracked_entity_id;
  elsif new.submitted_by is not null then
    select p.community_id into new.community_id
    from public.profiles p
    where p.id = new.submitted_by;
  elsif auth.uid() is not null then
    select p.community_id into new.community_id
    from public.profiles p
    where p.id = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_source_items_community on public.source_items;

create trigger trg_source_items_community
  before insert or update of tracked_entity_id, submitted_by
  on public.source_items
  for each row
  execute function public.source_items_set_community();

-- New auth user → profile (with community)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  select c.id into cid
  from public.communities c
  where c.slug = coalesce(nullif(trim(new.raw_user_meta_data->>'community_slug'), ''), 'immunox')
  limit 1;

  if cid is null then
    select c.id into cid from public.communities c where c.slug = 'immunox' limit 1;
  end if;

  insert into public.profiles (id, full_name, role, community_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case
      when new.raw_user_meta_data->>'role' = 'admin' then 'admin'::public.profile_role
      else 'editor'::public.profile_role
    end,
    cid
  );
  return new;
end;
$$;

-- Only admins may reassign a user to another community (initial assignment from null is allowed for migrations/backfills)
create or replace function public.protect_profile_community()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.community_id is distinct from old.community_id then
    if old.community_id is not null and not public.is_admin() then
      raise exception 'Only admins can change community assignment';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_community on public.profiles;

create trigger profiles_protect_community
  before update of community_id on public.profiles
  for each row
  execute function public.protect_profile_community();

-- RLS: communities (read own tenant only)
alter table public.communities enable row level security;

drop policy if exists "communities_select_own" on public.communities;

create policy "communities_select_own"
  on public.communities for select
  to authenticated
  using (
    id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );

-- tracked_entities
drop policy if exists "tracked_entities_select" on public.tracked_entities;
drop policy if exists "tracked_entities_insert_admin" on public.tracked_entities;
drop policy if exists "tracked_entities_update_admin" on public.tracked_entities;
drop policy if exists "tracked_entities_delete_admin" on public.tracked_entities;

create policy "tracked_entities_select_community"
  on public.tracked_entities for select
  to authenticated
  using (
    community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );

create policy "tracked_entities_insert_admin_community"
  on public.tracked_entities for insert
  to authenticated
  with check (
    public.is_admin()
    and community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );

create policy "tracked_entities_update_admin_community"
  on public.tracked_entities for update
  to authenticated
  using (
    public.is_admin()
    and community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    public.is_admin()
    and community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );

create policy "tracked_entities_delete_admin_community"
  on public.tracked_entities for delete
  to authenticated
  using (
    public.is_admin()
    and community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );

-- source_items
drop policy if exists "source_items_all" on public.source_items;

create policy "source_items_select_community"
  on public.source_items for select
  to authenticated
  using (
    community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );

create policy "source_items_insert_community"
  on public.source_items for insert
  to authenticated
  with check (
    community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );

create policy "source_items_update_community"
  on public.source_items for update
  to authenticated
  using (
    community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );

create policy "source_items_delete_community"
  on public.source_items for delete
  to authenticated
  using (
    community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
  );

-- summaries: scoped via parent source_item
drop policy if exists "summaries_all" on public.summaries;

create policy "summaries_select_community"
  on public.summaries for select
  to authenticated
  using (
    exists (
      select 1
      from public.source_items si
      where si.id = summaries.source_item_id
        and si.community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "summaries_insert_community"
  on public.summaries for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.source_items si
      where si.id = summaries.source_item_id
        and si.community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "summaries_update_community"
  on public.summaries for update
  to authenticated
  using (
    exists (
      select 1
      from public.source_items si
      where si.id = summaries.source_item_id
        and si.community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.source_items si
      where si.id = summaries.source_item_id
        and si.community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "summaries_delete_community"
  on public.summaries for delete
  to authenticated
  using (
    exists (
      select 1
      from public.source_items si
      where si.id = summaries.source_item_id
        and si.community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
    )
  );
