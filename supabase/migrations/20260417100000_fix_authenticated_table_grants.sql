-- Fix authenticated role grants used by RLS policy subqueries.
-- Symptom addressed: "permission denied for table profiles" after multitenancy migration.

grant usage on schema public to authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.communities to authenticated;

-- Keep app tables usable under RLS (RLS still enforces tenant boundaries).
grant select, insert, update, delete on table public.tracked_entities to authenticated;
grant select, insert, update, delete on table public.source_items to authenticated;
grant select, insert, update, delete on table public.summaries to authenticated;
