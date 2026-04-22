-- Add low_signal archive reason for queue/detail archive dropdowns.
alter table public.source_items drop constraint if exists source_items_archive_reason_check;

alter table public.source_items
  add constraint source_items_archive_reason_check
  check (
    archive_reason is null
    or archive_reason in (
      'not_accurate',
      'not_relevant',
      'low_signal',
      'duplicate',
      'wrong_investigator',
      'outdated',
      'spam_or_noise',
      'other'
    )
  );

comment on column public.source_items.archive_reason is
  'When status is archived: editor reason (not_accurate, not_relevant, low_signal, duplicate, wrong_investigator, outdated, spam_or_noise, other). Null allowed for legacy.';
