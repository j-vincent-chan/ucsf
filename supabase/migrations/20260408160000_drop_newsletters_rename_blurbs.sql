-- Remove newsletter issue builder; rename blurbs → summaries (table + style enum).
-- Idempotent: safe if newsletter tables are already gone or summaries already exists.

drop table if exists public.newsletter_issue_items cascade;
drop table if exists public.newsletter_issues cascade;
drop type if exists public.issue_status;

-- blurbs → summaries (skip if already renamed)
do $$
begin
  if to_regclass('public.blurbs') is not null then
    drop policy if exists "blurbs_all" on public.blurbs;
    drop trigger if exists blurbs_updated_at on public.blurbs;
    alter table public.blurbs rename to summaries;
  end if;
end;
$$;

-- Index name (unchanged on rename in some PG versions; normalize)
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'i'
      and c.relname = 'blurbs_source_item_idx'
  ) then
    alter index public.blurbs_source_item_idx rename to summaries_source_item_idx;
  end if;
end;
$$;

-- Trigger + RLS policy on summaries
do $$
begin
  if to_regclass('public.summaries') is not null then
    drop trigger if exists summaries_updated_at on public.summaries;
    create trigger summaries_updated_at before update on public.summaries
      for each row execute function public.set_updated_at();
    drop policy if exists "summaries_all" on public.summaries;
    create policy "summaries_all"
      on public.summaries for all
      to authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

-- Enum used by summaries.style
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'blurb_style'
  ) then
    alter type public.blurb_style rename to summary_style;
  end if;
end;
$$;
