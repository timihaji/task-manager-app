// Data-access layer for calendar events. Mirrors src/lib/db.js: snake_case
// rows in Postgres, camelCase objects in JS, and a single allow-list that
// keeps the upsert column shape stable.
//
// Writes are no-ops when the Supabase client isn't configured (dev-bypass
// mode), so callers don't need to branch.

import { supabase } from './supabase.js';

const EVENT_TO_ROW_KEYS = {
  taskId: 'task_id',
  workspaceId: 'workspace_id',
  userId: 'user_id',
  startMin: 'start_min',
  durationMin: 'duration_min',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const ROW_TO_EVENT_KEYS = Object.fromEntries(
  Object.entries(EVENT_TO_ROW_KEYS).map(([k, v]) => [v, k])
);

const EVENT_DB_COLUMNS = new Set([
  'id', 'workspace_id', 'user_id',
  'task_id', 'date', 'start_min', 'duration_min',
  'title', 'color',
  'created_at', 'updated_at',
]);

export function eventToRow(event, userId, workspaceId) {
  const row = {
    user_id: userId,
    workspace_id: workspaceId,
  };
  for (const [k, v] of Object.entries(event || {})) {
    if (v === undefined) continue;
    const dbKey = EVENT_TO_ROW_KEYS[k] || k;
    if (!EVENT_DB_COLUMNS.has(dbKey)) continue;
    row[dbKey] = v;
  }
  return row;
}

export function rowToEvent(row) {
  if (!row) return row;
  const ev = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'workspace_id' || k === 'user_id') continue;
    const jsKey = ROW_TO_EVENT_KEYS[k] || k;
    ev[jsKey] = v;
  }
  return ev;
}

// Fetch every event on a given YYYY-MM-DD for the workspace. Sorted by
// start_min so consumers get them in chronological order.
export async function fetchEvents(workspaceId, dateStr) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('date', dateStr)
    .order('start_min', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToEvent);
}

// Fetch every event for a workspace, regardless of date. Used by the App
// shell to keep the events array in memory once at boot — drawer day
// navigation then becomes a client-side filter.
export async function fetchAllEvents(workspaceId) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('date', { ascending: true })
    .order('start_min', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToEvent);
}

export async function upsertEvent(event, userId, workspaceId) {
  if (!supabase) return;
  const row = eventToRow(event, userId, workspaceId);
  const { error } = await supabase.from('events').upsert(row);
  if (error) throw error;
}

export async function deleteEvent(id) {
  if (!supabase) return;
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}
