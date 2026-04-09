# Community Signal Digest

Internal web app for **OCR / ImmunoX** staff to track entities, capture source items, review them, and generate platform-specific summaries with OpenAI (monthly digest and item views).

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- Supabase (Postgres, Auth, Row Level Security)
- OpenAI API (structured JSON summary generation)

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- An OpenAI API key (for summary generation)

## Setup

### 1. Create a Supabase project

1. Create a project at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. In **Project Settings → API**, copy:
   - **Project URL**
   - **anon public** key (for the browser and Next.js server clients)
   - **service_role** key (for the seed script only — never expose to the client)

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Paste your keys into `.env.local` (see **“Keys to paste manually”** below).

### 3. Run database migrations

In the Supabase dashboard, open **SQL Editor**:

1. Run **`supabase/migrations/20250407120000_initial_schema.sql`** once (schema + RLS + `auth.users` → `profiles`).

2. Add faculty columns (pick **one**):
   - **Easiest:** run **`supabase/apply_faculty_schema.sql`** once. Idempotent; adds `first_name`, `last_name`, `member_status`, trigger, and fixes **`Could not find the 'first_name' column … schema cache`** on bulk upload.
   - **Or** run `20250408100000_faculty_only_entities.sql`, then (only if you had the old two-tier check) `20250409100000_member_status_three_tiers.sql`.

Alternatively, if you use the Supabase CLI locally:

```bash
supabase db push
```

(only if this repo is linked to your Supabase project)

### 4. Seed demo data (optional)

From the project root (with `.env.local` populated, including **service role**):

```bash
npm run seed
```

This creates:

- Dev accounts: `admin@community-signal.local` and `editor@community-signal.local` (password printed in the script output)
- 8 tracked entities, 15 source items (including a duplicate fingerprint example), and 10 sample summaries

### 5. Install dependencies and run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/login` until you sign in.

## Roles

- **Admin:** full access; can create/edit **tracked entities** (RLS-enforced).
- **Editor:** can work with source items and summaries; **cannot** modify tracked entities.

The first time a user signs up via Supabase Auth, the `handle_new_user` trigger creates a **profile**. You can pass `role` in user metadata (`admin` / `editor`) at creation time; the included seed script does this for the two dev users.

To promote an existing user to admin in SQL (run in Supabase SQL editor):

```sql
update public.profiles
set role = 'admin'
where id = 'AUTH_USER_UUID_HERE';
```

## API: generate blurb

`POST /api/generate-blurb` with JSON body:

```json
{ "source_item_id": "uuid", "style": "newsletter" | "donor" | "social" | "concise" }
```

Requires a logged-in session (cookies). Responses are validated JSON (`headline`, `blurb`, `why_it_matters`, `confidence_notes`) and persisted in `summaries.generated_text` as JSON.

## Project layout (high level)

- `src/app/(main)/` — authenticated shell: dashboard, entities, items, digest, submit
- `src/app/login/` — email/password login
- `src/app/api/generate-blurb/` — OpenAI + Supabase insert
- `src/lib/supabase/` — browser + server Supabase clients
- `src/types/database.ts` — hand-written DB types for Supabase
- `supabase/migrations/` — SQL schema and RLS
- `supabase/apply_faculty_schema.sql` — one-shot faculty columns (run in SQL Editor if bulk upload complains about `first_name`)
- `scripts/seed.ts` — idempotent demo seed (service role)

## Troubleshooting

**Bulk CSV upload: missing `first_name` / schema cache**

The app expects `tracked_entities.first_name` (and related columns). Run `supabase/apply_faculty_schema.sql` in Supabase **SQL Editor**, wait a few seconds, retry the upload.

## Production notes

- Never ship `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` to the browser; keep them server-only.
- Turn on email confirmation and password policies in Supabase for real deployments.
- Review RLS policies before production data lands; this app assumes a trusted internal audience.

## Commands

| Command        | Purpose              |
| -------------- | -------------------- |
| `npm run dev`  | Development server   |
| `npm run build`| Production build     |
| `npm run start`| Production server    |
| `npm run lint` | ESLint               |
| `npm run seed` | Seed DB (local/stage)|
