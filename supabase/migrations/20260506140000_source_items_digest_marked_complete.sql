-- Editor workflow: signals marked complete move to the digest "Completed Library" (nullable = active draft).
alter table public.source_items
  add column if not exists digest_marked_complete_at timestamptz null;

comment on column public.source_items.digest_marked_complete_at is
  'When set, this signal is finalized in the monthly digest Completed Library (resting state).';

create index if not exists source_items_digest_marked_complete_at_idx
  on public.source_items (digest_marked_complete_at)
  where digest_marked_complete_at is not null;
