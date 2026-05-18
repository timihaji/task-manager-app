-- Buckets redesign.
--
-- Replaces the previous twin categorisation primitives (customGroups + life_area)
-- with a single user-curated "bucket" concept. The legacy `group_id` column —
-- originally for ad-hoc multi-select-and-group — is reused as `bucket_id` since
-- the data shape ({id} pointing at a user-curated {id,name,color}) is identical.
--
-- `bucket_position` is new: a per-task decimal that lets users manually order
-- cards within a bucket column on the Buckets view (drag-to-reorder). Lives
-- alongside the existing `position` column, which is the global-per-day sort
-- used by Timeline / Stack. Both can be set on the same task without colliding.
--
-- `life_area` stays in the schema for now. Post-migration the app stops
-- writing to it; a future cleanup migration can drop it once the dust has
-- settled.

alter table public.tasks
  rename column group_id to bucket_id;

alter index if exists tasks_group_id_idx
  rename to tasks_bucket_id_idx;

alter table public.tasks
  add column if not exists bucket_position double precision;

create index if not exists tasks_bucket_position_idx
  on public.tasks (workspace_id, bucket_id, bucket_position);
