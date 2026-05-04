# Supabase setup

## Status (paused 2026-05-04)

Phase 2 is on hold while feature work continues on the localStorage app.

**What's done:**
- ✅ Supabase project created (`luffkczrzqrmiamaitim`)
- ✅ Schema applied (steps 1, 2)
- ✅ Email auth enabled (step 3, partial)
- ✅ URL + anon key obtained (step 4)
- ✅ Local `.env` configured and verified — `isSupabaseEnabled()` returns `true`,
      RLS-protected query to `workspaces` succeeds (step 5)

**What's still TODO before we can wire auth into the app:**
- [ ] **Step 3b**: Enable Google OAuth provider in Supabase
  - Create a Google Cloud OAuth client (instructions in chat history or step 3 below)
  - Paste Client ID + Secret into Supabase → Authentication → Providers → Google
  - Or: skip Google entirely and ship email-only first
- [ ] **Step 3c**: URL Configuration in Supabase → Authentication → URL Configuration
  - Site URL: `https://timihaji.github.io/task-manager-app/`
  - Redirect URLs: `https://timihaji.github.io/task-manager-app/**` and `http://localhost:5174/**`
  - Without this, Google sign-in on the live demo will fail
- [ ] **Step 6**: Production env vars in GitHub Actions
  - Repo Settings → Secrets and variables → Actions → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  - Update `.github/workflows/deploy.yml` to pass them via `env:` block in the build step
  - Without this, the live demo build won't have Supabase credentials

**Next PR (when resuming):**
- `src/lib/db.js` — Supabase queries behind the same function names components currently use for localStorage
- `src/lib/auth.js` + `src/components/AuthGate.jsx` — sign in / sign up / sign out
- `src/components/MigrateFromLocal.jsx` — one-time "import your localStorage data" button
- Replace `localStorage.*` calls in App.jsx + components with `db.*` equivalents
- Realtime subscription for cross-device sync

---

## One-time setup

1. **Create a Supabase project** at https://supabase.com (free tier is fine).
   Pick a region close to you (e.g. Sydney for AU).

2. **Apply the schema**: open the project's SQL Editor in the Supabase dashboard,
   paste the contents of [`migrations/0001_initial_schema.sql`](./migrations/0001_initial_schema.sql),
   and run.

3. **Enable email + Google auth**: Project Settings → Authentication → Providers.
   - Email is on by default
   - For Google: create a Google Cloud OAuth client, paste the client ID and
     secret into Supabase. Add `https://<project>.supabase.co/auth/v1/callback`
     as the authorized redirect URI in Google Cloud.

4. **Get your project URL and anon key**: Project Settings → API.
   Copy `Project URL` and `anon public` key.

5. **Local dev**: copy `.env.example` to `.env` (in repo root) and paste the
   URL + anon key. `.env` is gitignored.

6. **Production**: GitHub Actions doesn't see `.env`. Add the values as repo
   secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and update
   `.github/workflows/deploy.yml` to pass them as build env vars. The anon
   key is safe to ship in the bundle — RLS policies prevent cross-user reads.

## Schema overview

| Table            | Purpose                                                   |
| ---------------- | --------------------------------------------------------- |
| `workspaces`     | One row per user (for now). Future-proofs for teams.      |
| `tasks`          | Tasks, projects, and subtasks (`card_type` discriminator) |
| `people`         | Delegation memory store — names + cadence preferences     |
| `user_settings`  | Theme, density, look, layout prefs (jsonb)                |
| `taxonomy`       | Per-workspace custom projects / tags / life areas         |

Every table has Row-Level Security: `auth.uid() = user_id`. Without RLS, any
authenticated user could read everyone's data. Don't disable it.

A trigger on `auth.users` auto-creates a "Personal" workspace on signup.

## Future migrations

Number sequentially: `0002_*.sql`, `0003_*.sql`, etc. Apply in order via the
SQL Editor (or `supabase db push` if you set up the CLI).
