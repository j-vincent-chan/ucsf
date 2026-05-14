-- Reference organizations (curated program/center accounts — not watched investigators).
-- Canonical seed data ships in app code (`reference-organizations-data.ts`); this table supports
-- metadata overrides, cadence tracking, and historical approval correlation over time.

create table if not exists public.reference_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  x_handle text not null,
  platform text not null default 'x',
  domain_focus text,
  prestige_tier smallint not null default 2,
  posting_cadence text,
  historical_approval_correlation double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists reference_organizations_x_handle_idx
  on public.reference_organizations (lower(x_handle));

alter table public.reference_organizations enable row level security;

grant select on table public.reference_organizations to authenticated;

drop policy if exists "reference_organizations_select_authenticated" on public.reference_organizations;
create policy "reference_organizations_select_authenticated"
  on public.reference_organizations for select
  to authenticated
  using (true);

-- Community-scoped AI Companion feedback for hybrid scoring / learning (server-side persistence).

create table if not exists public.ai_companion_signal_feedback (
  id uuid primary key default gen_random_uuid(),
  signal_id text not null,
  community_id uuid references public.communities (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  feedback_type text not null,
  recommendation_type text,
  previous_score numeric,
  previous_category text,
  new_category text,
  reason text,
  downstream_outcomes jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_companion_signal_feedback_community_created_idx
  on public.ai_companion_signal_feedback (community_id, created_at desc);

create index if not exists ai_companion_signal_feedback_signal_idx
  on public.ai_companion_signal_feedback (signal_id);

alter table public.ai_companion_signal_feedback enable row level security;

grant select, insert on table public.ai_companion_signal_feedback to authenticated;

drop policy if exists "ai_companion_signal_feedback_select_own" on public.ai_companion_signal_feedback;
create policy "ai_companion_signal_feedback_select_own"
  on public.ai_companion_signal_feedback for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "ai_companion_signal_feedback_insert_own" on public.ai_companion_signal_feedback;
create policy "ai_companion_signal_feedback_insert_own"
  on public.ai_companion_signal_feedback for insert
  to authenticated
  with check (auth.uid() = user_id);
