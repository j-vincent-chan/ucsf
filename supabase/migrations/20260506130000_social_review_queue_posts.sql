-- Persisted Social Signals review queue drafts.

create table if not exists public.social_review_queue_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  source_item_id uuid references public.source_items (id) on delete set null,
  platform text not null check (platform in ('x', 'bluesky')),
  status text not null default 'draft' check (status in ('draft', 'needs_review', 'approved', 'scheduled', 'published')),
  text text not null,
  image_url text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_review_queue_posts_community_created_idx
  on public.social_review_queue_posts (community_id, created_at desc);

create trigger social_review_queue_posts_updated_at
before update on public.social_review_queue_posts
for each row execute function public.set_updated_at();

alter table public.social_review_queue_posts enable row level security;

drop policy if exists "social_review_queue_select_community" on public.social_review_queue_posts;
create policy "social_review_queue_select_community"
  on public.social_review_queue_posts for select
  to authenticated
  using (community_id = (select p.community_id from public.profiles p where p.id = auth.uid()));

drop policy if exists "social_review_queue_insert_community" on public.social_review_queue_posts;
create policy "social_review_queue_insert_community"
  on public.social_review_queue_posts for insert
  to authenticated
  with check (community_id = (select p.community_id from public.profiles p where p.id = auth.uid()));

drop policy if exists "social_review_queue_update_community" on public.social_review_queue_posts;
create policy "social_review_queue_update_community"
  on public.social_review_queue_posts for update
  to authenticated
  using (community_id = (select p.community_id from public.profiles p where p.id = auth.uid()))
  with check (community_id = (select p.community_id from public.profiles p where p.id = auth.uid()));

drop policy if exists "social_review_queue_delete_community" on public.social_review_queue_posts;
create policy "social_review_queue_delete_community"
  on public.social_review_queue_posts for delete
  to authenticated
  using (community_id = (select p.community_id from public.profiles p where p.id = auth.uid()));

