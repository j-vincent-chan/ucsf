-- Optional illustration for digest / newsletter / social (URL from PMC page or inline AI image).
alter table public.source_items
  add column if not exists digest_cover jsonb;

comment on column public.source_items.digest_cover is
  'Optional digest illustration: { "kind":"url","url":"https://...","source":"pmc_og_image" } or { "kind":"inline","mime":"image/png","base64":"...","source":"dall-e-3" }';
