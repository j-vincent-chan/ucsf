-- Add middle initial to watchlist entities and include it in generated display name.

alter table public.tracked_entities
  add column if not exists middle_initial text not null default '';

update public.tracked_entities
set middle_initial = upper(left(trim(coalesce(middle_initial, '')), 1));

create or replace function public.tracked_entities_faculty_defaults()
returns trigger
language plpgsql
as $$
declare
  mi text;
begin
  if tg_op = 'INSERT' and new.community_id is null and auth.uid() is not null then
    new.community_id := (
      select p.community_id from public.profiles p where p.id = auth.uid()
    );
  end if;

  mi := upper(left(trim(coalesce(new.middle_initial, '')), 1));
  new.middle_initial := coalesce(mi, '');

  new.entity_type := 'faculty'::public.entity_type;
  new.name := trim(
    both ' ' from (
      coalesce(new.first_name, '')
      || case when new.middle_initial <> '' then (' ' || new.middle_initial) else '' end
      || ' '
      || coalesce(new.last_name, '')
    )
  );
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
