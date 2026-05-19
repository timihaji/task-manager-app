-- 0012_add_event_source.sql
-- Marks events placed by the algorithm (autoPlan, auto-populate toggle,
-- or the 'x' hover shortcut) so CalendarDrawer can render them at 60% opacity
-- until the user manually drags or resizes them (which clears the field).
-- Null = manual user placement.

ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT NULL;
