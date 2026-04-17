-- Clear all discovered/manual signals so Discover can repopulate from scratch.
-- Keeps watchlist entities, profiles, and communities intact.
-- WARNING: irreversible data deletion for source_items + summaries.

begin;

-- summaries.source_item_id has ON DELETE CASCADE, so deleting source_items
-- removes attached summaries automatically.
delete from public.source_items;

commit;
