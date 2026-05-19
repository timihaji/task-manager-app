-- Snooze upgrade: hour-level precision.
-- Existing snoozed_until is a `date` (day granularity). Promote to timestamptz
-- so "snooze for 1 hour" / "until 3pm" become expressible. Existing day-snoozes
-- migrate to midnight (00:00) of that day in the session timezone — same wake
-- behaviour as before the migration.
--
-- Also add snoozed_at so the UI can compute progress-bar fill ratio:
--   progress = (now - snoozed_at) / (snoozed_until - snoozed_at)

alter table public.tasks
  alter column snoozed_until type timestamptz
  using (case
    when snoozed_until is null then null
    else (snoozed_until::text || ' 00:00:00')::timestamptz
  end);

alter table public.tasks
  add column if not exists snoozed_at timestamptz;
