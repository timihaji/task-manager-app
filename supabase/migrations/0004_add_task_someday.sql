alter table public.tasks
  add column if not exists someday boolean not null default false;

create index if not exists tasks_someday_idx on public.tasks(someday);
