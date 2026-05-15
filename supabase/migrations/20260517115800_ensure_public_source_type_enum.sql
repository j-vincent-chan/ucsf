-- Safe when migrations are applied out of order or only later SQL files were pasted into the SQL Editor.
-- Defines public.source_type before functions (e.g. compute_signal_group_key) reference it.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'source_type'
  ) then
    create type public.source_type as enum ('pubmed', 'web', 'manual');
  end if;
end $$;

alter type public.source_type add value if not exists 'lab_website';
alter type public.source_type add value if not exists 'reporter';
