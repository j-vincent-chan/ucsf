-- Per-user saved posts from Social Signals live feed (in-app bookmarks; not X/Bluesky API bookmarks).

create table if not exists public.social_signal_bookmarks (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id text not null,
  post jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists social_signal_bookmarks_user_created_idx
  on public.social_signal_bookmarks (user_id, created_at desc);

alter table public.social_signal_bookmarks enable row level security;

grant select, insert, update, delete on table public.social_signal_bookmarks to authenticated;

drop policy if exists "social_signal_bookmarks_select_own" on public.social_signal_bookmarks;
create policy "social_signal_bookmarks_select_own"
  on public.social_signal_bookmarks for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "social_signal_bookmarks_insert_own" on public.social_signal_bookmarks;
create policy "social_signal_bookmarks_insert_own"
  on public.social_signal_bookmarks for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "social_signal_bookmarks_update_own" on public.social_signal_bookmarks;
create policy "social_signal_bookmarks_update_own"
  on public.social_signal_bookmarks for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "social_signal_bookmarks_delete_own" on public.social_signal_bookmarks;
create policy "social_signal_bookmarks_delete_own"
  on public.social_signal_bookmarks for delete
  to authenticated
  using (auth.uid() = user_id);
