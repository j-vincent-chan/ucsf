-- Derive priority_tier from member_status on every insert/update (Leadership 1, Member 2, Associate 3)

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

update public.tracked_entities
set
  priority_tier = case
    when member_status = 'leadership_committee' then 1
    when member_status in ('member', 'full_member') then 2
    else 3
  end,
  updated_at = now();
