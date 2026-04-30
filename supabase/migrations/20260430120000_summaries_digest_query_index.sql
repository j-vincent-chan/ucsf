-- Speed up digest month loads: summaries are fetched with IN (source_item_ids) and ORDER BY created_at DESC.
create index if not exists summaries_source_item_created_at_idx
  on public.summaries (source_item_id, created_at desc);
