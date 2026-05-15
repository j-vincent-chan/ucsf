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

- Dev account: `admin@community-signal.local` (password printed in the script output) is a **platform administrator** with **no workspace** — use **Admin → Workspaces** to manage tenants and users. Seeded demo People and Signals live under the **ImmunoX** tenant; sign in as a user assigned to that workspace (e.g. after creating one with `SEED_IMMUNOX_PASSWORD`) to browse them.
- Apply pending Supabase migrations (including `20260515180000_profiles_platform_admin_null_community.sql`, `20260515180500_protect_profile_community_allow_sql_superuser.sql`, and `20260515200000_detach_seeded_dev_admin_from_tenant.sql`) so the dev admin row is **not** left on ImmunoX from an older database; then re-run `npm run seed` or sign out and back in.
- 8 tracked entities, 15 source items (including a duplicate fingerprint example), and 10 sample summaries

### 5. Install dependencies and run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/login` until you sign in.

## Roles

- **Admin (platform):** optional `profiles.community_id` **null** — only **Admin → Workspaces** and settings; no Signals/People until assigned to a tenant.
- **Admin (tenant):** same as before for a workspace; can manage **People** and other admin tools for that community.
- **Editor:** must belong to a workspace; can work with source items and summaries; **cannot** modify tracked entities without tenant admin policies.

The first time a user signs up via Supabase Auth, the `handle_new_user` trigger creates a **profile**. You can pass `role` in user metadata (`admin` / `editor`) at creation time; the seed script sets the dev admin as `admin` and clears `community_id` after creation.

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

### Vercel: nightly automated discovery (Signals)

The app is already wired for a **once-daily** cron job (`vercel.json` → `GET /api/discover-items` at **00:00 UTC** — “midnight” on the UTC clock, not necessarily midnight in your local timezone). Vercel does **not** run this until the project is deployed there and the steps below are done.

1. **Deploy this repo to Vercel** (import from Git, connect the repo, deploy production). Cron entries are read from `vercel.json` on each production deploy.
2. **Set `CRON_SECRET` in Vercel**  
   - Dashboard: **Project → Settings → Environment Variables**.  
   - Add **`CRON_SECRET`** for **Production** only (or Preview too if you want cron there). Use a long random string (16+ characters).  
   - Vercel automatically sends `Authorization: Bearer <your CRON_SECRET value>` when it invokes the scheduled URL — you do **not** paste the secret into the cron UI. The API route checks that header matches `process.env.CRON_SECRET`. If `CRON_SECRET` is missing, every cron run gets **401** and **no items are discovered** (the list stays static until someone uses **Discover new items**).
3. **Set Supabase keys for the server** (same as the rest of the app): at minimum **`NEXT_PUBLIC_SUPABASE_URL`**, **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**, and **`SUPABASE_SERVICE_ROLE_KEY`**. The cron handler uses the **service role** client so discovery can write `source_items` for every community without a logged-in user.
4. **Redeploy** after adding or changing environment variables so the new values are available to the serverless function.
5. **Confirm it is scheduled:** **Project → Settings → Cron Jobs** — you should see `/api/discover-items` with schedule `0 0 * * *`. Use **View logs** on that job (or **Deployments → Functions** / runtime logs) to verify responses are **200** and the JSON shows `inserted` / `skippedDuplicates` as expected, not `401 Unauthorized cron request`.

Optional tuning (Production env vars):

- **`DISCOVERY_CRON_DAYS_BACK`** — how far back to search (default **56**; max 3100).
- **`DISCOVERY_CRON_MAX_PER_SOURCE`** — cap per investigator per source per run (default **80**; keeps the job within Vercel’s function time limit). The UI button uses a wider window by design.

**Hobby plan note:** Vercel may run a “daily” cron **any time within that calendar hour** (load spreading), so `0 0 * * *` might not fire at exactly `00:00:00` UTC. Paid plans run within the specified minute window. See [Vercel Cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

To run discovery at a different wall-clock (e.g. midnight **Pacific**), change the `schedule` expression in `vercel.json` and redeploy (cron uses **UTC**).

- Manual **Discover new items** in the UI uses a wider window (~730 days) and higher per-source caps (PubMed paginates up to that cap per investigator).
- **Deep history** (e.g. 2018–present): run locally so serverless timeouts do not apply:
  - `npm run discovery:backfill -- --days=2920 --max-per-source=400`
  - Requires `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`.

### Multi-workspace beta (communities / tenants)

- **Provisioning (UI):** **Platform administrators** (admin with **no** `profiles.community_id`) can open **Admin → Workspaces** (`/admin/workspaces`) to create a community and assign users. Tenant/workspace admins do not see that page. Creating Auth users from the UI still needs `SUPABASE_SERVICE_ROLE_KEY` on the server.
- **Provisioning (SQL):** Alternatively, add a row to `public.communities` and set `profiles.community_id` in the Supabase SQL Editor — see `supabase/beta_workspace_provisioning.example.sql`. New Auth users should include **`community_slug`** in user metadata so `handle_new_user` assigns the right tenant (otherwise the DB default is **`immunox`**).
- **RLS:** Migration `20260514120000_profiles_select_same_community.sql` limits **`profiles` SELECT** to your own row and profiles in the **same** `community_id` (plus a small `SECURITY DEFINER` helper to avoid policy recursion). Service-role scripts still bypass RLS.
- **Community reassignment:** Migration `20260514140000_protect_profile_community_service_role.sql` lets **`service_role`** updates change `profiles.community_id`. The Workspaces UI and `is_platform_admin()` RLS restrict live tenant moves to **platform** admins; tenant admins cannot reassign workspaces from the app or list all communities via PostgREST.
- **AI companion feedback:** `20260514120100_ai_companion_feedback_insert_community.sql` requires `community_id` on insert to match the signed-in user’s workspace.
- **Social Signals credentials:** Each workspace stores its own **X API Bearer**, **Bluesky app password**, handles, and list IDs under **Settings → Social publishing** (any member of that workspace). There is **no** shared fallback to deployment `X_BEARER_TOKEN` / `BSKY_*` for feed ingest or Bluesky posting — communities stay isolated. OpenAI and other keys may still be shared per deployment. Nightly discovery loops **all** communities sequentially—watch function duration as tenant count grows.

## Commands

| Command        | Purpose              |
| -------------- | -------------------- |
| `npm run dev`  | Development server   |
| `npm run build`| Production build     |
| `npm run start`| Production server    |
| `npm run lint` | ESLint               |
| `npm run seed` | Seed DB (local/stage)|
