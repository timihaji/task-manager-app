-- Add a per-task `position` so manual reordering (drag-drop within a date
-- column or the inbox) survives a refresh. Without this, syncTaskDiff sees
-- no field change on a reorder and never sends an UPDATE; fetchTasks then
-- returns rows in created_at order and overwrites the user's manual order.
--
-- `position` is a double so a drop between two neighbours can pick the
-- midpoint and only the moved row is upserted. Nullable: existing tasks
-- (pre-migration) and any future code path that doesn't set a position
-- fall back to created_at ordering on read.

alter table public.tasks
add column if not exists position double precision;

-- Backfill: for each task, assign a position equal to its 1-based row
-- number within its bucket (workspace + parent + date), ordered by
-- created_at. This preserves the existing visual order on first load
-- after the migration.
update public.tasks t
set position = sub.rn
from (
  select id,
         row_number() over (
           -- Cast date -> text so the empty-string fallback is type-compatible.
           -- (`date` is a Postgres `date` column; coalesce(date, '') alone errors.)
           partition by workspace_id, coalesce(parent_id, ''), coalesce(date::text, '')
           order by created_at
         ) as rn
  from public.tasks
) sub
where t.id = sub.id
  and t.position is null;

create index if not exists tasks_position_idx
  on public.tasks (workspace_id, date, parent_id, position);
