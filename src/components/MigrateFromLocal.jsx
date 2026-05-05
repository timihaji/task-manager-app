import React, { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useWorkspace } from '../lib/WorkspaceProvider.jsx';
import {
  upsertTasks, saveSettings, saveTaxonomy, upsertPerson,
} from '../lib/db.js';
import { migrateTasks } from '../data.js';

const MIGRATED_KEY = 'tm_migrated_to_cloud';

// Read everything we want to bring across in one pass so the banner can
// say something concrete ("Found 47 tasks and 3 contacts...") before the
// user commits.
function readLocalData() {
  const safeParse = (raw, fallback) => {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  };

  const tasksRaw = localStorage.getItem('tm_tasks_v2');
  const tasks = Array.isArray(safeParse(tasksRaw, null)) ? safeParse(tasksRaw, []) : [];

  const settings = safeParse(localStorage.getItem('tm_settings'), null);
  const taxonomy = safeParse(localStorage.getItem('tm_taxonomy'), null);
  const filterPrefs = safeParse(localStorage.getItem('tm_filter_prefs'), null);
  const groupPrefs = safeParse(localStorage.getItem('tm_group_prefs'), null);
  const recentBlockReasons = safeParse(localStorage.getItem('tm_recent_block_reasons'), null);
  const peopleMap = safeParse(localStorage.getItem('tm_delegation_people_v1'), null);
  const peopleArr = peopleMap && typeof peopleMap === 'object'
    ? Object.values(peopleMap).filter(p => p && p.displayName)
    : [];

  const hasAny =
    tasks.length > 0 ||
    !!settings ||
    !!taxonomy ||
    !!filterPrefs ||
    !!groupPrefs ||
    (Array.isArray(recentBlockReasons) && recentBlockReasons.length > 0) ||
    peopleArr.length > 0;

  return {
    hasAny,
    tasks,
    settings,
    taxonomy,
    filterPrefs,
    groupPrefs,
    recentBlockReasons: Array.isArray(recentBlockReasons) ? recentBlockReasons : [],
    people: peopleArr,
  };
}

// Topologically sort tasks so parents land before children. Two FK
// constraints to satisfy: parent_id and check_in_of. Within a single
// upsert batch Postgres checks FKs at end-of-statement, but batches of
// 100 can split a parent away from its children — order eliminates the
// race.
function sortTasksByDependency(tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const sorted = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = (t) => {
    if (visited.has(t.id)) return;
    if (visiting.has(t.id)) return; // cycle guard — bail rather than recurse
    visiting.add(t.id);
    if (t.parentId && byId.has(t.parentId)) visit(byId.get(t.parentId));
    if (t.checkInOf && byId.has(t.checkInOf)) visit(byId.get(t.checkInOf));
    visiting.delete(t.id);
    visited.add(t.id);
    sorted.push(t);
  };
  for (const t of tasks) visit(t);
  return sorted;
}

function chunked(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function MigrateFromLocal({ onComplete }) {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const local = useMemo(readLocalData, []);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  if (!local.hasAny) return null;

  const onImport = async () => {
    if (!user?.id || !workspace?.id) return;
    setRunning(true);
    setError(null);
    try {
      const userId = user.id;
      const workspaceId = workspace.id;

      if (local.tasks.length) {
        const migrated = migrateTasks(local.tasks);
        const sorted = sortTasksByDependency(migrated);
        let done = 0;
        for (const batch of chunked(sorted, 100)) {
          await upsertTasks(batch, userId, workspaceId);
          done += batch.length;
          setProgress({ stage: 'tasks', done, total: sorted.length });
        }
      }

      // Settings: bundle the small UI prefs into the same blob the rest
      // of the app now persists to user_settings.settings.
      if (local.settings || local.filterPrefs || local.groupPrefs || local.recentBlockReasons.length) {
        setProgress({ stage: 'settings' });
        await saveSettings(userId, {
          ...(local.settings || {}),
          ...(local.filterPrefs ? { filterPrefs: local.filterPrefs } : {}),
          ...(local.groupPrefs ? { groupPrefs: local.groupPrefs } : {}),
          ...(local.recentBlockReasons.length ? { recentBlockReasons: local.recentBlockReasons } : {}),
        });
      }

      if (local.taxonomy) {
        setProgress({ stage: 'taxonomy' });
        await saveTaxonomy(workspaceId, userId, local.taxonomy);
      }

      if (local.people.length) {
        setProgress({ stage: 'people', done: 0, total: local.people.length });
        for (let i = 0; i < local.people.length; i++) {
          await upsertPerson(local.people[i], userId, workspaceId);
          setProgress({ stage: 'people', done: i + 1, total: local.people.length });
        }
      }

      localStorage.setItem(MIGRATED_KEY, 'imported');
      setProgress({ stage: 'done' });
      onComplete?.();
    } catch (e) {
      console.error('[migrate] failed', e);
      setError(e);
      setRunning(false);
    }
  };

  const onSkip = () => {
    if (!window.confirm(
      'Skip will leave your local browser data behind. ' +
      'Your account will start fresh in the cloud, but the local data ' +
      'remains in this browser if you change your mind. Continue?'
    )) return;
    localStorage.setItem(MIGRATED_KEY, 'skipped');
    onComplete?.();
  };

  const summary = [];
  if (local.tasks.length) summary.push(`${local.tasks.length} task${local.tasks.length === 1 ? '' : 's'}`);
  if (local.people.length) summary.push(`${local.people.length} contact${local.people.length === 1 ? '' : 's'}`);
  if (local.taxonomy) summary.push('taxonomy');
  if (local.settings || local.filterPrefs || local.groupPrefs || local.recentBlockReasons.length) {
    summary.push('settings');
  }

  return (
    <div className="migrate-banner" role="dialog" aria-label="Import local data">
      <div className="migrate-icon" aria-hidden="true">↑</div>
      <div className="migrate-body">
        <div className="migrate-title">Local data found in this browser</div>
        <div className="migrate-detail">
          {summary.join(' · ')}. Import into your account, or skip and start fresh.
        </div>
        {progress && progress.stage !== 'done' && (
          <div className="migrate-progress" aria-live="polite">
            {progress.stage === 'tasks' && `Importing tasks: ${progress.done} / ${progress.total}`}
            {progress.stage === 'settings' && 'Importing settings…'}
            {progress.stage === 'taxonomy' && 'Importing taxonomy…'}
            {progress.stage === 'people' && `Importing contacts: ${progress.done} / ${progress.total}`}
          </div>
        )}
        {error && (
          <div className="migrate-error" role="alert">
            Import failed: {error?.message || String(error)}. Local data is intact — you can retry.
          </div>
        )}
      </div>
      <div className="migrate-actions">
        <button className="tb-btn" onClick={onSkip} disabled={running}>Skip</button>
        <button className="tb-btn primary" onClick={onImport} disabled={running}>
          {running ? 'Importing…' : 'Import'}
        </button>
      </div>
    </div>
  );
}
