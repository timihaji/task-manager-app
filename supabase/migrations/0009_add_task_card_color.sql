-- Add a per-task `card_color` so the per-card colour wash (set via the
-- right-click "Card colour…" picker → CardColorPopover) survives a refresh.
-- Without this column, the JS `cardColor` field is silently dropped by
-- src/lib/db.js taskToRow (not in the allow-list, no snake_case mapping),
-- and fetchTasks then returns a row with no colour info — the picker
-- "appears to save" but the next reload wipes it.
--
-- Stored as a CSS hex string (e.g. "#ff6b6b") matching what
-- CardColorPopover writes via updateTask(..., { cardColor: hex }).
-- Nullable so cards without a chosen colour stay default-themed.

alter table public.tasks
  add column if not exists card_color text;
