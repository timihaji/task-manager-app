-- Add group_id to tasks for persistent custom groups (multi-select → Group).
-- Until this migration runs, db.js silently strips group_id from upserts so
-- writes don't fail; client state holds the grouping locally. Once the column
-- exists, group memberships sync across devices like every other task field.

alter table public.tasks
add column if not exists group_id text;

create index if not exists tasks_group_id_idx on public.tasks(group_id);
