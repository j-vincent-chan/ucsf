-- Community Signal Digest — initial schema, RLS, triggers

-- Extensions
create extension if not exists pgcrypto;

-- Enum types
create type public.entity_type as enum ('faculty', 'lab', 'center', 'community');
create type public.source_type as enum ('pubmed', 'web', 'manual');
create type public.item_status as enum ('new', 'reviewed', 'approved', 'archived');
create type public.item_category as enum (
  'paper',
  'award',
  'event',
  'media',
  'funding',
  'community_update',
  'other'
);
create type public.blurb_style as enum ('newsletter', 'donor', 'social', 'concise');
create type public.issue_status as enum ('draft', 'finalized');
create type public.profile_role as enum ('admin', 'editor');

-- Profiles (1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.profile_role not null default 'editor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

-- Tracked entities
create table public.tracked_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  entity_type public.entity_type not null,
  department text,
  description text,
  keywords text[] not null default '{}',
  pubmed_query text,
  google_alert_query text,
  priority_tier integer not null default 2,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tracked_entities_active_idx on public.tracked_entities (active);
create index tracked_entities_type_idx on public.tracked_entities (entity_type);

-- Source items
create table public.source_items (
  id uuid primary key default gen_random_uuid(),
  tracked_entity_id uuid references public.tracked_entities (id) on delete set null,
  source_type public.source_type not null,
  title text not null,
  source_url text,
  source_domain text,
  published_at timestamptz,
  found_at timestamptz not null default now(),
  raw_text text,
  raw_summary text,
  submitted_by uuid references auth.users (id) on delete set null,
  duplicate_key text,
  duplicate_of uuid references public.source_items (id) on delete set null,
  status public.item_status not null default 'new',
  category public.item_category,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index source_items_status_idx on public.source_items (status);
create index source_items_entity_idx on public.source_items (tracked_entity_id);
create index source_items_duplicate_key_idx on public.source_items (duplicate_key);
create index source_items_published_idx on public.source_items (published_at);
create index source_items_category_idx on public.source_items (category);
create index source_items_source_type_idx on public.source_items (source_type);

-- Blurbs
create table public.blurbs (
  id uuid primary key default gen_random_uuid(),
  source_item_id uuid not null references public.source_items (id) on delete cascade,
  style public.blurb_style not null,
  prompt_version text not null default 'v1',
  generated_text text not null,
  edited_text text,
  final_text text,
  model_name text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index blurbs_source_item_idx on public.blurbs (source_item_id);

-- Newsletter issues
create table public.newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  issue_date date not null,
  status public.issue_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index newsletter_issues_status_idx on public.newsletter_issues (status);

-- Newsletter issue items
create table public.newsletter_issue_items (
  id uuid primary key default gen_random_uuid(),
  newsletter_issue_id uuid not null references public.newsletter_issues (id) on delete cascade,
  source_item_id uuid not null references public.source_items (id) on delete cascade,
  blurb_id uuid references public.blurbs (id) on delete set null,
  section_name text not null,
  sort_order integer not null default 0,
  include boolean not null default true,
  created_at timestamptz not null default now(),
  unique (newsletter_issue_id, source_item_id)
);

create index newsletter_issue_items_issue_idx on public.newsletter_issue_items (newsletter_issue_id);
create index newsletter_issue_items_sort_idx on public.newsletter_issue_items (newsletter_issue_id, section_name, sort_order);

-- updated_at touch
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger tracked_entities_updated_at before update on public.tracked_entities
  for each row execute function public.set_updated_at();
create trigger source_items_updated_at before update on public.source_items
  for each row execute function public.set_updated_at();
create trigger blurbs_updated_at before update on public.blurbs
  for each row execute function public.set_updated_at();
create trigger newsletter_issues_updated_at before update on public.newsletter_issues
  for each row execute function public.set_updated_at();

-- Duplicate key computation
create or replace function public.compute_duplicate_key(
  p_title text,
  p_entity uuid,
  p_published timestamptz
) returns text
language sql
immutable
as $$
  select
    regexp_replace(lower(trim(coalesce(p_title, ''))), '\s+', ' ', 'g')
    || '|'
    || coalesce(p_entity::text, 'none')
    || '|'
    || coalesce(to_char(p_published::date, 'YYYY-MM-DD'), 'nodate');
$$;

create or replace function public.source_items_set_duplicate_key()
returns trigger
language plpgsql
as $$
begin
  new.duplicate_key := public.compute_duplicate_key(
    new.title,
    new.tracked_entity_id,
    new.published_at
  );
  return new;
end;
$$;

create trigger source_items_duplicate_key
  before insert or update of title, tracked_entity_id, published_at on public.source_items
  for each row execute function public.source_items_set_duplicate_key();

-- Helper: is current user admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Protect profile role: only admins may change role
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- New auth user → profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case
      when new.raw_user_meta_data->>'role' = 'admin' then 'admin'::public.profile_role
      else 'editor'::public.profile_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.tracked_entities enable row level security;
alter table public.source_items enable row level security;
alter table public.blurbs enable row level security;
alter table public.newsletter_issues enable row level security;
alter table public.newsletter_issue_items enable row level security;

-- profiles
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_authenticated"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- tracked_entities: read all; write admin only
create policy "tracked_entities_select"
  on public.tracked_entities for select
  to authenticated
  using (true);

create policy "tracked_entities_insert_admin"
  on public.tracked_entities for insert
  to authenticated
  with check (public.is_admin());

create policy "tracked_entities_update_admin"
  on public.tracked_entities for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "tracked_entities_delete_admin"
  on public.tracked_entities for delete
  to authenticated
  using (public.is_admin());

-- source_items, blurbs, issues, issue_items: editors + admins full access
create policy "source_items_all"
  on public.source_items for all
  to authenticated
  using (true)
  with check (true);

create policy "blurbs_all"
  on public.blurbs for all
  to authenticated
  using (true)
  with check (true);

create policy "newsletter_issues_all"
  on public.newsletter_issues for all
  to authenticated
  using (true)
  with check (true);

create policy "newsletter_issue_items_all"
  on public.newsletter_issue_items for all
  to authenticated
  using (true)
  with check (true);

-- profiles: no INSERT for authenticated; handle_new_user trigger inserts as security definer.