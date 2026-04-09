-- Optional PubMed search URL: discovery uses the URL's term= query when set (overrides pubmed_query).

alter table public.tracked_entities
  add column if not exists pubmed_url text;

comment on column public.tracked_entities.pubmed_url is
  'PubMed search results URL; the term= parameter is used as the esearch query when present (before affiliation AND).';
