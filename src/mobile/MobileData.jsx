import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { DataContext } from './contexts.js';
import {
  PROJECTS_DEFAULT, ALL_TAGS_DEFAULT, TAG_COLORS_DEFAULT, tagColorFor,
  LIFE_AREAS_DEFAULT, PRI, TIME_OPTS, SNOOZE_OPTS,
} from './constants.js';
import {
  D, TODAY, TOMORROW, YESTER, IN2, IN3, IN5, IN7, IN10, IN14, mkid,
} from './dateUtil.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useWorkspace } from '../lib/WorkspaceProvider.jsx';
import {
  fetchTasks, syncTaskDiff,
  fetchTaxonomy,
  subscribeTasks, subscribeTaxonomy,
  rowToTask, normalizeTask,
} from '../lib/db.js';
import { computePosition } from '../utils/position.js';

const SEED_KEY = 'tm_mobile_devseed_v1';

// Tiny seed for dev-bypass mode so a brand-new mobile preview boots into
// something exercising every view. Mirrors the design's INIT_TASKS but
// trimmed to keep the dev cache small.
function devSeed() {
  return [
    { id:'tk1', title:'Review Q2 product roadmap',     date:TODAY,    project:'work',     tags:['strategic'], priority:'p1', timeEstimate:'1h',  done:false, lifeArea:'work' },
    { id:'tk2', title:'Send weekly status update',     date:TODAY,    project:'work',     tags:['admin'],     priority:'p2', timeEstimate:'30m', done:false, lifeArea:'work' },
    { id:'tk3', title:'Gym — leg day',                 date:TODAY,    project:'health',   tags:['health'],    priority:'p2', timeEstimate:'1h 30m', done:true, lifeArea:'health' },
    { id:'tk4', title:"Call mom — it's her birthday",  date:TODAY,    project:'personal', tags:['calls'],     priority:'p1', timeEstimate:'30m', done:false, lifeArea:'personal' },
    { id:'tk5', title:'Fix navigation bug on mobile',  date:TODAY,    project:'side',     tags:['creative'],  priority:'p2', timeEstimate:'2h',  done:false, lifeArea:'work' },
    { id:'tk31', title:'Daily standup',                 date:TODAY,    project:'work',     tags:['calls'],     priority:'p2', timeEstimate:'15m', done:false, lifeArea:'work',
      recurrence:{ type:'daily', isRoutine:true, recurrenceId:'r-standup', label:'Daily' } },
    { id:'tk38', title:'Meditation — 10 min',           date:TODAY,    project:'health',   tags:['health'],    priority:'p2', timeEstimate:'10m', done:true,  lifeArea:'health',
      recurrence:{ type:'daily', isRoutine:true, recurrenceId:'r-meditation', label:'Daily' } },
    { id:'tk7', title:'Prepare slides for all-hands',  date:TOMORROW, project:'work',     tags:['strategic','writing'], priority:'p1', timeEstimate:'3h', done:false, lifeArea:'work' },
    { id:'tk8', title:'Dentist appointment',           date:TOMORROW, project:'health',   tags:['health'],    priority:'p2', timeEstimate:'1h', done:false, lifeArea:'health', dueDate:TOMORROW },
    { id:'tk9', title:'Write blog post draft',         date:IN2,      project:'side',     tags:['writing','creative'], priority:'p2', timeEstimate:'2h', done:false, lifeArea:'work' },
    { id:'tk11', title:'Monthly budget review',         date:IN7,      project:'finance',  tags:['review','planning'],  priority:'p2', timeEstimate:'1h', done:false, lifeArea:'finance' },
    { id:'tk14', title:'Research noise-canceling headphones', date:null, project:'personal', tags:['research'], priority:'p3', timeEstimate:'30m', done:false, lifeArea:'personal' },
    { id:'tk15', title:'Set up automated backups',      date:null,     project:'side',     tags:['admin'],     priority:'p2', timeEstimate:'1h', done:false, lifeArea:'work' },
    { id:'tk16', title:'Read "Atomic Habits" ch. 4',   date:null,     project:'learning', tags:['research'],  priority:'p3', timeEstimate:'45m', done:false, lifeArea:'personal' },
    { id:'tk19', title:'Learn to play guitar',          date:null, someday:true, project:'personal', tags:['creative'], priority:'p3', done:false, lifeArea:'personal' },
    { id:'tk22', title:'Evaluate new PM tool',          date:null, snoozedUntil:IN7,  project:'work',    tags:['research'], priority:'p3', done:false, lifeArea:'work' },
    { id:'tk24', title:'Deploy new feature',            date:IN3,  blocked:true, blockedReason:'Waiting for security review', blockedSince:YESTER, project:'work', tags:['strategic'], priority:'p1', done:false, lifeArea:'work' },
    { id:'tk26', title:'Update API documentation',      date:IN3,  project:'work',    tags:['writing'],  priority:'p2', delegatedTo:'Priya',  delegationStatus:'waiting',     done:false, lifeArea:'work' },
    { id:'tk27', title:'Design new landing page mockups', date:IN5, project:'side', tags:['creative'],  priority:'p2', delegatedTo:'Marcus', delegationStatus:'in_progress', done:false, lifeArea:'work' },
    { id:'tk28', title:'Negotiate office lease',        date:IN10, project:'work',    tags:['strategic'], priority:'p1', delegatedTo:'Sarah',  delegationStatus:'stale',       done:false, lifeArea:'work' },
    { id:'tk29', title:'Set up CI/CD pipeline',         date:YESTER, project:'work',    tags:['strategic'], priority:'p2', done:true, lifeArea:'work' },
    { id:'tk30', title:'Complete Q1 review',            date:YESTER, project:'work',    tags:['admin'],     priority:'p1', done:true, lifeArea:'work' },
  ];
}

function loadDevTasks() {
  let tasks;
  try {
    const raw = localStorage.getItem(SEED_KEY);
    if (raw) tasks = JSON.parse(raw);
  } catch {}
  if (!tasks) tasks = devSeed();
  // Backfill positions for any task missing one — reorder needs neighbors
  // to have positions for computePosition to produce meaningful values.
  let needsSave = false;
  tasks = tasks.map((t, i) => {
    if (t.position == null) { needsSave = true; return { ...t, position: (i + 1) * 100 }; }
    return t;
  });
  if (needsSave) { try { localStorage.setItem(SEED_KEY, JSON.stringify(tasks)); } catch {} }
  return tasks;
}

function saveDevTasks(tasks) {
  try { localStorage.setItem(SEED_KEY, JSON.stringify(tasks)); } catch {}
}

// Derive projects/tags/life-areas from the loaded taxonomy if present;
// fall back to the design defaults otherwise.
function deriveTaxonomy(taxonomy) {
  if (!taxonomy) {
    return {
      PROJECTS: PROJECTS_DEFAULT,
      ALL_TAGS: ALL_TAGS_DEFAULT,
      TAG_COLORS: TAG_COLORS_DEFAULT,
      LIFE_AREAS: LIFE_AREAS_DEFAULT,
    };
  }
  const projects = (taxonomy.contexts || []).map(c => ({
    id: c.id || c.slug || c.label,
    label: c.label || c.name || c.id,
    color: c.color || c.swatch || '#94a3b8',
  }));
  const tagsArr = (taxonomy.tags || []).map(t => ({
    id: t.id || t.slug || t.label,
    label: t.label || t.name || t.id,
  }));
  const ALL_TAGS = Object.fromEntries(tagsArr.map(t => [t.id, t.label]));
  const TAG_COLORS = {};
  tagsArr.forEach(t => { TAG_COLORS[t.id] = tagColorFor(t.id); });
  const lifeAreas = (taxonomy.lifeAreas || []).map(a => ({
    id: a.id || a.slug || a.label,
    label: a.label || a.name || a.id,
    color: a.color || a.swatch || '#94a3b8',
  }));
  return {
    PROJECTS: projects.length ? projects : PROJECTS_DEFAULT,
    ALL_TAGS: Object.keys(ALL_TAGS).length ? ALL_TAGS : ALL_TAGS_DEFAULT,
    TAG_COLORS: Object.keys(TAG_COLORS).length ? TAG_COLORS : TAG_COLORS_DEFAULT,
    LIFE_AREAS: lifeAreas.length ? lifeAreas : LIFE_AREAS_DEFAULT,
  };
}

export function DataProvider({ children }) {
  const { user, supabaseDisabled } = useAuth();
  const { workspace } = useWorkspace();
  const userId = user?.id ?? null;
  const workspaceId = workspace?.id ?? null;

  const [tasks, setTasks] = useState(() => supabaseDisabled ? loadDevTasks() : []);
  const [taxonomy, setTaxonomy] = useState(null);

  // Echo-loop guard: remember the last task version we either sent OR
  // received from realtime; suppress reapplying when it matches.
  const lastSyncedRef = useRef(new Map());
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (supabaseDisabled) return;
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchTasks(workspaceId);
        if (cancelled) return;
        rows.forEach(t => lastSyncedRef.current.set(t.id, JSON.stringify(t)));
        setTasks(rows);
      } catch (err) {
        console.error('[mobile] fetchTasks failed', err);
      }
      try {
        const tax = await fetchTaxonomy(workspaceId);
        if (cancelled) return;
        setTaxonomy(tax);
      } catch (err) {
        console.error('[mobile] fetchTaxonomy failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [supabaseDisabled, workspaceId]);

  // ── Realtime ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (supabaseDisabled || !workspaceId) return;
    const off1 = subscribeTasks(workspaceId, (payload) => {
      const { eventType, new: row, old } = payload;
      if (eventType === 'DELETE') {
        const id = old?.id;
        if (!id) return;
        if (!tasksRef.current.some(t => t.id === id)) return;
        lastSyncedRef.current.delete(id);
        setTasks(prev => prev.filter(t => t.id !== id));
        return;
      }
      const incoming = normalizeTask(rowToTask(row));
      if (!incoming?.id) return;
      const key = JSON.stringify(incoming);
      if (lastSyncedRef.current.get(incoming.id) === key) return; // echo
      lastSyncedRef.current.set(incoming.id, key);
      setTasks(prev => {
        const idx = prev.findIndex(t => t.id === incoming.id);
        if (idx === -1) return [...prev, incoming];
        const next = prev.slice();
        next[idx] = { ...prev[idx], ...incoming };
        return next;
      });
    });
    const off2 = subscribeTaxonomy(workspaceId, async () => {
      try {
        const tax = await fetchTaxonomy(workspaceId);
        setTaxonomy(tax);
      } catch {}
    });
    return () => { off1?.(); off2?.(); };
  }, [supabaseDisabled, workspaceId]);

  // ── Debounced sync of local mutations to Supabase ───────────────────────
  const prevTasksRef = useRef(tasks);
  const syncTimerRef = useRef(null);
  const pendingSyncRef = useRef(false);

  const flushSync = useCallback(() => {
    if (supabaseDisabled || !workspaceId || !userId) {
      saveDevTasks(tasksRef.current);
      return;
    }
    const prev = prevTasksRef.current;
    const next = tasksRef.current;
    prevTasksRef.current = next;
    pendingSyncRef.current = false;
    // Update echo guard for outgoing writes so the realtime echo is suppressed.
    next.forEach(t => lastSyncedRef.current.set(t.id, JSON.stringify(t)));
    syncTaskDiff(prev, next, userId, workspaceId).catch(err => {
      console.error('[mobile] syncTaskDiff failed', err);
    });
  }, [supabaseDisabled, workspaceId, userId]);

  const scheduleSync = useCallback(() => {
    pendingSyncRef.current = true;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(flushSync, 80);
  }, [flushSync]);

  useEffect(() => {
    const onLeave = () => { if (pendingSyncRef.current) flushSync(); };
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [flushSync]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const mutate = useCallback((reducer) => {
    setTasks(prev => {
      const next = reducer(prev);
      tasksRef.current = next;
      if (supabaseDisabled) saveDevTasks(next);
      else scheduleSync();
      return next;
    });
  }, [supabaseDisabled, scheduleSync]);

  const updateTask = useCallback((id, patch) => {
    mutate(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }, [mutate]);

  const addTask = useCallback((data) => {
    const now = new Date().toISOString();
    // Compute a position so the new task slots above the existing top of its
    // bucket (same date / null=inbox). Without this, syncTaskDiff sends a
    // row with no `position`, so on desktop the task sorts by created_at —
    // not where the mobile user expects it.
    let position;
    setTasks(prev => {
      const bucket = prev
        .filter(t => !t.archived && !t.parentId && (t.date || null) === (data.date || null))
        .sort((a,b) => (a.position ?? 1e9) - (b.position ?? 1e9));
      const below = bucket[0] || null;
      position = computePosition(null, below);
      const t = { id: mkid(), done: false, tags: [], createdAt: now, position, ...data };
      const next = [t, ...prev];
      tasksRef.current = next;
      if (supabaseDisabled) saveDevTasks(next);
      else scheduleSync();
      return next;
    });
    return { position };
  }, [supabaseDisabled, scheduleSync]);

  const deleteTask = useCallback((id) => {
    mutate(prev => prev.filter(t => t.id !== id));
    if (!supabaseDisabled) lastSyncedRef.current.delete(id);
  }, [mutate, supabaseDisabled]);

  const toggleTask = useCallback((id) => {
    mutate(prev => prev.map(t => {
      if (t.id !== id) return t;
      const done = !t.done;
      return { ...t, done, completedAt: done ? new Date().toISOString() : null };
    }));
  }, [mutate]);

  const archiveTask = useCallback((id) => {
    mutate(prev => prev.map(t => t.id === id ? { ...t, archived: true, done: false } : t));
  }, [mutate]);

  const duplicateTask = useCallback((id) => {
    mutate(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const orig = prev[idx];
      const copy = { ...orig, id: mkid(), done: false };
      const next = prev.slice();
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, [mutate]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const all = useMemo(() => tasks.filter(t => !t.archived && !t.parentId).sort((a,b) => (a.position ?? 1e9) - (b.position ?? 1e9)), [tasks]);
  const views = useMemo(() => ({
    today:     all.filter(t => D.isTdy(t.date)),
    inbox:     all.filter(t => !t.date && !t.done && !t.snoozedUntil && !t.someday && !t.blocked && !t.delegatedTo),
    upcoming:  all.filter(t => D.isFut(t.date) && !t.done),
    backlog:   all.filter(t => !t.date && !t.done && !t.snoozedUntil && !t.someday && !t.blocked && !t.delegatedTo),
    snoozed:   all.filter(t => !!t.snoozedUntil && !t.done),
    someday:   all.filter(t => !!t.someday && !t.done),
    blocked:   all.filter(t => !!t.blocked && !t.done),
    completed: all.filter(t => t.done),
    archived:  tasks.filter(t => t.archived),
    delegated: all.filter(t => !!t.delegatedTo && !t.done),
    stack:     all.filter(t => !t.done && !t.snoozedUntil && !t.someday),
    routines:  all.filter(t => t.recurrence?.isRoutine),
  }), [all, tasks]);

  const tax = useMemo(() => deriveTaxonomy(taxonomy), [taxonomy]);

  const value = useMemo(() => ({
    tasks, all, views,
    updateTask, addTask, deleteTask, toggleTask, archiveTask, duplicateTask,
    PROJECTS: tax.PROJECTS,
    ALL_TAGS: tax.ALL_TAGS,
    TAG_COLORS: tax.TAG_COLORS,
    LIFE_AREAS: tax.LIFE_AREAS,
    PRI, TIME_OPTS, SNOOZE_OPTS,
    D, TODAY, TOMORROW, YESTER, IN2, IN3, IN5, IN7, IN10, IN14,
  }), [tasks, all, views, updateTask, addTask, deleteTask, toggleTask, archiveTask, duplicateTask, tax]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
