-- Faculty-only tracked entities: first_name, last_name, member_status; name + entity_type synced in DB

alter table public.tracked_entities
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists member_status text;

-- Backfill from legacy name column
update public.tracked_entities
set
  last_name = coalesce(nullif(trim(last_name), ''), nullif(trim(name), ''), 'Unknown'),
  first_name = coalesce(nullif(trim(first_name), ''), '')
where last_name is null or first_name is null;

update public.tracked_entities
set member_status = 'associate'
where member_status is null or trim(member_status) = '';

-- Normalize membership to Member | Associate | Leadership Committee (stored as snake_case)
update public.tracked_entities
set member_status = case
  when lower(trim(member_status)) in (
    'leadership committee',
    'leadershipcommittee',
    'leadership_committee',
    'leadership'
  )
  or lower(replace(trim(member_status), ' ', '_')) in ('leadership_committee', 'leadershipcommittee')
  then 'leadership_committee'
  when lower(trim(member_status)) in (
    'full member',
    'full_member',
    'fullmember',
    'full',
    'member'
  )
  or lower(replace(trim(member_status), ' ', '_')) in ('full_member', 'fullmember', 'member')
  then 'member'
  when lower(trim(member_status)) in ('associate', 'assoc')
  or lower(replace(trim(member_status), ' ', '_')) = 'associate'
  then 'associate'
  else 'associate'
end;

update public.tracked_entities set entity_type = 'faculty'::public.entity_type;

alter table public.tracked_entities
  alter column first_name set default '',
  alter column last_name set default '',
  alter column member_status set default 'associate';

alter table public.tracked_entities
  alter column first_name set not null,
  alter column last_name set not null,
  alter column member_status set not null;

alter table public.tracked_entities
  drop constraint if exists tracked_entities_member_status_check;

alter table public.tracked_entities
  add constraint tracked_entities_member_status_check
  check (member_status in ('member', 'associate', 'leadership_committee')));

create or replace function public.tracked_entities_faculty_defaults()
returns trigger
language plpgsql
as $$
begin
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

drop trigger if exists trg_tracked_entities_faculty_defaults on public.tracked_entities;

create trigger trg_tracked_entities_faculty_defaults
  before insert or update
  on public.tracked_entities
  for each row
  execute function public.tracked_entities_faculty_defaults();

-- Recompute name + tier for all rows
update public.tracked_entities
set
  priority_tier = case
    when member_status = 'leadership_committee' then 1
    when member_status in ('member', 'full_member') then 2
    else 3
  end,
  updated_at = now();
