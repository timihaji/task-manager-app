-- Initial schema for Task Manager (Phase 2)
--
-- Apply via: Supabase Studio → SQL Editor, paste, run.
-- Or via CLI: supabase db push (after `supabase link`)
--
-- Design notes:
-- * One row per user in `workspaces` for now. Future: teams = multiple users
--   per workspace via a `workspace_members` join table.
-- * `tasks` is a single table for tasks, projects, and subtasks
--   (card_type discriminates). Matches the existing in-memory shape.
-- * Row-Level Security is on every table — `auth.uid() = user_id`.
--   Without RLS, any authenticated user could read everyone's data.
-- * Field names are snake_case (Postgres convention). The JS app uses
--   camelCase; src/lib/db.js will do the mapping in both directions.

-- =============================================================================
-- Workspaces
-- =============================================================================
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Personal',
  created_at  timestamptz not null default now()
);

create index workspaces_user_id_idx on public.workspaces(user_id);

alter table public.workspaces enable row level security;

create policy "users see only their own workspaces"
  on public.workspaces for select using (auth.uid() = user_id);
create policy "users insert own workspaces"
  on public.workspaces for insert with check (auth.uid() = user_id);
create policy "users update own workspaces"
  on public.workspaces for update using (auth.uid() = user_id);
create policy "users delete own workspaces"
  on public.workspaces for delete using (auth.uid() = user_id);

-- =============================================================================
-- Tasks (also covers projects and subtasks via card_type + parent_id)
-- =============================================================================
create table public.tasks (
  id                  text primary key,             -- client-generated short id (e.g. "t541")
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,

  -- Core
  title               text not null default '',
  description         text not null default '',
  card_type           text not null default 'task' check (card_type in ('task','project')),
  parent_id           text references public.tasks(id) on delete cascade,
  child_order         text[] default null,           -- ordered list of child ids (for projects)

  -- Categorisation
  project             text,                          -- e.g. 'LIFE','HOME' (free text — taxonomy is editable)
  tags                text[] not null default '{}',
  priority            text check (priority in ('p1','p2','p3')),
  life_area           text,
  time_estimate       text,                          -- '5m','1h 30m' etc — keep as string for now

  -- Scheduling
  date                date,
  done                boolean not null default false,
  completed_at        timestamptz,
  snoozed_until       date,
  recurrence          jsonb,                         -- { freq, interval }

  -- Blocking
  blocked             boolean not null default false,
  blocked_reason      text not null default '',
  blocked_by          text[] not null default '{}',  -- ids of blocking tasks
  blocked_since       timestamptz,
  follow_up_at        timestamptz,

  -- Delegation
  delegated_to        text,
  delegated_at        timestamptz,
  delegation_status   text,                          -- 'sent' | 'waiting' | etc.
  check_in_schedule   integer[],                     -- e.g. [2,5,10] (days)
  check_in_task_ids   text[] not null default '{}',
  check_in_of         text references public.tasks(id) on delete set null,
  check_in_day_offset integer,
  expiry_date         date,
  expiry_task_id      text,
  expiry_of           text,
  last_contact_at     timestamptz,
  delegation_history  jsonb not null default '[]'::jsonb,

  -- Activity log
  activity            jsonb not null default '[]'::jsonb,

  -- Metadata
  archived            boolean not null default false,
  source              text,                          -- e.g. 'sunsama' for imports
  source_id           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index tasks_user_id_idx        on public.tasks(user_id);
create index tasks_workspace_id_idx   on public.tasks(workspace_id);
create index tasks_parent_id_idx      on public.tasks(parent_id);
create index tasks_date_idx           on public.tasks(date);
create index tasks_delegated_to_idx   on public.tasks(delegated_to);
create index tasks_done_idx           on public.tasks(done);

alter table public.tasks enable row level security;

create policy "users see only their own tasks"
  on public.tasks for select using (auth.uid() = user_id);
create policy "users insert own tasks"
  on public.tasks for insert with check (auth.uid() = user_id);
create policy "users update own tasks"
  on public.tasks for update using (auth.uid() = user_id);
create policy "users delete own tasks"
  on public.tasks for delete using (auth.uid() = user_id);

-- Auto-update `updated_at` on every UPDATE
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- People (delegation memory store)
-- =============================================================================
create table public.people (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  name                 text not null,
  preferred_cadence    integer[],                     -- e.g. [2,5,10]
  open_count           integer not null default 0,
  last_contact_at      timestamptz,
  delegation_history   jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_id, name)
);

create index people_user_id_idx       on public.people(user_id);
create index people_workspace_id_idx  on public.people(workspace_id);

alter table public.people enable row level security;

create policy "users see only their own people"
  on public.people for select using (auth.uid() = user_id);
create policy "users insert own people"
  on public.people for insert with check (auth.uid() = user_id);
create policy "users update own people"
  on public.people for update using (auth.uid() = user_id);
create policy "users delete own people"
  on public.people for delete using (auth.uid() = user_id);

create trigger people_touch_updated_at
  before update on public.people
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- User settings (theme, density, look, layout prefs)
-- =============================================================================
create table public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "users read own settings"
  on public.user_settings for select using (auth.uid() = user_id);
create policy "users insert own settings"
  on public.user_settings for insert with check (auth.uid() = user_id);
create policy "users update own settings"
  on public.user_settings for update using (auth.uid() = user_id);

create trigger user_settings_touch_updated_at
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- Taxonomy (per-workspace custom projects / tags / life areas)
-- =============================================================================
create table public.taxonomy (
  workspace_id  uuid primary key references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  contexts      jsonb not null default '[]'::jsonb,
  tags          jsonb not null default '[]'::jsonb,
  life_areas    jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now()
);

alter table public.taxonomy enable row level security;

create policy "users read own taxonomy"
  on public.taxonomy for select using (auth.uid() = user_id);
create policy "users insert own taxonomy"
  on public.taxonomy for insert with check (auth.uid() = user_id);
create policy "users update own taxonomy"
  on public.taxonomy for update using (auth.uid() = user_id);

create trigger taxonomy_touch_updated_at
  before update on public.taxonomy
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- New-user bootstrap: create a default workspace on signup.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspaces (user_id, name) values (new.id, 'Personal');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
