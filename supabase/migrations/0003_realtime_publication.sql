-- Enable Realtime broadcasts for the synced tables.
--
-- Supabase ships a `supabase_realtime` publication that the Realtime
-- service listens on. Tables aren't included by default; adding them
-- here turns on `postgres_changes` events for INSERT/UPDATE/DELETE.
-- RLS still applies — clients only receive events for rows they're
-- allowed to read.
--
-- Apply via Supabase Studio → SQL Editor.

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.taxonomy;
alter publication supabase_realtime add table public.people;

-- Default `replica identity` only logs the primary key in DELETE events.
-- That's a problem for filtered subscriptions (`workspace_id=eq.<id>`):
-- the workspace_id isn't in the old row image, the broadcast filter
-- misses, and clients never see the delete. `replica identity full`
-- includes every column in the old row image so filtered DELETEs (and
-- partial UPDATE old-image fields) propagate correctly.
alter table public.tasks      replica identity full;
alter table public.taxonomy   replica identity full;
alter table public.people     replica identity full;
