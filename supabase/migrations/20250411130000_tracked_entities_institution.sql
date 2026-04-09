-- Institution for discovery disambiguation (name + affiliation / site / org)

alter table public.tracked_entities
  add column if not exists institution text;

comment on column public.tracked_entities.institution is
  'School, hospital, or org used to narrow PubMed, ClinicalTrials.gov, and NIH RePORTER. Separate synonyms with ; or |.';
