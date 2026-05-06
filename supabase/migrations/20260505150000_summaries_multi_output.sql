-- Multiple persisted outputs per signal: one row per (source_item_id, style) + metadata columns.

alter type public.summary_style add value if not exists 'x';
alter type public.summary_style add value if not exists 'bluesky';
alter type public.summary_style add value if not exists 'web_blurb';
alter type public.summary_style add value if not exists 'internal_digest';

-- Keep the newest row per (source_item_id, style) before enforcing uniqueness.
with ranked as (
  select
    id,
    row_number() over (
      partition by source_item_id, style
      order by updated_at desc nulls last, created_at desc
    ) as rn
  from public.summaries
)
delete from public.summaries s
using ranked r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists summaries_source_item_id_style_key
  on public.summaries (source_item_id, style);

alter table public.summaries
  add column if not exists digest_tone text,
  add column if not exists target_blurb_chars integer,
  add column if not exists output_status text not null default 'draft',
  add column if not exists character_count integer,
  add column if not exists generated_at timestamptz;

alter table public.summaries drop constraint if exists summaries_output_status_check;

alter table public.summaries
  add constraint summaries_output_status_check
  check (output_status in ('draft', 'ready', 'reviewed'));

comment on column public.summaries.digest_tone is 'Digest editor tone (matches digest-summary-tone option id).';
comment on column public.summaries.target_blurb_chars is 'Last target length for blurb body generation.';
comment on column public.summaries.output_status is 'Editorial status for this channel output.';
comment on column public.summaries.character_count is 'Cached character count for headline+body (+why merged into body).';
comment on column public.summaries.generated_at is 'When AI last wrote generated_text for this row.';
