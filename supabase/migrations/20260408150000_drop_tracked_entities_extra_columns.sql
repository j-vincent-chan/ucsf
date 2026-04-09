-- Remove unused watchlist fields (PubMed URL + name/institution cover discovery)

alter table public.tracked_entities
  drop column if exists department,
  drop column if exists description,
  drop column if exists keywords,
  drop column if exists pubmed_query;
