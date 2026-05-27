-- Track when scheduled queue posts actually went live (and last publish error).

alter table public.social_review_queue_posts
  add column if not exists published_at timestamptz,
  add column if not exists publish_error text;

create index if not exists social_review_queue_posts_due_publish_idx
  on public.social_review_queue_posts (community_id, status, scheduled_at)
  where status = 'scheduled' and scheduled_at is not null;
