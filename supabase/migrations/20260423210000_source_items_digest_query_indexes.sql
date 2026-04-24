-- Speed up /digest month queries: filter by community + status + date columns under RLS.
-- Prevents long sequential scans and statement timeouts on larger datasets.

create index if not exists source_items_community_status_published_at_idx
  on public.source_items (community_id, status, published_at);

-- Items without publish date: digest uses found_at for the same month range.
create index if not exists source_items_community_status_found_no_pub_idx
  on public.source_items (community_id, status, found_at)
  where published_at is null;
