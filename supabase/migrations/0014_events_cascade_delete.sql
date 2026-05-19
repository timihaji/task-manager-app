-- 0014_events_cascade_delete.sql
-- Change events.task_id FK from ON DELETE SET NULL → ON DELETE CASCADE.
-- Originally (0008) deleting a task converted its blocks to freeform
-- "Time block" entries. The new behaviour: deleting a task removes every
-- calendar block that referenced it, across every date. The client mirrors
-- this in deleteTask() so the UI reflects it immediately even before the
-- server round-trip.

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_task_id_fkey;
ALTER TABLE public.events
  ADD CONSTRAINT events_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
