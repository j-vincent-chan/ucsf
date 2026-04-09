-- Remove newsletter issue builder; rename blurbs → summaries (table + style enum).

drop table if exists public.newsletter_issue_items;
drop table if exists public.newsletter_issues;

drop type if exists public.issue_status;

drop policy if exists "blurbs_all" on public.blurbs;
drop trigger if exists blurbs_updated_at on public.blurbs;

alter table public.blurbs rename to summaries;

alter index public.blurbs_source_item_idx rename to summaries_source_item_idx;

create trigger summaries_updated_at before update on public.summaries
  for each row execute function public.set_updated_at();

create policy "summaries_all"
  on public.summaries for all
  to authenticated
  using (true)
  with check (true);

alter type public.blurb_style rename to summary_style;
