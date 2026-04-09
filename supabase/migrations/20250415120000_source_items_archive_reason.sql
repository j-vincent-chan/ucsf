-- Why an item was rejected when moved to archived (e.g. bulk queue actions).
alter table public.source_items
  add column if not exists archive_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'source_items_archive_reason_check'
  ) then
    alter table public.source_items
      add constraint source_items_archive_reason_check
      check (
        archive_reason is null
        or archive_reason in ('not_accurate', 'not_relevant')
      );
  end if;
end $$;

comment on column public.source_items.archive_reason is
  'When status is archived: editor rejection reason (not_accurate | not_relevant). Null if unknown or legacy.';
