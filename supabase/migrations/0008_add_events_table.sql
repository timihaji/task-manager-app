-- Calendar events: scheduled time blocks on a single day. A task can be
-- scheduled multiple times (multiple events with the same task_id) and
-- "freeform" blocks exist with task_id = null.
--
-- Design notes:
-- * (workspace_id, date) is the dominant read pattern (calendar fetches a
--   single day at a time), so it's the primary index.
-- * task_id is ON DELETE SET NULL — deleting a task converts its scheduled
--   blocks into freeform "Time block" entries rather than dropping them.
-- * start_min and duration_min are integers (minutes from midnight, length
--   in minutes). The prototype operates on integer minutes throughout; no
--   reason to add timezone complexity to a single-day surface.

create table public.events (
  id              text primary key,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,

  task_id         text references public.tasks(id) on delete set null,
  date            date not null,
  start_min       integer not null check (start_min >= 0 and start_min < 1440),
  duration_min    integer not null check (duration_min > 0 and duration_min <= 1440),
  title           text,
  color           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index events_workspace_date_idx on public.events(workspace_id, date);
create index events_task_id_idx        on public.events(task_id);

alter table public.events enable row level security;

create policy "users see own events"
  on public.events for select using (auth.uid() = user_id);
create policy "users insert own events"
  on public.events for insert with check (auth.uid() = user_id);
create policy "users update own events"
  on public.events for update using (auth.uid() = user_id);
create policy "users delete own events"
  on public.events for delete using (auth.uid() = user_id);
