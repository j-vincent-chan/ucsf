-- Dashboard loads recent source_items ordered by created_at for one community.
create index if not exists source_items_community_created_at_idx
  on public.source_items (community_id, created_at desc);
