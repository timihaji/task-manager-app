-- 0013_add_task_splittable.sql
-- Per-task flag: when true, the smart scheduler may break this task into
-- ≥30-min chunks across free slots when no single contiguous slot before
-- 18:00 fits the task's duration. Default false — opt-in per task via the
-- Schedule section of the task drawer.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS splittable BOOLEAN NOT NULL DEFAULT false;
