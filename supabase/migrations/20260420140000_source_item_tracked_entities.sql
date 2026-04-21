-- Many-to-many: one signal (source_item) can reference multiple investigators.
-- signal_group_key = community + normalized title + pub date (no entity id) for cross-investigator dedup on Discover.

create or replace function public.compute_signal_group_key(
  p_community_id uuid,
  p_title text,
  p_published timestamptz
) returns text
language sql
immutable
as $$
  select coalesce(p_community_id::text, '')
    || '|'
    || regexp_replace(lower(trim(coalesce(p_title, ''))), '\s+', ' ', 'g')
    || '|'
    || coalesce(to_char(p_published::date, 'YYYY-MM-DD'), 'nodate');
$$;

alter table public.source_items
  add column if not exists signal_group_key text;

create index if not exists source_items_signal_group_key_idx
  on public.source_items (signal_group_key);

create or replace function public.source_items_set_duplicate_key()
returns trigger
language plpgsql
as $$
declare
  cid uuid;
begin
  new.duplicate_key := public.compute_duplicate_key(
    new.title,
    new.tracked_entity_id,
    new.published_at
  );
  cid := coalesce(
    new.community_id,
    (
      select te.community_id
      from public.tracked_entities te
      where te.id = new.tracked_entity_id
    )
  );
  new.signal_group_key := public.compute_signal_group_key(
    cid,
    new.title,
    new.published_at
  );
  return new;
end;
$$;

drop trigger if exists source_items_duplicate_key on public.source_items;

create trigger source_items_duplicate_key
  before insert or update of title, tracked_entity_id, published_at, community_id
  on public.source_items
  for each row execute function public.source_items_set_duplicate_key();

update public.source_items
set signal_group_key = public.compute_signal_group_key(community_id, title, published_at);

create table if not exists public.source_item_tracked_entities (
  source_item_id uuid not null references public.source_items (id) on delete cascade,
  tracked_entity_id uuid not null references public.tracked_entities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (source_item_id, tracked_entity_id)
);

create index if not exists source_item_tracked_entities_entity_idx
  on public.source_item_tracked_entities (tracked_entity_id);

insert into public.source_item_tracked_entities (source_item_id, tracked_entity_id)
select id, tracked_entity_id
from public.source_items
where tracked_entity_id is not null
on conflict do nothing;

create or replace function public.source_items_sync_primary_entity_link()
returns trigger
language plpgsql
as $$
begin
  if new.tracked_entity_id is not null then
    insert into public.source_item_tracked_entities (source_item_id, tracked_entity_id)
    values (new.id, new.tracked_entity_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_source_items_sync_entity_link on public.source_items;

create trigger trg_source_items_sync_entity_link
  after insert on public.source_items
  for each row execute function public.source_items_sync_primary_entity_link();

create or replace function public.source_items_sync_entity_on_tracked_change()
returns trigger
language plpgsql
as $$
begin
  if new.tracked_entity_id is not null
     and (old.tracked_entity_id is distinct from new.tracked_entity_id) then
    insert into public.source_item_tracked_entities (source_item_id, tracked_entity_id)
    values (new.id, new.tracked_entity_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_source_items_entity_update on public.source_items;

create trigger trg_source_items_entity_update
  after update of tracked_entity_id on public.source_items
  for each row execute function public.source_items_sync_entity_on_tracked_change();

alter table public.source_item_tracked_entities enable row level security;

grant select, insert, update, delete on table public.source_item_tracked_entities to authenticated;
grant select, insert, update, delete on table public.source_item_tracked_entities to service_role;

create policy "source_item_entities_select_community"
  on public.source_item_tracked_entities for select
  to authenticated
  using (
    exists (
      select 1
      from public.source_items si
      where si.id = source_item_tracked_entities.source_item_id
        and si.community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "source_item_entities_insert_community"
  on public.source_item_tracked_entities for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.source_items si
      where si.id = source_item_tracked_entities.source_item_id
        and si.community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "source_item_entities_update_community"
  on public.source_item_tracked_entities for update
  to authenticated
  using (
    exists (
      select 1
      from public.source_items si
      where si.id = source_item_tracked_entities.source_item_id
        and si.community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.source_items si
      where si.id = source_item_tracked_entities.source_item_id
        and si.community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "source_item_entities_delete_community"
  on public.source_item_tracked_entities for delete
  to authenticated
  using (
    exists (
      select 1
      from public.source_items si
      where si.id = source_item_tracked_entities.source_item_id
        and si.community_id = (select p.community_id from public.profiles p where p.id = auth.uid())
    )
  );
