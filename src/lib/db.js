// Data-access layer for Supabase.
//
// Wraps Supabase queries behind a small, app-shaped API. Components should
// import functions from here rather than calling `supabase` directly so that
// the snake_case <-> camelCase mapping and table layout stays in one place.
//
// Status: PR A — module created and wired for the workspace bootstrap.
// Tasks/settings/taxonomy/people CRUD shells are present but not yet called
// from components; they will be exercised in PRs B–E.

import { supabase } from './supabase.js';

// ---------------------------------------------------------------------------
// Field maps (snake_case <-> camelCase)
// ---------------------------------------------------------------------------

const TASK_TO_ROW_KEYS = {
  cardType: 'card_type',
  parentId: 'parent_id',
  childOrder: 'child_order',
  lifeArea: 'life_area',
  timeEstimate: 'time_estimate',
  completedAt: 'completed_at',
  snoozedUntil: 'snoozed_until',
  blockedReason: 'blocked_reason',
  blockedBy: 'blocked_by',
  blockedSince: 'blocked_since',
  followUpAt: 'follow_up_at',
  delegatedTo: 'delegated_to',
  delegatedAt: 'delegated_at',
  delegationStatus: 'delegation_status',
  checkInSchedule: 'check_in_schedule',
  checkInTaskIds: 'check_in_task_ids',
  checkInOf: 'check_in_of',
  checkInDayOffset: 'check_in_day_offset',
  expiryDate: 'expiry_date',
  expiryTaskId: 'expiry_task_id',
  expiryOf: 'expiry_of',
  lastContactAt: 'last_contact_at',
  delegationHistory: 'delegation_history',
  sourceId: 'source_id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const ROW_TO_TASK_KEYS = Object.fromEntries(
  Object.entries(TASK_TO_ROW_KEYS).map(([k, v]) => [v, k])
);

// Fields that are always present on every row (don't get mapped).
const PASSTHROUGH_TASK_KEYS = new Set([
  'id', 'title', 'description', 'project', 'tags', 'priority',
  'date', 'done', 'recurrence', 'blocked', 'activity', 'archived', 'source',
  'workspace_id', 'user_id',
]);

// camelCase task object -> snake_case Postgres row.
// userId/workspaceId are added explicitly because the JS object doesn't
// usually carry them.
export function taskToRow(task, userId, workspaceId) {
  const row = { user_id: userId, workspace_id: workspaceId };
  for (const [k, v] of Object.entries(task || {})) {
    if (v === undefined) continue;
    const dbKey = TASK_TO_ROW_KEYS[k] || k;
    row[dbKey] = v;
  }
  return row;
}

// snake_case Postgres row -> camelCase task object.
export function rowToTask(row) {
  if (!row) return row;
  const task = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'workspace_id' || k === 'user_id') continue; // app doesn't need these
    const jsKey = ROW_TO_TASK_KEYS[k] || k;
    task[jsKey] = v;
  }
  return task;
}

// People mappers — schema fields: name, preferred_cadence, open_count,
// last_contact_at, delegation_history.
export function personToRow(person, userId, workspaceId) {
  return {
    user_id: userId,
    workspace_id: workspaceId,
    ...(person.id ? { id: person.id } : {}),
    name: person.displayName || person.name || '',
    preferred_cadence: person.preferredCadence ?? null,
    open_count: person.openDelegations ?? person.openCount ?? 0,
    last_contact_at: person.lastContactAt ?? null,
    delegation_history: person.delegationHistory ?? [],
  };
}

export function rowToPerson(row) {
  if (!row) return row;
  return {
    id: row.id,
    displayName: row.name,
    preferredCadence: row.preferred_cadence ?? null,
    openDelegations: row.open_count ?? 0,
    lastContactAt: row.last_contact_at ?? null,
    delegationHistory: row.delegation_history ?? [],
  };
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

// Fetch the user's first workspace, creating one if none exists. The auth
// trigger `handle_new_user` already inserts a "Personal" workspace at signup,
// so the create branch is a defensive fallback (e.g. existing accounts
// predating the trigger, or a race during signup).
export async function getOrCreateWorkspace(userId) {
  if (!supabase) throw new Error('Supabase client not configured');
  if (!userId) throw new Error('getOrCreateWorkspace: userId required');

  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  if (data && data[0]) return data[0];

  const { data: created, error: insertError } = await supabase
    .from('workspaces')
    .insert({ user_id: userId, name: 'Personal' })
    .select()
    .single();
  if (insertError) throw insertError;
  return created;
}

// ---------------------------------------------------------------------------
// Tasks (PR B)
// ---------------------------------------------------------------------------

export async function fetchTasks(workspaceId) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToTask);
}

export async function upsertTask(task, userId, workspaceId) {
  if (!supabase) throw new Error('Supabase client not configured');
  const row = taskToRow(task, userId, workspaceId);
  const { error } = await supabase.from('tasks').upsert(row);
  if (error) throw error;
}

export async function upsertTasks(tasks, userId, workspaceId) {
  if (!supabase) throw new Error('Supabase client not configured');
  if (!tasks?.length) return;
  const rows = tasks.map((t) => taskToRow(t, userId, workspaceId));
  const { error } = await supabase.from('tasks').upsert(rows);
  if (error) throw error;
}

export async function deleteTask(id) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Settings (PR C)
// ---------------------------------------------------------------------------

export async function fetchSettings(userId) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data, error } = await supabase
    .from('user_settings')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.settings ?? null;
}

export async function saveSettings(userId, settings) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, settings });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Taxonomy (PR C)
// ---------------------------------------------------------------------------

export async function fetchTaxonomy(workspaceId) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data, error } = await supabase
    .from('taxonomy')
    .select('contexts, tags, life_areas')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    contexts: data.contexts ?? [],
    tags: data.tags ?? [],
    lifeAreas: data.life_areas ?? [],
  };
}

export async function saveTaxonomy(workspaceId, userId, taxonomy) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { error } = await supabase.from('taxonomy').upsert({
    workspace_id: workspaceId,
    user_id: userId,
    contexts: taxonomy.contexts ?? [],
    tags: taxonomy.tags ?? [],
    life_areas: taxonomy.lifeAreas ?? [],
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// People (PR C)
// ---------------------------------------------------------------------------

export async function fetchPeople(workspaceId) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('workspace_id', workspaceId);
  if (error) throw error;
  return (data || []).map(rowToPerson);
}

export async function upsertPerson(person, userId, workspaceId) {
  if (!supabase) throw new Error('Supabase client not configured');
  const row = personToRow(person, userId, workspaceId);
  const { error } = await supabase
    .from('people')
    .upsert(row, { onConflict: 'workspace_id,name' });
  if (error) throw error;
}

export async function deletePerson(id) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { error } = await supabase.from('people').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Realtime (PR D)
// ---------------------------------------------------------------------------

// Returns an unsubscribe function. `onChange` receives the raw Supabase
// payload — the consumer is responsible for diffing and applying to local
// state without re-broadcasting its own writes.
export function subscribeTasks(workspaceId, onChange) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`tasks:${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
