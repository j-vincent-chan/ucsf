-- When posts are timed in Social Signals Scheduler, persist the slot alongside status.

alter table public.social_review_queue_posts
  add column if not exists scheduled_at timestamptz;
