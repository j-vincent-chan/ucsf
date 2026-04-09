-- Upgrade: two-tier membership → Member / Associate / Leadership Committee
-- Safe to run if you already applied an older faculty migration with full_member.

alter table public.tracked_entities
  drop constraint if exists tracked_entities_member_status_check;

update public.tracked_entities
set member_status = 'member'
where member_status = 'full_member';

update public.tracked_entities
set member_status = case
  when lower(trim(member_status)) in (
    'leadership committee',
    'leadershipcommittee',
    'leadership_committee',
    'leadership'
  )
  then 'leadership_committee'
  when lower(trim(member_status)) in ('member', 'full member', 'full_member', 'full')
  then 'member'
  when lower(trim(member_status)) in ('associate', 'assoc')
  then 'associate'
  else 'associate'
end
where member_status not in ('member', 'associate', 'leadership_committee');

alter table public.tracked_entities
  add constraint tracked_entities_member_status_check
  check (member_status in ('member', 'associate', 'leadership_committee'));
