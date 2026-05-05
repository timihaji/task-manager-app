alter table public.tasks
add column if not exists due_date date,
add column if not exists snooze_mode text,
add column if not exists snooze_offset_days integer;

create index if not exists tasks_due_date_idx on public.tasks(due_date);
