-- Runs after 20260408140000 commits so 'reporter' is safe to use.

update public.source_items
set source_type = 'reporter'::public.source_type
where category = 'funding'
  and source_type = 'web'::public.source_type
  and coalesce(source_domain, '') ilike '%reporter.nih.gov%';
