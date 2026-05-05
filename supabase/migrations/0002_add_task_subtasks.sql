-- Add inline subtasks (drawer checklist) to tasks.
--
-- The JS task object carries an array of `{id, title, done, lifeArea}`
-- objects under `task.subtasks` (see makeTask in src/data.js, edited
-- in src/drawer.jsx). These are inline checklist items — distinct from
-- the parent/child task hierarchy stored via `parent_id` / `child_order`.
--
-- The 0001 migration didn't include a column for them. PR B (cloud sync
-- of tasks) needs this column or the upsert request fails with 400.
--
-- Apply via Supabase Studio → SQL Editor, paste, run. RLS on the parent
-- table covers this column (no per-column policy needed).

alter table public.tasks
  add column if not exists subtasks jsonb not null default '[]'::jsonb;
