-- Add `personal_reminder_date` to tasks for the Delegations rework.
-- The delegator can set a private follow-up date that surfaces the card in
-- their own inbox on that date, regardless of the cadence schedule (which
-- is about *their* turnaround, not yours). Without this column, the JS
-- `personalReminderDate` field is silently dropped by src/lib/db.js taskToRow.
--
-- Stored as a date string (YYYY-MM-DD), same format as task.date / due_date.
-- Nullable — most delegations don't need a personal reminder.

alter table public.tasks
  add column if not exists personal_reminder_date date;
