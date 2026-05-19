import { TaskDrawer } from './drawer.jsx';
import { DelegationsView } from './delegations.jsx';
import { RoutinesView } from './components/RoutinesView.jsx';
import {
  PROJ,
  ALL_TAGS,
  TAG_NAMES,
  TAG_DARK,
  TAG_LIGHT,
  LIFE_AREAS,
  LIFE_AREA_NAMES,
  LIFE_AREA_DARK,
  LIFE_AREA_LIGHT,
  LIFE_AREA_KEYWORDS,
  mkid,
  syncUidFromTasks,
  D,
  getWeekDays,
  MONTH_S,
  DAY_S,
  DAY_L,
  fmtWeek,
  nextOccurrence,
  recurrenceLabel,
  ensureRecurrenceFields,
  mkRecurrenceId,
  migrateRecurrence,
  syncTaskSnooze,
  rollTaskDateForward,
  rollIncompleteTasksToToday,
  archiveStaleRoutines,
  extendRoutineHorizon,
  pruneOrphanCheckIns,
  repairMissingCheckIns,
  makeTask,
  migrateTasks,
  parseTimeEst,
  fmtTimeEst,
  INIT_TASKS,
  INIT_EVENTS,
  daysSince,
  defaultLifeAreaForLocation,
  suggestLifeAreaFromTitle,
  CHECKIN_PRESETS,
  CHECKIN_PRESET_LABELS,
  matchPreset,
  buildCheckInTasks,
  buildExpiryTask,
  stretchSchedule,
  isStale,
  loadPeople,
  savePeople,
  setPeopleCache,
  setPeoplePersister,
  recordDelegation,
  adjustOpenCount,
  getPreferredCadence,
  recordContact,
  peopleRollup,
  personKey,
} from './data.js';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useDeferredValue  } from "react";
import ReactDOM from "react-dom/client";
import { useAuth } from './auth/AuthProvider.jsx';
import { useWorkspace } from './lib/WorkspaceProvider.jsx';
import {
  fetchTasks, syncTaskDiff,
  fetchSettings, saveSettings,
  fetchTaxonomy, saveTaxonomy,
  fetchPeople, upsertPerson,
  subscribeTasks, subscribeTaxonomy, subscribePeople,
  rowToTask, rowToPerson, normalizeTask,
  bucketColumnsMissing,
} from './lib/db.js';
// ── extracted utilities ──────────────────────────────────────────────────
import { I } from './utils/icons.jsx';
import { TIME_PRESETS, TIME_MORE, PRI_INFO, SNOOZE_OPTS } from './utils/constants.js';
import { parseNLDate } from './utils/parseNLDate.js';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useDndSensors, getInsertionIndex, compositeCollisionDetection } from './utils/dnd.js';
import { computePosition } from './utils/position.js';
import {
  sortBucketTasks,
  BUCKETS_SORT_MODES,
} from './utils/buckets.js';
import * as haptics from './utils/haptics.js';

// ── extracted leaf components ────────────────────────────────────────────
import { CardPopover, StackPickerPopover } from './components/CardPopover.jsx';
import { MiniCalendar } from './components/MiniCalendar.jsx';
import { TagPicker, ProjPicker, TimePicker, DatePicker, PriPicker, SnoozePicker } from './components/pickers.jsx';
import { ContextMenu } from './components/ContextMenu.jsx';
import { PriBars } from './components/PriBars.jsx';

// ── TaskCard ─────────────────────────────────────────────────────────────
// ── extracted heavy components ───────────────────────────────────────────
import { TaskCard } from './components/TaskCard.jsx';
import { GroupByDropdown } from './components/GroupByDropdown.jsx';
import { Column, InboxCol } from './components/Column.jsx';
import { SnoozeTickProvider, AutoWakeWatcher } from './components/SnoozeCountdown.jsx';
// ── extracted view components ────────────────────────────────────────────
import { ProjectSidePanel, LeftNav } from './components/sidebar.jsx';
import { CMDS, CommandPalette, SC_ROWS, ShortcutsOverlay } from './components/modals.jsx';
import { SwatchPicker, CardColorPopover, SettingsScrollPane, TaxonomyManager, PRESETS_DATA, SettingsView, SettingsDrawer } from './components/settings.jsx';
import { ListTaskItem, ListView } from './components/ListView.jsx';
import { StackView } from './components/StackView.jsx';
import { BucketsView } from './components/BucketsView.jsx';
import { TagsView } from './components/TagsView.jsx';
import { AddModal } from './components/AddModal.jsx';
import { QuickEntry } from './components/QuickEntry.jsx';
import { MigrateFromLocal } from './components/MigrateFromLocal.jsx';
import CalendarDrawer from './components/CalendarDrawer.jsx';
import { fetchAllEvents, upsertEvent, deleteEvent as deleteEventRow } from './lib/eventsDb.js';
import { currentMinOfDay, DAY_MIN } from './utils/timeOfDay.js';
import { HoldButton } from './components/HoldButton.jsx';

// ── color/taxonomy helpers (used inside App body) ────────────────────────
import {
  slugId, tagColors, lifeAreaPalette, UNASSIGNED_LIFE_AREA,
  syncTaxonomyGlobals, NICE_SWATCH_GROUPS,
  taxonomySwatch, taxonomySchemeSwatches, taxonomyAutoSwatches, taxonomyAutoSwatch,
  hashString, colorBucket, colorDistance,
  rgbToHsl, hexToRgb, hexToRgba, readableInkFor, readableGlowFor,
} from './utils/colors.js';

const LAST_VIEW_STORAGE_KEY = 'tm_last_view_v1';
const SIMPLE_VIEWS = new Set([
  'week', 'list', 'stack', 'inbox', 'upcoming', 'backlog',
  'snoozed', 'someday', 'blocked', 'completed', 'archived', 'delegations', 'routines',
  // Buckets redesign — new top-level views accessible from the sidebar.
  // 'buckets' is the Trello-style Kanban over tweaks.customGroups (rebranded
  // as "buckets" in the UI). 'tags' is the tree-on-left / task-list-on-right
  // view backed by tweaks.tagTree.
  'buckets', 'tags',
]);

function normalizeSavedView(value) {
  if (typeof value === 'string') {
    return SIMPLE_VIEWS.has(value) ? value : null;
  }
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'project' && typeof value.id === 'string') {
    return { type: 'project', id: value.id };
  }
  if (value.type === 'tag' && typeof value.name === 'string') {
    return { type: 'tag', name: value.name };
  }
  if (value.type === 'lifeArea' && typeof value.id === 'string') {
    return { type: 'lifeArea', id: value.id };
  }
  return null;
}

const clearSnoozePatch = {
  snoozedUntil: null,
  snoozedAt: null,
  snoozeMode: null,
  snoozeOffsetDays: null,
};

function sameSavedView(a, b) {
  return JSON.stringify(normalizeSavedView(a)) === JSON.stringify(normalizeSavedView(b));
}

function readSavedView() {
  try {
    return normalizeSavedView(JSON.parse(localStorage.getItem(LAST_VIEW_STORAGE_KEY) || 'null'));
  } catch {
    return null;
  }
}

function App() {
  const { user } = useAuth();
  const { workspace, supabaseDisabled } = useWorkspace();
  const userId = user?.id ?? null;
  const workspaceId = workspace?.id ?? null;
  const [migrationDismissed, setMigrationDismissed] = useState(() => {
    try { return !!localStorage.getItem('tm_migrated_to_cloud'); } catch { return true; }
  });
  const TIMELINE_PAST_DAYS = 120;
  const TIMELINE_FUTURE_DAYS = 180;
  const TIMELINE_EXTEND_DAYS = 45;
  const TIMELINE_MAX_DAYS = 730;
  const INITIAL_TIMELINE_DAYS = TIMELINE_PAST_DAYS + TIMELINE_FUTURE_DAYS + 1;
  const [tasks,setTasks]     = useState([]);
  const [tasksReady, setTasksReady] = useState(false);
  const [todayKey, setTodayKey] = useState(() => D.str(D.today()));

  // Calendar drawer state — events live alongside tasks but persist in their
  // own table. Loaded once at boot (cloud) or synthesised from INIT_EVENTS
  // (dev-bypass) so the drawer is always populated.
  const [events, setEvents] = useState([]);
  const [eventsReady, setEventsReady] = useState(false);
  const lastSyncedEventsRef = useRef([]);
  const [calendarDateStr, setCalendarDateStr] = useState(() => D.str(D.today()));
  // pxh/snapOn: tweak-backed accessors are declared after `tweaks` further down.
  // Inbox→calendar drag state. Mirrors the prototype's external-drag
  // mechanism: extDrag tracks live cursor position; extDragRef holds the
  // task metadata for the floating ghost.
  const [extDrag, setExtDrag] = useState(null);
  const extDragRef = useRef(null);
  // Last array we successfully synced to the cloud. The sync effect diffs
  // against this — not against React's previous render — so debounced
  // edits coalesce correctly.
  const lastSyncedTasksRef = useRef([]);
  const [weekOff,setWeekOff] = useState(-TIMELINE_PAST_DAYS);
  const [timelineDays,setTimelineDays] = useState(INITIAL_TIMELINE_DAYS);
  const [boardMetrics,setBoardMetrics] = useState({scrollLeft:0,width:1200,boardWidth:1200});
  const boardRef = useRef(null);
  const boardShellRef = useRef(null);
  const panState = useRef({isPanning:false,startX:0,scrollLeft:0});
  // Tracks the mousedown coordinates for the app-body click handler. If the
  // user releases >4px away from the start, the click was actually a drag
  // (canvas pan, etc.) and we suppress the "close drawer / clear focus"
  // logic. Otherwise pure background-clicks still close.
  const bodyClickGuard = useRef(null);
  const boardRaf = useRef(null);
  const pendingTodayJump = useRef(true);
  const pendingTodayJumpBehavior = useRef('auto');
  const pendingTodayJumpTimer = useRef(null);
  // Set true once the user pans/wheels/touches the board, so the post-mount
  // settle loop stops fighting their scroll position.
  const userScrolledRef = useRef(false);
  // Refs so the rAF re-anchor in the today-jump effect uses the LATEST values,
  // not the ones captured by the closure of the render that scheduled it.
  const colWRef = useRef(0);
  const todayIdxRef = useRef(-1);
  const pendingScrollShift = useRef(0);
  const pendingGoToDate = useRef(null);
  const [goToSeq, setGoToSeq] = useState(0);
  const triggerGlow = (id) => {
    const start = Date.now();
    const apply = () => {
      const els = document.querySelectorAll(`[data-card-id="${id}"], [data-list-id="${id}"]`);
      if (els.length === 0) {
        if (Date.now() - start < 2500) return setTimeout(apply, 80);
        return;
      }
      els.forEach(el => {
        el.classList.remove('card-locate-glow');
        void el.offsetWidth;
        el.classList.add('card-locate-glow');
        setTimeout(() => el.classList.remove('card-locate-glow'), 2300);
      });
    };
    setTimeout(apply, 450);
  };
  const [todayJumpSeq,setTodayJumpSeq] = useState(0);
  const [drawerFromLeft, setDrawerFromLeft] = useState(false);
  const TM_DEFAULTS = {
    look:'glass', density:'airy', font:'geist', theme:'light',
    accentColor:'#0f766e', showWeekend:true, showProjectPanel:false, inboxCollapsed:false, projectPanelCollapsed:false,
    inboxWidth:340, projectPanelWidth:190, dayWindow:'auto', cardRadius:10, groupRadius:4, cardGap:3, shadowIntensity:.35,
    dark_bg:'#071512', dark_surface:'#10201d', dark_sidebar:'#06110f', dark_border:'#1d342f', dark_text:'#e6fffb',
    light_bg:'#f3f7f4', light_surface:'#fffdfa', light_sidebar:'#e7efe9', light_border:'#d5ded7', light_text:'#17211d',
  stackSort:'smart', stackShowCompleted:true, stackGroupByDate:false, stackCompactBelowDeck:true, stackShowSpine:true, stackOrder:[], stackFilterOpen:false, stackFilters:{},
    bucketsSort:'manual', bucketsAutoFit:false,
    noBucketPinned:true, noBucketCollapsed:false, noBucketWidth:260,
    navWidth:196,
    newTaskPosition:'top',
    // Per-card colour wash (right-click → Card colour…). Sat / lightShift / pct
    // are tuned per-theme since the same hex needs different treatment on dark vs light surfaces.
    cardColorPalette:'Sunset', cardColorMethod:'srgb',
    cardColorDarkPct:20,  cardColorDarkSat:110, cardColorDarkLightShift:0,
    cardColorLightPct:50, cardColorLightSat:70, cardColorLightLightShift:0,
    // Bundled UI prefs that used to live in their own localStorage keys.
    filterPrefs: { mode: 'and' },
    groupPrefs: { global: 'project', inbox: 'none' },
    recentBlockReasons: [],
    customGroups: [],
    // Buckets redesign — tagTree is a flat list of {id, name, color, parentId}
    // nodes that powers the new managed/nestable tag taxonomy. Built once on
    // first load from the user's distinct task.tags values; thereafter the
    // user curates it via the Tags view. Tag chips on cards format per
    // `tagChipFormat`. Migration flag `tagTreeBuilt` guards re-import.
    tagTree: [],
    tagTreeBuilt: false,
    // Buckets redesign — life_area used to be a hardcoded enum; first time the
    // user opens the app post-redesign we mint a bucket per distinct
    // task.lifeArea value (preserved colour via lifeAreaPalette) and stash
    // the IDs against the matching tasks. Flag prevents re-running.
    bucketsMigrated: false,
    // Polish-pass flag — runs once to migrate stale group-by / filter state
    // tied to the now-removed life-area UI. See polishMigrationRef useEffect.
    bucketsPolishMigrated: false,
    // Settings — `showLocationOnCards` hides the (otherwise always-visible)
    // location chip by default; users who want it back flip it on.
    // `tagChipFormat` controls how nested tag chips render on cards.
    showLocationOnCards: false,
    tagChipFormat: 'parentLeaf', // 'parentLeaf' | 'leaf' | 'fullPath'
    // Persisted UI state (cross-device via user_settings.settings):
    lastView: null,                 // last-active main view (string or {type,id|name})
    sidePanelView: 'inbox',         // panel view inside the timeline's sticky inbox column
    // Buckets redesign: filters.lifeAreas retained for legacy reads but no
    // longer surfaced in the UI (the polish migration clears it). New
    // filters.buckets drives the bucket filter chip; '__nobucket__' is the
    // pseudo-id for "tasks with no bucket assigned".
    filters: { projects:[], tags:[], buckets:[], lifeAreas:[], priorities:[] }, // topbar pill filters
    showWaitingOn: false,           // topbar toggle: only show delegated/waiting cards
    showStaleOnly: false,           // topbar toggle: only show stale cards
    // Buckets redesign: lifeAreas axis retired in favour of buckets axis.
    // Old key retained for legacy reads (cleared by the polish migration).
    inboxFilters: { projects:{}, tags:{}, buckets:{}, lifeAreas:{}, priorities:{} }, // inbox panel include/exclude
    collapsedGroups: [],            // array form of collapsedGrps Set
    completedOpenCols: [],          // colKeys with completed section expanded
    blockedOpenCols: [],            // colKeys with blocked section expanded
    routinesOpenCols: [],           // colKeys with routines section expanded
    snoozedOpenCols: [],            // colKeys with Snoozed section expanded (other than today, which uses its own flag)
    snoozedTodayClosed: false,      // today's Snoozed section defaults open; this tracks explicit-closed state
    wakeUpToastsEnabled: true,      // in-app toast when a snoozed task wakes up
    collapsedProjects: [],          // project IDs folded in week/inbox/list views
    stackExpandedProjects: [],      // project IDs expanded in Stack view
    drawerSecs: { props:true, sched:true, dele:true, notes:true, subs:true, log:false, block:true },
    recentMRU: { tags: [], projects: [] },  // recent-use MRU for pickers
    calendarPxh: 80,                // calendar drawer pixels-per-hour
    calendarSnapOn: true,           // calendar drawer snap-to-grid
    calendarPinned: false,          // keep calendar open when clicking away
    autoPopulateToday: false,       // reactively schedule today's tasks
    scheduleDefaultDuration: 30,    // fallback minutes for no-estimate tasks
    differentiateAutoBlocks: true,  // dim algo-placed blocks
    hideCompletedOnCalendar: false, // filter done-task blocks from drawer
    navUserCollapsed: null,         // null = follow window-width default; true/false = explicit override
    settingsTab: 'appearance',      // last tab visited in Settings drawer
    // Delegations view state — selected task in right pane, status/person chip filters.
    // (Legacy delegationsFilter / delegationsSort / delegationsExpanded were used
    // by the old per-person rollup; safe to delete after a few weeks of migration.)
    delegationsSelectedId: null,
    delegationsStatusFilter: 'all', // all | overdue | waiting | heard | stale
    delegationsPersonFilter: [],    // array of person names
    showDelegationsOnTimeline: false, // top-nav toggle: surface delegated cards on stack/timeline
    showCheckInsOnTimeline: true,     // top-nav toggle: surface check-in reminders on the timeline. Default ON because the delegation parent is auto-snoozed while it has pending check-ins (see isAutoSnoozedDelegation) — if check-ins are also hidden, the user gets zero visibility into the delegation on the timeline and the cadence is invisible until they switch to the Delegations view.
    showRoutinesOnTimeline: true,     // top-nav toggle: show/hide routine strips on each day column
    todayPinned: true,                // today-column sticky pin on/off
  };
  const defaultTaxonomy = () => ({
    contexts: PROJ.map(p=>({...p})),
    tags: ALL_TAGS.map(id=>({id,label:TAG_NAMES[id]||id,color:(TAG_LIGHT[id]||TAG_LIGHT.admin).fg,dark:TAG_DARK[id]||tagColors(id).dark,light:TAG_LIGHT[id]||tagColors(id).light})),
    lifeAreas: LIFE_AREAS.map(id=>({id,label:LIFE_AREA_NAMES[id]||id,color:(LIFE_AREA_LIGHT[id]||LIFE_AREA_LIGHT.admin||tagColors(id).light).fg,dark:LIFE_AREA_DARK[id]||tagColors(id).dark,light:LIFE_AREA_LIGHT[id]||tagColors(id).light})),
  });
  const normalizeTaxonomy = (tx) => {
    const fallback = defaultTaxonomy();
    const contexts = Array.isArray(tx?.contexts) && tx.contexts.length ? tx.contexts : fallback.contexts;
    const tags = Array.isArray(tx?.tags) && tx.tags.length ? tx.tags : fallback.tags;
    const lifeAreas = Array.isArray(tx?.lifeAreas) && tx.lifeAreas.length ? tx.lifeAreas : fallback.lifeAreas;
    const normalizedLifeAreas = lifeAreas.map(a=>{
      const colors = tagColors(a.id||a.label);
      return {id:a.id||slugId(a.label,'area').toLowerCase(),label:a.label||a.id||'Life Area',color:a.color||a.light?.fg||colors.light.fg,dark:a.dark||colors.dark,light:a.light||colors.light};
    });
    const lifeAreaIds = new Set(normalizedLifeAreas.map(a=>a.id));
    return {
      contexts: contexts.map(c=>({
        id:c.id||slugId(c.label,'CTX'),
        label:c.label||c.id||'Location',
        color:c.color||'#94a3b8',
        defaultLifeArea: lifeAreaIds.has(c.defaultLifeArea) ? c.defaultLifeArea : null,
      })),
      tags: tags.map(t=>{
        const colors = tagColors(t.id||t.label);
        return {id:t.id||slugId(t.label,'tag').toLowerCase(),label:t.label||t.id||'Tag',color:t.color||t.light?.fg||colors.light.fg,dark:t.dark||colors.dark,light:t.light||colors.light};
      }),
      lifeAreas: normalizedLifeAreas,
    };
  };
  const [tweaks, setTweakState] = useState(() => ({ ...TM_DEFAULTS }));
  const [taxonomy, setTaxonomyState] = useState(() => normalizeTaxonomy(null));
  const [settingsReady, setSettingsReady] = useState(false);
  const [taxonomyReady, setTaxonomyReady] = useState(false);
  syncTaxonomyGlobals(taxonomy);
  const setTweak = (key, val) => {
    setTweakState(prev => {
      const next = typeof key === 'object' ? {...prev,...key} : {...prev,[key]:val};
      return next;
    });
  };
  const setTaxonomy = (updater) => {
    setTaxonomyState(prev => {
      const next = normalizeTaxonomy(typeof updater === 'function' ? updater(prev) : updater);
      return next;
    });
  };

  // Initial load of settings, taxonomy, and people from Supabase once the
  // workspace is ready. Local state is merged with the cloud values (cloud
  // wins) so any transient defaults the user already saw stay consistent.
  useEffect(() => {
    // Remove legacy tm_settings key — settings are now Supabase-only.
    try { localStorage.removeItem('tm_settings'); } catch {}
    if (supabaseDisabled) {
      // Dev-bypass: no Supabase; settings stay at TM_DEFAULTS for the session.
      setSettingsReady(true);
      setTaxonomyReady(true);
      return;
    }
    if (!workspaceId || !userId) return;
    let cancelled = false;
    setSettingsReady(false);
    setTaxonomyReady(false);
    (async () => {
      try {
        const [cloudSettings, cloudTaxonomy, cloudPeople] = await Promise.all([
          fetchSettings(userId),
          fetchTaxonomy(workspaceId),
          fetchPeople(workspaceId),
        ]);
        if (cancelled) return;
        if (cloudSettings) {
          setTweakState(prev => {
            const merged = {...TM_DEFAULTS, ...prev, ...cloudSettings};
            // Dedupe customGroups by id — keeps the array clean even if a
            // prior bug left duplicate-id entries in the saved settings.
            if (Array.isArray(merged.customGroups) && merged.customGroups.length) {
              const seen = new Set();
              const out = [];
              for (const g of merged.customGroups) {
                if (!g?.id || seen.has(g.id)) continue;
                seen.add(g.id);
                out.push(g);
              }
              if (out.length !== merged.customGroups.length) merged.customGroups = out;
            }
            return merged;
          });
        }
        if (cloudTaxonomy) {
          setTaxonomyState(normalizeTaxonomy(cloudTaxonomy));
        }
        // Hydrate the people cache, keyed by lowercase displayName, then
        // install a persister that mirrors future savePeople() calls to
        // Supabase. The persister carries the right userId/workspaceId in
        // its closure so data.js stays decoupled from auth.
        const peopleMap = {};
        for (const p of cloudPeople || []) {
          if (!p?.displayName) continue;
          peopleMap[p.displayName.toLowerCase()] = p;
        }
        setPeopleCache(peopleMap);
        setPeoplePersister((person) => upsertPerson(person, userId, workspaceId));
        setSettingsReady(true);
        setTaxonomyReady(true);
      } catch (e) {
        console.error('[settings/taxonomy/people] initial fetch failed', e);
        setSettingsReady(true);
        setTaxonomyReady(true);
      }
    })();
    return () => {
      cancelled = true;
      setPeoplePersister(null);
    };
  }, [workspaceId, userId, supabaseDisabled]);

  // localStorage shadow + debounced cloud save of the settings blob.
  // Cloud save gated on settingsReady AND userId so it doesn't fire
  // pre-hydration (would clobber cloud state) or in dev-bypass mode.
  useEffect(() => {
    if (!settingsReady || !userId) return;
    const handle = setTimeout(() => {
      saveSettings(userId, tweaks).catch(e => {
        console.error('[settings] save failed', e);
      });
    }, 500);
    return () => clearTimeout(handle);
  }, [tweaks, settingsReady, userId]);

  // Debounced cloud save of taxonomy.
  useEffect(() => {
    if (!taxonomyReady || !userId || !workspaceId) return;
    const handle = setTimeout(() => {
      saveTaxonomy(workspaceId, userId, taxonomy).catch(e => {
        console.error('[taxonomy] save failed', e);
      });
    }, 500);
    return () => clearTimeout(handle);
  }, [taxonomy, taxonomyReady, userId, workspaceId]);

  // Realtime subscriptions for cross-device sync. Loop avoidance: we
  // compare the incoming row to local state and short-circuit if it's
  // identical (which it will be for our own writes echoing back).
  useEffect(() => {
    if (!workspaceId) return;

    const unsubTasks = subscribeTasks(workspaceId, (payload) => {
      if (payload.eventType === 'DELETE') {
        const id = payload.old?.id;
        if (!id) return;
        setTasks(prev => {
          if (!prev.some(t => t.id === id)) return prev;
          const next = prev.filter(t => t.id !== id);
          // Surgically remove from the synced ref — don't claim the rest of
          // `next` (which may include locally-created unsynchronised tasks) is
          // already in Supabase.
          lastSyncedTasksRef.current = lastSyncedTasksRef.current.filter(t => t.id !== id);
          return next;
        });
        return;
      }
      const incoming = rollTaskDateForward(syncTaskSnooze(normalizeTask(rowToTask(payload.new))));
      if (!incoming?.id) return;
      setTasks(prev => {
        const idx = prev.findIndex(t => t.id === incoming.id);
        if (idx === -1) {
          const next = [...prev, incoming];
          // Surgically add only this task to the synced ref so other locally-
          // created tasks (e.g. delegation check-ins) stay pending.
          const cur = lastSyncedTasksRef.current;
          lastSyncedTasksRef.current = cur.some(t => t.id === incoming.id)
            ? cur.map(t => t.id === incoming.id ? incoming : t)
            : [...cur, incoming];
          return next;
        }
        // Merge incoming over local instead of replacing. rowToTask only sets
        // keys for columns that exist in the row, so any client-only fields
        // (e.g. `groupId` before the group_id SQL migration runs) are preserved.
        const merged = { ...prev[idx], ...incoming };
        if (JSON.stringify(prev[idx]) === JSON.stringify(merged)) {
          // Echo of our own write — no-op so the sync effect doesn't fire.
          return prev;
        }
        const next = prev.slice();
        next[idx] = merged;
        // Surgically update the synced ref for just this task — replacing the
        // whole array would mark locally-created unsynchronised tasks as synced.
        lastSyncedTasksRef.current = lastSyncedTasksRef.current.map(
          t => t.id === incoming.id ? merged : t
        );
        return next;
      });
    });

    const unsubTaxonomy = subscribeTaxonomy(workspaceId, (payload) => {
      if (payload.eventType === 'DELETE') return;
      const row = payload.new;
      if (!row) return;
      const incoming = normalizeTaxonomy({
        contexts: row.contexts,
        tags: row.tags,
        lifeAreas: row.life_areas,
      });
      setTaxonomyState(prev => {
        if (JSON.stringify(prev) === JSON.stringify(incoming)) return prev;
        return incoming;
      });
    });

    const unsubPeople = subscribePeople(workspaceId, (payload) => {
      // Update the in-memory people cache directly. UI reads via
      // loadPeople() inside render — fresh values appear on next render
      // triggered by other state changes. Truly reactive UI for people
      // is out of scope for this PR.
      if (payload.eventType === 'DELETE') {
        const old = payload.old;
        const name = old?.name;
        if (!name) return;
        const cache = loadPeople();
        const k = name.toLowerCase();
        if (!cache[k]) return;
        const next = { ...cache };
        delete next[k];
        setPeopleCache(next);
        return;
      }
      const person = rowToPerson(payload.new);
      if (!person?.displayName) return;
      const cache = loadPeople();
      const k = person.displayName.toLowerCase();
      if (JSON.stringify(cache[k]) === JSON.stringify(person)) return;
      setPeopleCache({ ...cache, [k]: person });
    });

    return () => {
      unsubTasks?.();
      unsubTaxonomy?.();
      unsubPeople?.();
    };
  }, [workspaceId]);
  const theme = tweaks.theme;
  const setTheme = (fn) => setTweak('theme', typeof fn === 'function' ? fn(tweaks.theme) : fn);
  const showWknd = tweaks.showWeekend;
  const setShowWknd = (fn) => setTweak('showWeekend', typeof fn === 'function' ? fn(tweaks.showWeekend) : fn);
  // Calendar drawer prefs — declared here (after `tweaks` is in scope) and
  // read via the tweak store so they survive refresh.
  const pxh = Number(tweaks.calendarPxh) || 80;
  const setPxh = (v) => setTweak('calendarPxh', typeof v === 'function' ? v(pxh) : v);
  const snapOn = tweaks.calendarSnapOn !== false;
  const setSnapOn = (v) => setTweak('calendarSnapOn', typeof v === 'function' ? v(snapOn) : !!v);

  const [view,setView]       = useState(() => readSavedView() || 'week');
  const [preDeleg,setPreDeleg] = useState(null); // view to return to when toggling Delegations off
  const sidePanelView = tweaks.sidePanelView || 'inbox';
  const setSidePanelView = (v) => setTweak('sidePanelView', v);
  const [drawerId,setDrawerId]= useState(null);
  // Transient: when set, the drawer should expand and scroll to this section on
  // next open. Consumed and cleared by drawer.jsx. Used by the "Delegate to…"
  // context menu entry to jump straight to the delegation section.
  const [drawerInitialFocus,setDrawerInitialFocus] = useState(null);
  const [settingsOpen,setSettingsOpen]= useState(false);
  const [addModal,setAddModal]= useState(null); // {date,label}
  const [palette,setPalette] = useState(false);
  const [shortcuts,setShortcuts]=useState(false);
  const [quickEntry,setQuickEntry]=useState(false);
  // Topbar pill filters live in tweaks so they ride cloud sync.
  const filters = tweaks.filters || { projects:[], tags:[], lifeAreas:[], priorities:[] };
  const setFilters = (updater) => setTweakState(prev => {
    const cur = prev.filters || { projects:[], tags:[], lifeAreas:[], priorities:[] };
    const next = typeof updater === 'function' ? updater(cur) : updater;
    return { ...prev, filters: next };
  });
  // filterMode / globalGroupBy / inboxGroupBy live inside `tweaks` so they
  // ride the same cloud sync as the rest of the settings blob.
  const filterMode = tweaks.filterPrefs?.mode === 'or' ? 'or' : 'and';
  const setFilterMode = (m) => setTweak({ filterPrefs: { ...(tweaks.filterPrefs||{}), mode: m }});
  const showWaitingOn = !!tweaks.showWaitingOn;
  const setShowWaitingOn = (v) => setTweak('showWaitingOn', typeof v === 'function' ? v(!!tweaks.showWaitingOn) : !!v);
  const showStaleOnly = !!tweaks.showStaleOnly;
  const setShowStaleOnly = (v) => setTweak('showStaleOnly', typeof v === 'function' ? v(!!tweaks.showStaleOnly) : !!v);
  const inboxFilters = tweaks.inboxFilters || { projects:{}, tags:{}, buckets:{}, lifeAreas:{}, priorities:{} };
  const setInboxFilters = (updater) => setTweakState(prev => {
    const cur = prev.inboxFilters || { projects:{}, tags:{}, buckets:{}, lifeAreas:{}, priorities:{} };
    const next = typeof updater === 'function' ? updater(cur) : updater;
    return { ...prev, inboxFilters: next };
  });
  const [searchQuery,setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [filterOpen,setFilterOpen]=useState(false);
  const globalGroupBy = tweaks.groupPrefs?.global || 'project';
  const setGlobalGroupBy = (g) => setTweak({ groupPrefs: { ...(tweaks.groupPrefs||{}), global: g }});
  const [groupOpen,setGroupOpen] = useState(false);
  const inboxGroupBy = tweaks.groupPrefs?.inbox || 'none';
  const setInboxGroupBy = (g) => setTweak({ groupPrefs: { ...(tweaks.groupPrefs||{}), inbox: g }});
  // Collapsed/expanded section state, persisted via tweak arrays so it
  // survives refresh and roams across devices. Sets are derived once per
  // change for the cheap O(1) lookups consumers expect.
  const collapsedGrps = useMemo(() => new Set(Array.isArray(tweaks.collapsedGroups) ? tweaks.collapsedGroups : []), [tweaks.collapsedGroups]);
  const setCollapsedGrps = (updater) => setTweakState(prev => {
    const cur = new Set(Array.isArray(prev.collapsedGroups) ? prev.collapsedGroups : []);
    const next = typeof updater === 'function' ? updater(cur) : updater;
    return { ...prev, collapsedGroups: Array.from(next) };
  });
  const completedOpen = useMemo(() => new Set(Array.isArray(tweaks.completedOpenCols) ? tweaks.completedOpenCols : []), [tweaks.completedOpenCols]);
  const setCompletedOpen = (updater) => setTweakState(prev => {
    const cur = new Set(Array.isArray(prev.completedOpenCols) ? prev.completedOpenCols : []);
    const next = typeof updater === 'function' ? updater(cur) : updater;
    return { ...prev, completedOpenCols: Array.from(next) };
  });
  const blockedOpen = useMemo(() => new Set(Array.isArray(tweaks.blockedOpenCols) ? tweaks.blockedOpenCols : []), [tweaks.blockedOpenCols]);
  const setBlockedOpen = (updater) => setTweakState(prev => {
    const cur = new Set(Array.isArray(prev.blockedOpenCols) ? prev.blockedOpenCols : []);
    const next = typeof updater === 'function' ? updater(cur) : updater;
    return { ...prev, blockedOpenCols: Array.from(next) };
  });
  // Snoozed section per column — colKeys with the section *expanded* live in
  // tweaks. Today's column auto-expands at render time so users see the
  // countdown bar for "later today" snoozes without clicking.
  const snoozedOpen = useMemo(() => new Set(Array.isArray(tweaks.snoozedOpenCols) ? tweaks.snoozedOpenCols : []), [tweaks.snoozedOpenCols]);
  const setSnoozedOpen = (updater) => setTweakState(prev => {
    const cur = new Set(Array.isArray(prev.snoozedOpenCols) ? prev.snoozedOpenCols : []);
    const next = typeof updater === 'function' ? updater(cur) : updater;
    return { ...prev, snoozedOpenCols: Array.from(next) };
  });
  // Per-day "↻ Routines" section is collapsed by default. Same pattern as
  // completed/blocked — colKeys with the section *expanded* live in tweaks.
  const routinesOpen = useMemo(() => new Set(Array.isArray(tweaks.routinesOpenCols) ? tweaks.routinesOpenCols : []), [tweaks.routinesOpenCols]);
  const setRoutinesOpen = (updater) => setTweakState(prev => {
    const cur = new Set(Array.isArray(prev.routinesOpenCols) ? prev.routinesOpenCols : []);
    const next = typeof updater === 'function' ? updater(cur) : updater;
    return { ...prev, routinesOpenCols: Array.from(next) };
  });
  const recentBlockReasons = Array.isArray(tweaks.recentBlockReasons) ? tweaks.recentBlockReasons : [];
  const setRecentBlockReasons = (updater) => {
    const prev = Array.isArray(tweaks.recentBlockReasons) ? tweaks.recentBlockReasons : [];
    const next = typeof updater === 'function' ? updater(prev) : updater;
    setTweak({ recentBlockReasons: next });
  };
  const collapsedProjects = useMemo(() => new Set(Array.isArray(tweaks.collapsedProjects) ? tweaks.collapsedProjects : []), [tweaks.collapsedProjects]);
  const setCollapsedProjects = (updater) => setTweakState(prev => {
    const cur = new Set(Array.isArray(prev.collapsedProjects) ? prev.collapsedProjects : []);
    const next = typeof updater === 'function' ? updater(cur) : updater;
    return { ...prev, collapsedProjects: Array.from(next) };
  });
  // dnd-kit drag state — single slot, replaces the five legacy HTML5 slots.
  const [activeDrag,setActiveDrag]=useState(null); // {id, kind, fromCol?}
  const [confirmDialog,setConfirmDialog]=useState(null); // {message, onConfirm}
  const [focusedId,setFocusedId]=useState(null);
  const [selectedIds,setSelectedIds]=useState(new Set());
  const [renamingId,setRenamingId]=useState(null);
  const [spawning,setSpawning]=useState(new Set());
  const [toast,setToast]     = useState(null);
  const [toastUndoable,setToastUndoable]=useState(false);
  const [toastAction,setToastAction]=useState(null); // { label, onClick } — optional action button shown alongside the toast
  const [undoStack,setUndoStack]=useState([]);
  // Nav collapse: if the user has set an explicit override (tweaks.navUserCollapsed
  // is true/false), honour it; otherwise fall back to "collapsed on narrow screens".
  const widthCollapseDefault = window.innerWidth <= 640;
  const navCollapsedOverride = tweaks.navUserCollapsed;
  const navCollapsed = navCollapsedOverride === true || navCollapsedOverride === false
    ? navCollapsedOverride
    : widthCollapseDefault;
  const setNavCollapsed = (updater) => {
    const next = typeof updater === 'function' ? updater(navCollapsed) : !!updater;
    setTweak('navUserCollapsed', next);
  };
  const [isNarrowScreen,setIsNarrowScreen]=useState(() => window.innerWidth <= 640);
  const [tbOverflowOpen,setTbOverflowOpen]=useState(false);
  const recents = tweaks.recentMRU || { tags: [], projects: [] };
  const setRecents = (updater) => setTweakState(prev => {
    const cur = prev.recentMRU || { tags: [], projects: [] };
    const next = typeof updater === 'function' ? updater(cur) : updater;
    return { ...prev, recentMRU: next };
  });
  const [contextMenu,setContextMenu] = useState(null); // {task, x, y}
  const [cardColorPickerFor,setCardColorPickerFor] = useState(null); // {id, x, y}
  const [popRequest,setPopRequest] = useState(null); // {id, field}
  const [stackPicker,setStackPicker] = useState(null); // {id, field, x, y} — Stack-view right-click picker
  const [renamingGroupId,setRenamingGroupId] = useState(null);
  const [marquee,setMarquee] = useState(null); // {x0,y0,x1,y1} viewport coords
  const marqueeBaseRef = useRef(null);
  useEffect(() => {
    const onResize = () => setIsNarrowScreen(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Persist view: localStorage shadow for first-paint, tweaks for cross-device.
  useEffect(() => {
    const savedView = normalizeSavedView(view);
    if (!savedView) return;
    try {
      localStorage.setItem(LAST_VIEW_STORAGE_KEY, JSON.stringify(savedView));
    } catch {}
    if (!settingsReady) return;
    if (!sameSavedView(tweaks.lastView, savedView)) {
      setTweak('lastView', savedView);
    }
  }, [view, settingsReady]);

  // On first settings load, adopt cloud lastView if it differs from the
  // localStorage-derived initial view. Guarded by a one-shot ref so this only
  // fires when settings flip from not-ready to ready.
  const viewHydratedRef = useRef(false);
  useEffect(() => {
    if (!settingsReady || viewHydratedRef.current) return;
    viewHydratedRef.current = true;
    const cloudView = normalizeSavedView(tweaks.lastView);
    if (cloudView && !sameSavedView(view, cloudView)) setView(cloudView);
  }, [settingsReady]);

  const showToast = (msg, opts={}) => {
    setToast(msg);
    setToastUndoable(!!opts.undoable);
    setToastAction(opts.action || null);
    if (opts.timeout !== 0) {
      const t = opts.timeout || 7500;
      setTimeout(() => { setToast(null); setToastUndoable(false); setToastAction(null); }, t);
    }
  };

  // Wake-up handler used by AutoWakeWatcher. Clears snooze fields on each
  // expired task, appends a 'woke' activity entry, surfaces a toast (when
  // enabled), and fires a system Notification when the tab is hidden.
  // wakeOnLoad: grouped toast with a "View" action pointing to the
  // recently-woken side panel — used the first time the watcher fires after
  // hydration, since those tasks slept through app downtime.
  const wakeUpToastsEnabled = tweaks.wakeUpToastsEnabled !== false;
  const handleWakeTasks = useCallback((expired, opts = {}) => {
    if (!expired || expired.length === 0) return;
    const wokeIds = new Set(expired.map(t => t.id));
    const wokeAt = new Date().toISOString();
    setTasks(prev => prev.map(t => wokeIds.has(t.id)
      ? {
          ...t,
          snoozedUntil: null,
          snoozedAt: null,
          snoozeMode: null,
          snoozeOffsetDays: null,
          activity: [...(t.activity || []), { type: 'woke', at: wokeAt }],
        }
      : t));
    if (wakeUpToastsEnabled) {
      if (opts.wakeOnLoad) {
        const n = expired.length;
        showToast(`${n} task${n===1?'':'s'} woke up while you were away`, {
          timeout: 9000,
          action: { label: 'View', onClick: () => setTweak('sidePanelView', 'recently-woken') },
        });
      } else {
        const titles = expired.slice(0, 3).map(t => `"${(t.title||'Task').slice(0, 32)}"`).join(', ');
        const extra = expired.length > 3 ? ` and ${expired.length - 3} more` : '';
        showToast(`Woke up: ${titles}${extra}`, { timeout: 6000 });
      }
    }
    if (typeof Notification !== 'undefined'
        && Notification.permission === 'granted'
        && (typeof document === 'undefined' || document.visibilityState !== 'visible')) {
      try {
        const titles = expired.slice(0, 3).map(t => t.title).join(', ');
        const extra = expired.length > 3 ? ` (+${expired.length - 3} more)` : '';
        new Notification(expired.length === 1 ? 'Task woke up' : `${expired.length} tasks woke up`, {
          body: titles + extra,
          tag: 'task-wake',
        });
      } catch {}
    }
  // setTasks/setTweak/showToast are stable enough for our purposes; the
  // dep list is intentionally light so this callback doesn't churn the
  // AutoWakeWatcher effect on every tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeUpToastsEnabled]);
  const pushRecent = (kind, val) => {
    if (!val) return;
    setRecents(r => {
      const list = (r[kind]||[]).filter(x=>x!==val);
      return {...r, [kind]: [val, ...list].slice(0,5)};
    });
  };

  // Initial load from Supabase once the workspace is ready.
  // Dev-bypass / local-only mode (supabaseDisabled === true): seed from
  // INIT_TASKS so the app boots into a populated state without needing a
  // real account. The seed only runs when local storage doesn't already
  // hold a saved task list, so iterating with the bypass is non-destructive.
  useEffect(() => {
    if (supabaseDisabled) {
      let saved = null;
      try {
        const raw = localStorage.getItem('tm_tasks_v2');
        if (raw) saved = JSON.parse(raw);
      } catch {}
      const seed = Array.isArray(saved) && saved.length ? saved : INIT_TASKS;
      const pruned = pruneOrphanCheckIns(extendRoutineHorizon(archiveStaleRoutines(rollIncompleteTasksToToday(migrateRecurrence(migrateTasks(seed))))));
      syncUidFromTasks(pruned);
      const merged = repairMissingCheckIns(pruned);
      lastSyncedTasksRef.current = merged;
      setTasks(merged);
      setTasksReady(true);
      return;
    }
    if (!workspaceId) {
      setTasksReady(false);
      return;
    }
    let cancelled = false;
    setTasksReady(false);
    (async () => {
      try {
        const fetched = await fetchTasks(workspaceId);
        if (cancelled) return;
        const pruned = pruneOrphanCheckIns(extendRoutineHorizon(archiveStaleRoutines(rollIncompleteTasksToToday(migrateRecurrence(migrateTasks(fetched))))));
        syncUidFromTasks(pruned);
        const merged = repairMissingCheckIns(pruned);
        lastSyncedTasksRef.current = merged;
        setTasks(merged);
        setTasksReady(true);
      } catch (e) {
        console.error('[tasks] initial fetch failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, supabaseDisabled]);

  // Calendar events — same load pattern as tasks. Dev-bypass seeds INIT_EVENTS
  // onto today's date so the drawer is always populated; cloud mode does a
  // single workspace-wide fetch and lets day navigation be a client-side filter.
  useEffect(() => {
    if (supabaseDisabled) {
      let saved = null;
      try {
        const raw = localStorage.getItem('tm_events_v1');
        if (raw) saved = JSON.parse(raw);
      } catch {}
      const today = D.str(D.today());
      const seed = Array.isArray(saved) && saved.length
        ? saved
        : INIT_EVENTS.map(e => ({ ...e, date: today }));
      setEvents(seed);
      lastSyncedEventsRef.current = seed;
      setEventsReady(true);
      return;
    }
    if (!workspaceId) { setEventsReady(false); return; }
    let cancelled = false;
    setEventsReady(false);
    (async () => {
      try {
        const fetched = await fetchAllEvents(workspaceId);
        if (cancelled) return;
        setEvents(fetched);
        lastSyncedEventsRef.current = fetched;
        setEventsReady(true);
      } catch (e) {
        console.error('[events] initial fetch failed', e);
        if (!cancelled) setEventsReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, supabaseDisabled]);

  // Sync events: localStorage shadow + cloud diff sync. Mirrors the tasks
  // pattern but simpler (no conflict logic — events are short-lived and the
  // drawer is single-user).
  useEffect(() => {
    if (!eventsReady) return;
    try { localStorage.setItem('tm_events_v1', JSON.stringify(events)); } catch {}
    if (supabaseDisabled || !userId || !workspaceId) {
      lastSyncedEventsRef.current = events;
      return;
    }
    const prev = lastSyncedEventsRef.current;
    const prevById = new Map(prev.map(e => [e.id, e]));
    const nextById = new Map(events.map(e => [e.id, e]));
    const upserts = [];
    for (const [id, ev] of nextById) {
      const old = prevById.get(id);
      if (!old || JSON.stringify(old) !== JSON.stringify(ev)) upserts.push(ev);
    }
    const deletes = [];
    for (const id of prevById.keys()) if (!nextById.has(id)) deletes.push(id);
    if (!upserts.length && !deletes.length) return;
    (async () => {
      try {
        for (const ev of upserts) await upsertEvent(ev, userId, workspaceId);
        for (const id of deletes) await deleteEventRow(id);
        lastSyncedEventsRef.current = events;
      } catch (e) {
        console.error('[events] sync failed', e);
      }
    })();
  }, [events, eventsReady, supabaseDisabled, userId, workspaceId]);

  // ── Calendar drawer plumbing ────────────────────────────────────────────
  // Color resolution for an event's task — uses the live taxonomy so user
  // edits to project colors flow through.
  const calProjectColor = useCallback((task) => {
    if (!task) return '#5eead4';
    const ctx = (taxonomy?.contexts || []).find(c => c.id === task.project);
    return ctx?.color || '#a5b4fc';
  }, [taxonomy]);

  // setEvents wrapper that lets the drawer treat the visible day's events
  // as its full list. Adds/updates/deletes against the visible slice get
  // re-merged with the rest of the workspace's events.
  const visibleEvents = useMemo(
    () => events.filter(e => e.date === calendarDateStr),
    [events, calendarDateStr]
  );
  const setVisibleEvents = useCallback((updater) => {
    setEvents(prev => {
      const visibleNow = prev.filter(e => e.date === calendarDateStr);
      const visibleNext = typeof updater === 'function' ? updater(visibleNow) : updater;
      const others = prev.filter(e => e.date !== calendarDateStr);
      return [...others, ...visibleNext];
    });
  }, [calendarDateStr]);

  // Inbox card → calendar drag — prototype's external-drag mechanism.
  // Bail if the target is an interactive child (chip, popover, checkbox)
  // so users can still tag / set priority / mark done with the drawer open.
  const onTaskMouseDown = useCallback((e, task) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, textarea, .card-meta-btn, .card-popover, .card-del, .bulk-check, .card-chk')) return;
    e.preventDefault();
    extDragRef.current = {
      taskId: task.id,
      title: task.title,
      est: parseTimeEst(task.timeEstimate) || 30,
      project: task.project,
    };
    setExtDrag({ taskId: task.id, clientX: e.clientX, clientY: e.clientY });
  }, []);

  useEffect(() => {
    if (!extDrag) return;
    const onMove = (ev) => {
      if (!extDragRef.current) return;
      setExtDrag({ taskId: extDragRef.current.taskId, clientX: ev.clientX, clientY: ev.clientY });
    };
    const onUp = () => setExtDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [!!extDrag]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smart slot finder. Returns array of chunks {startMin, durationMin} for
  // one task. Strategy:
  //   1. Single contiguous slot before 18:00 → one block.
  //   2. Else if splittable → fill ≥30min gaps in order; remainder (≥30min)
  //      past 18:00.
  //   3. Else → one block at the cursor (extends past 18:00 if needed).
  // Shared by `autoPlan`, `scheduleTasksToday`, and the auto-populate effect.
  const planSlotsForTask = (taskDur, busy, splittable) => {
    const NOW = currentMinOfDay();
    const dayStart = Math.max(Math.ceil(NOW / 15) * 15, 9 * 60);
    const dayEnd = 18 * 60;
    const MIN_CHUNK = 30;
    const fits = (s, len) => busy.every(([a, b]) => s + len <= a || s >= b);

    // Step 1: contiguous fit before 18:00.
    for (let s = dayStart; s + taskDur <= dayEnd; s += 15) {
      if (fits(s, taskDur)) return [{ startMin: s, durationMin: taskDur }];
    }

    // Step 2: splittable — fill ≥30min gaps in order.
    if (splittable) {
      const sortedBusy = [...busy].sort((a, b) => a[0] - b[0]);
      const gaps = [];
      let cursor = dayStart;
      for (const [a, b] of sortedBusy) {
        if (a > cursor) gaps.push([cursor, Math.min(a, dayEnd)]);
        cursor = Math.max(cursor, b);
        if (cursor >= dayEnd) break;
      }
      if (cursor < dayEnd) gaps.push([cursor, dayEnd]);

      const chunks = [];
      let remaining = taskDur;
      for (const [gStart, gEnd] of gaps) {
        if (remaining <= 0) break;
        const aligned = Math.floor(Math.min(remaining, gEnd - gStart) / 15) * 15;
        if (aligned < MIN_CHUNK) continue;
        chunks.push({ startMin: gStart, durationMin: aligned });
        remaining -= aligned;
      }
      if (remaining >= MIN_CHUNK) {
        const lastBusyEnd = sortedBusy.length ? sortedBusy[sortedBusy.length - 1][1] : dayEnd;
        chunks.push({ startMin: Math.max(dayEnd, lastBusyEnd), durationMin: remaining });
        remaining = 0;
      }
      if (chunks.length && remaining === 0) return chunks;
    }

    // Step 3: one block at the cursor.
    const sortedBusy = [...busy].sort((a, b) => a[0] - b[0]);
    const lastBusyEnd = sortedBusy.length ? sortedBusy[sortedBusy.length - 1][1] : dayStart;
    return [{ startMin: Math.max(dayStart, lastBusyEnd), durationMin: taskDur }];
  };

  // Auto-plan: greedy pack of unscheduled tasks into open slots. Mirrors the
  // prototype's intent but now uses `planSlotsForTask` so it supports
  // splitting and tags blocks with source='auto'.
  const autoPlan = useCallback(() => {
    const today = D.str(D.today());
    if (calendarDateStr !== today) return;
    const visible = events.filter(e => e.date === today);
    const scheduledIds = new Set(visible.map(e => e.taskId).filter(Boolean));
    const queue = tasks
      .filter(t => !t.done && !t.archived && t.cardType !== 'project'
        && !scheduledIds.has(t.id) && parseTimeEst(t.timeEstimate) > 0)
      .sort((a, b) => (a.priority || 'p3').localeCompare(b.priority || 'p3'));
    const busy = visible.map(e => [e.startMin, e.startMin + e.durationMin]);
    const additions = [];
    for (const t of queue) {
      const slots = planSlotsForTask(parseTimeEst(t.timeEstimate), busy, !!t.splittable);
      for (const s of slots) {
        const id = 'e' + Math.random().toString(36).slice(2, 8);
        additions.push({ id, taskId: t.id, date: today, startMin: s.startMin, durationMin: s.durationMin, source: 'auto' });
        busy.push([s.startMin, s.startMin + s.durationMin]);
      }
    }
    if (additions.length) setEvents(prev => [...prev, ...additions]);
  }, [calendarDateStr, events, tasks]);

  // Schedule one or more tasks into today's calendar at the next free slot(s).
  // Bulk-aware: pass an array of IDs and each task's chunks are placed
  // sequentially against a running busy list. Opens the drawer at the end.
  const scheduleTasksToday = useCallback((taskIds) => {
    const ids = (Array.isArray(taskIds) ? taskIds : [taskIds]).filter(Boolean);
    if (!ids.length) return;
    const today = D.str(D.today());
    const defaultDur = tweaks.scheduleDefaultDuration || 30;
    const todayEvts = events.filter(e => e.date === today);
    const busy = todayEvts.map(e => [e.startMin, e.startMin + e.durationMin]);
    const alreadyScheduled = new Set(todayEvts.map(e => e.taskId).filter(Boolean));
    // Inline lookup — taskById helper is declared later in the App body, so
    // we'd hit a temporal-dead-zone error if we referenced it in deps here.
    const lookup = (id) => tasks.find(t => t.id === id);

    const additions = [];
    for (const id of ids) {
      if (alreadyScheduled.has(id)) continue;
      const task = lookup(id);
      if (!task) continue;
      const dur = parseTimeEst(task.timeEstimate) || defaultDur;
      const slots = planSlotsForTask(dur, busy, !!task.splittable);
      for (const s of slots) {
        additions.push({
          id: 'e' + Math.random().toString(36).slice(2, 8),
          taskId: id, date: today,
          startMin: s.startMin, durationMin: s.durationMin,
          source: 'auto',
        });
        busy.push([s.startMin, s.startMin + s.durationMin]);
      }
      alreadyScheduled.add(id);
    }
    if (additions.length) setEvents(prev => [...prev, ...additions]);
    setCalendarDateStr(today);
    setTweak('calendarOpen', true);
  }, [tasks, events, tweaks.scheduleDefaultDuration]);

  // Continuous auto-populate: when enabled, reactively schedule today's
  // tasks (date===today) that aren't yet on the calendar. Uses an events ref
  // so the effect only fires on TASK changes — deleting a block won't cause
  // it to re-add itself.
  const eventsRef = useRef(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  useEffect(() => {
    if (!tweaks.autoPopulateToday || !tasksReady) return;
    const today = D.str(D.today());
    const todayEvts = eventsRef.current.filter(e => e.date === today);
    const scheduled = new Set(todayEvts.map(e => e.taskId).filter(Boolean));
    const defaultDur = tweaks.scheduleDefaultDuration || 30;

    const queue = tasks
      .filter(t => !t.done && !t.archived && t.cardType !== 'project'
        && !t.blocked && !t.delegatedTo && !t.someday && !t.snoozedUntil
        && !scheduled.has(t.id) && t.date === today)
      .sort((a, b) => (a.priority || 'p3').localeCompare(b.priority || 'p3'));
    if (!queue.length) return;

    const busy = todayEvts.map(e => [e.startMin, e.startMin + e.durationMin]);
    const additions = [];
    for (const t of queue) {
      const dur = parseTimeEst(t.timeEstimate) || defaultDur;
      const slots = planSlotsForTask(dur, busy, !!t.splittable);
      for (const s of slots) {
        additions.push({
          id: 'e' + Math.random().toString(36).slice(2, 8),
          taskId: t.id, date: today,
          startMin: s.startMin, durationMin: s.durationMin,
          source: 'auto',
        });
        busy.push([s.startMin, s.startMin + s.durationMin]);
      }
    }
    if (additions.length) setEvents(prev => [...prev, ...additions]);
  }, [tasks, tweaks.autoPopulateToday, tweaks.scheduleDefaultDuration, tasksReady]);

  // Resize-on-estimate-change: when a task's parseTimeEst changes, apply the
  // delta to the last chunk of its calendar events. If shrinking the last
  // chunk would drop it below 30min, drop chunks from the end. Overlaps are
  // allowed — `layoutOverlaps` in CalendarDrawer arranges them side-by-side.
  const prevEstRef = useRef(null);
  useEffect(() => {
    if (!tasksReady) return;
    // Seed prev map on first run so initial mount doesn't fire spurious resizes.
    if (prevEstRef.current === null) {
      const init = new Map();
      for (const t of tasks) init.set(t.id, parseTimeEst(t.timeEstimate));
      prevEstRef.current = init;
      return;
    }
    const prev = prevEstRef.current;
    const next = new Map();
    const evtsByTask = new Map();
    for (const e of events) {
      if (!e.taskId) continue;
      const arr = evtsByTask.get(e.taskId) || [];
      arr.push(e);
      evtsByTask.set(e.taskId, arr);
    }
    const updates = [];
    for (const t of tasks) {
      const newDur = parseTimeEst(t.timeEstimate);
      const oldDur = prev.get(t.id);
      next.set(t.id, newDur);
      if (oldDur === undefined || oldDur === newDur) continue;
      if (newDur <= 0) continue; // estimate removed → leave blocks alone
      const chunks = (evtsByTask.get(t.id) || []).slice().sort((a, b) => a.startMin - b.startMin);
      if (!chunks.length) continue;
      const totalCur = chunks.reduce((s, c) => s + c.durationMin, 0);
      if (totalCur === newDur) continue;
      let delta = newDur - totalCur;
      const remaining = [...chunks];
      while (remaining.length && (remaining[remaining.length - 1].durationMin + delta) < 30) {
        const last = remaining.pop();
        updates.push({ kind: 'delete', id: last.id });
        delta += last.durationMin;
      }
      if (remaining.length) {
        const last = remaining[remaining.length - 1];
        updates.push({ kind: 'update', id: last.id, durationMin: last.durationMin + delta });
      }
    }
    prevEstRef.current = next;
    if (updates.length) {
      setEvents(prevEvts => {
        const byId = new Map(prevEvts.map(e => [e.id, e]));
        for (const u of updates) {
          if (u.kind === 'delete') byId.delete(u.id);
          else if (u.kind === 'update') {
            const cur = byId.get(u.id);
            if (cur) byId.set(u.id, { ...cur, durationMin: u.durationMin });
          }
        }
        return [...byId.values()];
      });
    }
  }, [tasks, tasksReady]); // intentionally omits events — we read via closure

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());
    const handle = setTimeout(() => {
      setTodayKey(D.str(D.today()));
    }, delay);
    return () => clearTimeout(handle);
  }, [todayKey]);

  useEffect(() => {
    if (!tasksReady) return;
    // Order matters: roll non-routine overdue tasks forward first, then sweep
    // routines (auto-archive missed instances), then ensure the next 14 days
    // of every routine series have concrete instances on the calendar.
    let next = rollIncompleteTasksToToday(tasks, todayKey);
    next = archiveStaleRoutines(next, todayKey);
    next = extendRoutineHorizon(next, 14, todayKey);
    if (next !== tasks) setTasks(next);
  }, [tasks, todayKey, tasksReady]);

  // One-shot: null out task.groupId values that no longer match any custom
  // group. customGroups and tasks.group_id are written separately (different
  // tables) so a partial network failure can leave dangling refs.
  const groupSweepDoneRef = useRef(false);
  useEffect(() => {
    if (!tasksReady || !settingsReady) return;
    if (groupSweepDoneRef.current) return;
    groupSweepDoneRef.current = true;
    const valid = new Set((tweaks.customGroups || []).map(g => g?.id).filter(Boolean));
    setTasks(prev => {
      let changed = false;
      const next = prev.map(t => {
        if (t.groupId && !valid.has(t.groupId)) {
          changed = true;
          return { ...t, groupId: null };
        }
        return t;
      });
      return changed ? next : prev;
    });
  }, [tasksReady, settingsReady, tweaks.customGroups]);

  // ---------------------------------------------------------------------------
  // Buckets redesign — one-time migrations (gated by tweak flags).
  //
  // 1) Buckets: distinct lifeArea values become buckets in tweaks.customGroups
  //    (the existing user-curated list, now surfaced as "Buckets" in the UI).
  //    Each task with a lifeArea but no groupId is reassigned to its derived
  //    bucket. Colours preserved via lifeAreaPalette so the visual continuity
  //    survives the rename.
  //
  // 2) TagTree: distinct task.tags values become flat top-level entries in
  //    tweaks.tagTree, with palette-assigned colours. Tag IDs on tasks stay
  //    untouched (the new tree uses the same string IDs).
  //
  // Both gates are tweak flags (bucketsMigrated, tagTreeBuilt) + a session-
  // scoped useRef to defend against the gap between setTweak (local) and
  // the cloud round-trip — without it the effect can fire twice on rapid
  // re-render before the flag persists.
  const bucketsMigrationRef = useRef(false);
  useEffect(() => {
    if (!tasksReady || !settingsReady) return;
    if (bucketsMigrationRef.current) return;
    if (tweaks.bucketsMigrated) return;
    bucketsMigrationRef.current = true;

    const existingGroups = Array.isArray(tweaks.customGroups) ? tweaks.customGroups : [];
    const existingNames = new Map(existingGroups.map(g => [String(g?.name || '').toLowerCase(), g]));
    const newGroups = existingGroups.slice();

    // Walk tasks, collect distinct lifeArea values not already represented.
    const seenLifeAreas = new Set();
    for (const t of tasks) {
      if (!t?.lifeArea) continue;
      const key = String(t.lifeArea).toLowerCase();
      if (seenLifeAreas.has(key)) continue;
      seenLifeAreas.add(key);
      if (existingNames.has(key)) continue;
      const label = LIFE_AREA_NAMES[t.lifeArea] || t.lifeArea;
      const pal = lifeAreaPalette(t.lifeArea, 'light');
      const bucket = {
        id: `bk_${t.lifeArea}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        name: label,
        color: pal?.fg || '#64748b',
      };
      newGroups.push(bucket);
      existingNames.set(key, bucket);
    }

    // Re-point tasks: every task with a lifeArea and no groupId picks up the
    // matching bucket id. Tasks that already have a groupId are left alone
    // (they're already bucketed).
    const reassign = new Map();
    for (const t of tasks) {
      if (!t || t.groupId || !t.lifeArea) continue;
      const bucket = existingNames.get(String(t.lifeArea).toLowerCase());
      if (bucket?.id) reassign.set(t.id, bucket.id);
    }

    if (newGroups.length !== existingGroups.length) {
      setTweak('customGroups', newGroups);
    }
    if (reassign.size) {
      setTasks(prev => prev.map(t => reassign.has(t.id) ? { ...t, groupId: reassign.get(t.id) } : t));
    }
    setTweak('bucketsMigrated', true);
  }, [tasksReady, settingsReady, tasks, tweaks.bucketsMigrated, tweaks.customGroups]);

  const tagTreeMigrationRef = useRef(false);
  useEffect(() => {
    if (!tasksReady || !settingsReady) return;
    if (tagTreeMigrationRef.current) return;
    if (tweaks.tagTreeBuilt) return;
    tagTreeMigrationRef.current = true;

    const existingTree = Array.isArray(tweaks.tagTree) ? tweaks.tagTree : [];
    const existingIds = new Set(existingTree.map(n => n?.id).filter(Boolean));
    const distinct = new Set();
    for (const t of tasks) {
      for (const tag of (t?.tags || [])) {
        if (tag) distinct.add(tag);
      }
    }
    const added = [];
    let i = existingTree.length;
    for (const tagId of distinct) {
      if (existingIds.has(tagId)) continue;
      const label = TAG_NAMES[tagId] || tagId;
      const swatch = taxonomyAutoSwatch(i, `tag-${tagId}`, 'Pastel');
      added.push({
        id: tagId,
        name: label,
        color: swatch?.color || null,
        parentId: null,
      });
      i += 1;
    }
    if (added.length) {
      setTweak('tagTree', existingTree.concat(added));
    }
    setTweak('tagTreeBuilt', true);
  }, [tasksReady, settingsReady, tasks, tweaks.tagTreeBuilt, tweaks.tagTree]);

  // ---------------------------------------------------------------------------
  // Buckets redesign polish — one-time auto-migration of stale tweak state
  // tied to the now-removed life-area UI. Runs after settingsReady, gated by
  // tweaks.bucketsPolishMigrated. Idempotent.
  //
  // What it does:
  //  - groupPrefs.global / groupPrefs.inbox === 'lifeArea' → 'bucket'
  //    (preserves the user's intent: they wanted to group by their
  //    primary category; that category is now buckets).
  //  - filters.lifeAreas → cleared (the slugs aren't bucket IDs; re-applying
  //    them would silently filter to nothing).
  //  - inboxFilters.lifeAreas → cleared (same reason).
  const polishMigrationRef = useRef(false);
  useEffect(() => {
    if (!settingsReady) return;
    if (polishMigrationRef.current) return;
    if (tweaks.bucketsPolishMigrated) return;
    polishMigrationRef.current = true;

    const patch = {};
    const gp = tweaks.groupPrefs || {};
    if (gp.global === 'lifeArea' || gp.inbox === 'lifeArea') {
      patch.groupPrefs = {
        ...gp,
        global: gp.global === 'lifeArea' ? 'bucket' : gp.global,
        inbox: gp.inbox === 'lifeArea' ? 'bucket' : gp.inbox,
      };
    }
    const f = tweaks.filters || {};
    if (Array.isArray(f.lifeAreas) && f.lifeAreas.length) {
      patch.filters = { ...f, lifeAreas: [] };
    }
    const ifs = tweaks.inboxFilters || {};
    if (ifs.lifeAreas && Object.keys(ifs.lifeAreas).length) {
      patch.inboxFilters = { ...ifs, lifeAreas: {} };
    }
    patch.bucketsPolishMigrated = true;
    setTweak(patch);
  }, [settingsReady, tweaks.bucketsPolishMigrated]);
  // ---------------------------------------------------------------------------

  // localStorage shadow + debounced diff-sync of local mutations to Supabase.
  // Shadow runs in both dev-bypass and cloud modes so a refresh restores the
  // last task state (matches the events effect a few lines up). Cloud sync is
  // gated on userId/workspaceId — dev-bypass stops at the shadow.
  //
  // Debounce is short (80 ms) — long enough to batch the burst of state updates
  // from a single user action (drag, multi-edit), short enough that a quick
  // refresh after creating a delegation doesn't drop the write. Was 500 ms;
  // that window was wide enough for new tasks to be lost on fast refresh,
  // because Supabase is the source of truth in production (localStorage is
  // dev-only) — if the timer was cancelled by unmount, the data was gone.
  useEffect(() => {
    if (!tasksReady) return;
    try { localStorage.setItem('tm_tasks_v2', JSON.stringify(tasks)); } catch {}
    if (!userId || !workspaceId) {
      lastSyncedTasksRef.current = tasks;
      return;
    }
    const handle = setTimeout(() => {
      const prev = lastSyncedTasksRef.current;
      if (prev === tasks) return;
      lastSyncedTasksRef.current = tasks;
      // Stamp diagnostic state so the user can inspect via console
      // (`window.__tmLastSync`) even if a toast is missed or dismissed.
      window.__tmLastSync = { at: new Date().toISOString(), status: 'pending', upserts: null, error: null };
      syncTaskDiff(prev, tasks, userId, workspaceId).then((result) => {
        window.__tmLastSync = { at: new Date().toISOString(), status: 'ok', upserts: result?.upserts || 0, deletes: result?.deletes || 0, error: null };
      }).catch((e) => {
        console.error('[tasks] sync failed', e);
        const msg = e?.message || e?.details || e?.hint || String(e);
        const full = { message: e?.message, details: e?.details, hint: e?.hint, code: e?.code };
        window.__tmLastSync = { at: new Date().toISOString(), status: 'error', upserts: null, error: full };
        // Persist to localStorage so it survives a refresh — user can run
        // `JSON.parse(localStorage.tm_last_sync_error)` to see the last
        // failure even if they refreshed past the toast.
        try { localStorage.setItem('tm_last_sync_error', JSON.stringify({ at: new Date().toISOString(), ...full })); } catch {}
        showToast(`Save failed: ${msg}`, { timeout: 0 });
      });
    }, 80);
    return () => clearTimeout(handle);
  }, [tasks, tasksReady, userId, workspaceId]);

  // Best-effort flush on tab hide / unload. The browser may complete the
  // request even as the page tears down (HTTP keepalive); if it doesn't,
  // we at least tried. pagehide fires reliably on mobile Safari where
  // beforeunload is unreliable.
  useEffect(() => {
    if (!tasksReady || !userId || !workspaceId) return;
    const flush = () => {
      const prev = lastSyncedTasksRef.current;
      if (prev === tasks) return;
      lastSyncedTasksRef.current = tasks;
      syncTaskDiff(prev, tasks, userId, workspaceId).catch(() => {});
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [tasks, tasksReady, userId, workspaceId]);

  useEffect(()=>{
    const sync = () => {
      const el = boardRef.current;
      const shell = boardShellRef.current;
      if(el) setBoardMetrics({scrollLeft:el.scrollLeft,width:el.clientWidth,boardWidth:shell?.clientWidth||el.clientWidth});
    };
    sync();
    window.addEventListener('resize', sync);
    return ()=>window.removeEventListener('resize', sync);
  },[]);
  useEffect(()=>{
    const id = requestAnimationFrame(()=>{
      const el = boardRef.current;
      const shell = boardShellRef.current;
      if(el) setBoardMetrics({scrollLeft:el.scrollLeft,width:el.clientWidth,boardWidth:shell?.clientWidth||el.clientWidth});
    });
    return ()=>cancelAnimationFrame(id);
  },[view, navCollapsed, tweaks.inboxCollapsed, tweaks.showProjectPanel, tweaks.projectPanelCollapsed, tweaks.inboxWidth, tweaks.projectPanelWidth]);

  useEffect(()=>{
    const t = tweaks.theme;
    document.body.setAttribute('data-theme', t);
    document.body.setAttribute('data-look', tweaks.look||'minimal');
    document.body.setAttribute('data-density', tweaks.density||'normal');
    const R = document.body;
    R.style.setProperty('--font', tweaks.font==='serif'?"'DM Serif Display',serif":tweaks.font==='mono'?"'Geist Mono',monospace":"'Geist',sans-serif");
    R.style.setProperty('--accent', tweaks.accentColor);
    R.style.setProperty('--accent-dim', tweaks.accentColor+'26');
    R.style.setProperty('--accent-border', tweaks.accentColor+'44');
    R.style.setProperty('--radius-card', tweaks.cardRadius+'px');
    R.style.setProperty('--group-radius', (Number(tweaks.groupRadius ?? 4))+'px');
    R.style.setProperty('--card-gap', (Number(tweaks.cardGap ?? 3))+'px');
    R.style.setProperty('--stack-pad-y', (Number(tweaks.stackPadY ?? 7))+'px');
    R.style.setProperty('--stack-gap', (Number(tweaks.stackGap ?? 8))+'px');
    const shadow = Math.max(0, Math.min(1, Number(tweaks.shadowIntensity ?? .35)));
    const mkShadow = (...parts) => shadow <= 0 ? 'none' : parts.map(([x,y,b,a])=>`${x}px ${y}px ${b}px rgba(0,0,0,${(a*shadow).toFixed(3)})`).join(',');
    R.style.setProperty('--shadow', mkShadow([0,1,2,.10],[0,3,10,.12]));
    R.style.setProperty('--shadow-hover', mkShadow([0,2,8,.16]));
    R.style.setProperty('--shadow-lg', mkShadow([0,10,28,.22]));
    if (t === 'dark') {
      R.style.setProperty('--bg',       tweaks.dark_bg);
      R.style.setProperty('--bg-side',  tweaks.dark_sidebar);
      R.style.setProperty('--bg-top',   tweaks.dark_sidebar);
      R.style.setProperty('--bg-inbox', tweaks.dark_sidebar);
      R.style.setProperty('--bg-dr',    tweaks.dark_surface);
      R.style.setProperty('--surface',  tweaks.dark_surface);
      R.style.setProperty('--surface-2',tweaks.dark_border);
      R.style.setProperty('--surface-3',tweaks.dark_border);
      R.style.setProperty('--border',   tweaks.dark_border);
      R.style.setProperty('--border-s', tweaks.dark_border);
      R.style.setProperty('--t1',       tweaks.dark_text);
    } else {
      R.style.setProperty('--bg',       tweaks.light_bg);
      R.style.setProperty('--bg-side',  tweaks.light_sidebar);
      R.style.setProperty('--bg-top',   tweaks.light_surface);
      R.style.setProperty('--bg-inbox', tweaks.light_sidebar);
      R.style.setProperty('--bg-dr',    tweaks.light_surface);
      R.style.setProperty('--surface',  tweaks.light_surface);
      R.style.setProperty('--surface-2',tweaks.light_bg);
      R.style.setProperty('--surface-3',tweaks.light_border);
      R.style.setProperty('--border',   tweaks.light_border);
      R.style.setProperty('--border-s', tweaks.light_border);
      R.style.setProperty('--t1',       tweaks.light_text);
    }
    // Card-colour wash: method (data-attr) + active per-theme tint percentage
    R.setAttribute('data-color-style', tweaks.cardColorMethod || 'srgb');
    const tintPct = t === 'light' ? (tweaks.cardColorLightPct ?? 50) : (tweaks.cardColorDarkPct ?? 20);
    R.style.setProperty('--card-tint-pct', tintPct);
  },[tweaks]);

  const stickyW = (tweaks.inboxCollapsed?34:(Number(tweaks.inboxWidth)||340)) +
    (tweaks.showProjectPanel ? (tweaks.projectPanelCollapsed?34:(Number(tweaks.projectPanelWidth)||190)) : 0);
  const rawDayWindow = tweaks.dayWindow ?? 'auto';
  const dayWindowSetting = [4,5,7].includes(Number(rawDayWindow)) ? Number(rawDayWindow) : 'auto';
  const dayAreaWidth = Math.max(360, (boardMetrics.boardWidth||boardMetrics.width||1200) - stickyW);
  const autoDayWindow = dayAreaWidth < 980 ? 3 : dayAreaWidth < 1540 ? 5 : 7;
  const dayWindowCount = dayWindowSetting === 'auto' ? autoDayWindow : dayWindowSetting;
  const COL_W = dayWindowSetting === 'auto'
    ? Math.round(Math.max(220, Math.min(340, dayAreaWidth / dayWindowCount)))
    : Math.round(Math.max(220, dayAreaWidth / dayWindowCount));
  const todayStr = D.str(D.today());
  const weekDates  = getWeekDays(weekOff, timelineDays);
  const visibleDates = weekDates.filter(d=>showWknd || [1,2,3,4,5].includes(d.getDay()) || D.str(d)===todayStr);
  const visibleDateKeys = visibleDates.map(d=>D.str(d));
  const visColKeys = ['inbox',...visibleDateKeys];
  const colScrollLeft = Math.max(0, boardMetrics.scrollLeft);
  const firstRenderCol = Math.max(0, Math.floor(colScrollLeft / COL_W) - 4);
  const renderColCount = Math.ceil((boardMetrics.width||1200) / COL_W) + 10;
  const lastRenderCol = Math.min(visibleDates.length, firstRenderCol + renderColCount);
  const renderDates = visibleDates.slice(firstRenderCol, lastRenderCol);
  const beforeColsWidth = firstRenderCol * COL_W;
  const afterColsWidth = Math.max(0, (visibleDates.length - lastRenderCol) * COL_W);
  const todayIdx = visibleDateKeys.indexOf(todayStr);
  colWRef.current = COL_W;
  todayIdxRef.current = todayIdx;
  const viewportRight = colScrollLeft + (boardMetrics.width||dayAreaWidth);
  const todayLeft = todayIdx >= 0 ? todayIdx * COL_W : null;
  const todayRight = todayLeft !== null ? todayLeft + COL_W : null;
  const todayPin = todayIdx >= 0
    ? (todayLeft < colScrollLeft ? 'left' : todayLeft > viewportRight - COL_W ? 'right' : null)
    : (weekDates.length && D.parse(todayStr) < weekDates[0] ? 'left' : 'right');
  const todayPinEnabled = tweaks.todayPinned !== false;
  // When today is OUT of the timeline range (e.g. the user clicked the
  // ◂/▸ arrows enough times to push weekOff past today), todayIdx is -1
  // and the natural-position trick can't be used. Still render today as a
  // sticky column at the edge so it stays pinned regardless of how far the
  // window has been shifted.
  const todayOutOfRange = todayIdx < 0;
  // Decoupled from todayPin so virtualization doesn't drop the today column
  // from the DOM while React state catches up — sticky resolution is CSS-only
  // now (both left:0 and right:0 set on .today-pinned).
  const renderTodaySeparately = todayPinEnabled && (todayOutOfRange || (todayIdx >= 0 && (todayIdx < firstRenderCol || todayIdx >= lastRenderCol)));
  const renderTodayBefore = renderTodaySeparately && (todayOutOfRange ? todayPin === 'left' : todayIdx < firstRenderCol);
  const renderTodayAfter = renderTodaySeparately && (todayOutOfRange ? todayPin === 'right' : todayIdx >= lastRenderCol);
  const beforeTimelineSpacerWidth = renderTodayBefore && !todayOutOfRange ? todayIdx * COL_W : beforeColsWidth;
  const betweenTodayAndRenderWidth = renderTodayBefore && !todayOutOfRange ? Math.max(0, (firstRenderCol - todayIdx - 1) * COL_W) : 0;
  const betweenRenderAndTodayWidth = renderTodayAfter && !todayOutOfRange ? Math.max(0, (todayIdx - lastRenderCol) * COL_W) : 0;
  const afterTimelineSpacerWidth = renderTodayAfter && !todayOutOfRange ? Math.max(0, (visibleDates.length - todayIdx - 1) * COL_W) : afterColsWidth;

  const jumpToTodayAnchor = (behavior='auto') => {
    const el = boardRef.current;
    if(!el) return;
    const beforeToday = todayIdx >= 0 ? todayIdx : visibleDates.filter(d=>D.str(d)<todayStr).length;
    const targetLeft = Math.max(0, beforeToday * COL_W);
    if (typeof el.scrollTo === 'function') el.scrollTo({left:targetLeft, behavior});
    else el.scrollLeft = targetLeft;
    const shell = boardShellRef.current;
    setBoardMetrics({scrollLeft:el.scrollLeft,width:el.clientWidth,boardWidth:shell?.clientWidth||el.clientWidth});
  };
  const resetTimelineToToday = () => {
    pendingTodayJump.current = true;
    pendingTodayJumpBehavior.current = 'smooth';
    setWeekOff(-TIMELINE_PAST_DAYS);
    setTimelineDays(INITIAL_TIMELINE_DAYS);
    setTodayJumpSeq(n=>n+1);
  };
  const lastRolledTodayRef = useRef(todayKey);
  useEffect(() => {
    if (lastRolledTodayRef.current === todayKey) return;
    lastRolledTodayRef.current = todayKey;
    resetTimelineToToday();
  }, [todayKey]);

  // When tasks finish hydrating (from localStorage or Supabase), re-anchor
  // today. Without this, an initial load that mounts Timeline before tasks
  // are ready can leave the scroller stranded 120 days in the past — the
  // belt-and-braces retries above expect today's column index to be stable,
  // which it isn't until the data settles. Fires exactly once per session.
  const initialAnchorDoneRef = useRef(false);
  useEffect(() => {
    if (initialAnchorDoneRef.current) return;
    if (!tasksReady) return;
    initialAnchorDoneRef.current = true;
    if (view === 'week') resetTimelineToToday();
  }, [tasksReady, view]);

  // Re-anchor today at the left edge whenever the user enters Timeline from
  // another view. Skips the initial mount (the first-mount layout effect
  // already handles it) and yields to onGoToCard, which sets pendingGoToDate
  // when the user explicitly wants to land on a non-today date.
  // useLayoutEffect (not useEffect) so this runs BEFORE the pendingGoToDate
  // layout effect below clears that ref.
  const prevViewForTimelineRef = useRef(view);
  useLayoutEffect(() => {
    const prev = prevViewForTimelineRef.current;
    prevViewForTimelineRef.current = view;
    if (view === 'week' && prev !== 'week' && !pendingGoToDate.current) {
      resetTimelineToToday();
      // Skip smooth scroll on view switch — the freshly-mounted scroller
      // doesn't animate reliably (Chrome appears to ignore a smooth scrollTo
      // issued during the mount commit), so anchor instantly instead.
      pendingTodayJumpBehavior.current = 'auto';
    }
  }, [view]);

  // Keep the leftmost-visible date pinned across COL_W changes. scrollLeft
  // is in pixels and COL_W can change for many reasons (day-window tab,
  // inbox/project panel collapse or resize, window resize, lnav toggle).
  // Without this, the pixel offset is preserved but the date it points at
  // drifts — the timeline appears to jump to a random spot.
  const prevColWRef = useRef(null);
  const prevViewForColRef = useRef(view);
  useLayoutEffect(() => {
    const prevView = prevViewForColRef.current;
    prevViewForColRef.current = view;
    if (view !== 'week') { prevColWRef.current = null; return; }
    if (prevView !== 'week') { prevColWRef.current = COL_W; return; }
    const prevColW = prevColWRef.current;
    prevColWRef.current = COL_W;
    if (!prevColW || prevColW === COL_W) return;
    if (pendingTodayJump.current || pendingGoToDate.current) return;
    const el = boardRef.current;
    if (!el) return;
    const leftIdx = Math.round(el.scrollLeft / prevColW);
    const target = Math.max(0, leftIdx * COL_W);
    if (Math.abs(el.scrollLeft - target) < 1) return;
    if (typeof el.scrollTo === 'function') el.scrollTo({left:target, behavior:'auto'});
    else el.scrollLeft = target;
    const shell = boardShellRef.current;
    setBoardMetrics({scrollLeft:el.scrollLeft, width:el.clientWidth, boardWidth:shell?.clientWidth||el.clientWidth});
  }, [COL_W, view]);

  // Belt-and-braces: on first mount, the board's measured width can settle in
  // stages (initial paint → font load → sidebar/inbox width applied), and a
  // single layout-effect pass anchors against a stale COL_W. Re-anchor today
  // across the first ~700ms unless the user has actively scrolled.
  useEffect(() => {
    const tries = [80, 220, 450, 750];
    const timers = tries.map(ms => setTimeout(() => {
      if (userScrolledRef.current) return;
      const el = boardRef.current;
      if (!el) return;
      const idx = todayIdxRef.current;
      const cw = colWRef.current;
      if (idx < 0 || !cw) return;
      const target = Math.max(0, idx * cw);
      if (Math.abs(el.scrollLeft - target) <= 1) return;
      if (typeof el.scrollTo === 'function') el.scrollTo({left:target, behavior:'auto'});
      else el.scrollLeft = target;
      const shell = boardShellRef.current;
      setBoardMetrics({scrollLeft: el.scrollLeft, width: el.clientWidth, boardWidth: shell?.clientWidth||el.clientWidth});
    }, ms));
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(()=>{
    if(!pendingTodayJump.current) return;
    const el = boardRef.current;
    if(!el) return;
    const shell = boardShellRef.current;
    const measuredBoardWidth = shell?.clientWidth || el.clientWidth;
    if(boardMetrics.width !== el.clientWidth || boardMetrics.boardWidth !== measuredBoardWidth) {
      setBoardMetrics({scrollLeft:el.scrollLeft,width:el.clientWidth,boardWidth:measuredBoardWidth});
      return;
    }
    const requestedBehavior = pendingTodayJumpBehavior.current;
    jumpToTodayAnchor(requestedBehavior);
    pendingTodayJump.current = false;
    pendingTodayJumpBehavior.current = 'auto';
    // Belt-and-suspenders: COL_W can shift on a follow-up render once the
    // board's width finishes settling, leaving scrollLeft pointing at the
    // wrong pixel offset (e.g. the user's "today" column ends up off-screen
    // on the right). Re-anchor on the next two animation frames using the
    // freshest COL_W via refs that update each render. Use the same behavior
    // the caller requested — a 'smooth' re-anchor to the same target lets
    // the browser keep interpolating, while 'auto' (the default) would snap
    // and kill the in-progress smooth scroll triggered by the Today button.
    const behavior = requestedBehavior;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el2 = boardRef.current;
        if (!el2) return;
        const idx = todayIdxRef.current;
        const cw = colWRef.current;
        if (idx < 0 || !cw) return;
        const target = Math.max(0, idx * cw);
        if (Math.abs(el2.scrollLeft - target) <= 1) return;
        if (typeof el2.scrollTo === 'function') el2.scrollTo({left:target, behavior});
        else el2.scrollLeft = target;
        const shell2 = boardShellRef.current;
        setBoardMetrics({scrollLeft:el2.scrollLeft, width:el2.clientWidth, boardWidth:shell2?.clientWidth||el2.clientWidth});
      });
    });
  },[view, weekOff, timelineDays, todayJumpSeq, COL_W, showWknd, boardMetrics.width, boardMetrics.boardWidth]);
  useEffect(()=>{
    const shift = pendingScrollShift.current;
    if(!shift) return;
    const id = requestAnimationFrame(()=>{
      const el = boardRef.current;
      if(!el) return;
      el.scrollLeft += shift;
      pendingScrollShift.current = 0;
      const shell = boardShellRef.current;
      setBoardMetrics({scrollLeft:el.scrollLeft,width:el.clientWidth,boardWidth:shell?.clientWidth||el.clientWidth});
    });
    return ()=>cancelAnimationFrame(id);
  },[weekOff, timelineDays, COL_W, showWknd]);
  useLayoutEffect(()=>{
    if (!pendingGoToDate.current) return;
    if (view !== 'week') return;
    const idx = visibleDateKeys.indexOf(pendingGoToDate.current);
    if (idx < 0) return;
    const el = boardRef.current;
    if (!el) return;
    const vw = el.clientWidth || boardMetrics.width || 1200;
    let targetLeft;
    if (todayIdx >= 0 && idx > todayIdx) {
      targetLeft = Math.max(0, (idx - 1) * COL_W);
    } else if (todayIdx >= 0 && idx < todayIdx) {
      targetLeft = Math.max(0, idx * COL_W - vw + 2 * COL_W);
    } else {
      targetLeft = Math.max(0, idx * COL_W - Math.floor(vw / 2) + Math.floor(COL_W / 2));
    }
    if (typeof el.scrollTo === 'function') el.scrollTo({left: targetLeft, behavior: 'smooth'});
    else el.scrollLeft = targetLeft;
    const shell = boardShellRef.current;
    setBoardMetrics({scrollLeft:targetLeft, width:el.clientWidth, boardWidth:shell?.clientWidth||el.clientWidth});
    pendingGoToDate.current = null;
  },[view, weekOff, timelineDays, COL_W, showWknd, boardMetrics.width, goToSeq]);

  const taskMap = useMemo(()=>new Map(tasks.map(t=>[t.id,t])), [tasks]);
  const applyTaskPatch = useCallback((task, changes) => {
    if (!changes) return task;
    let normalized = changes;
    if (Object.prototype.hasOwnProperty.call(changes, 'snoozedUntil')) {
      if (changes.snoozedUntil == null && !Object.prototype.hasOwnProperty.call(changes, 'snoozeMode')) {
        normalized = { ...normalized, ...clearSnoozePatch };
      } else if (changes.snoozedUntil && !Object.prototype.hasOwnProperty.call(changes, 'snoozeMode')) {
        normalized = { ...normalized, snoozeMode: 'absolute', snoozeOffsetDays: null };
      }
      // "Snooze moves the date" — when an absolute snooze is set, shift the
      // task's date to the wake-up day so it lives in the right column both
      // before AND after waking. Only when the caller hasn't already set date
      // explicitly (some flows like check-ins do, and we respect their value).
      if (changes.snoozedUntil
        && !Object.prototype.hasOwnProperty.call(changes, 'date')
        && (normalized.snoozeMode === 'absolute' || (!normalized.snoozeMode && !task.snoozeMode))) {
        const dayKey = D.snoozeDayKey(changes.snoozedUntil);
        if (dayKey) normalized = { ...normalized, date: dayKey };
      }
    }
    return syncTaskSnooze({ ...task, ...normalized });
  }, []);
  const taskById = (id) => taskMap.get(id);
  function getEffectiveLifeArea(task, seen=new Set()) {
    if(!task) return null;
    if(task.lifeArea !== null && task.lifeArea !== undefined) return task.lifeArea;
    if(!task.parentId || seen.has(task.id)) return null;
    seen.add(task.id);
    return getEffectiveLifeArea(taskById(task.parentId), seen);
  }
  const lifeAreaOptionLabel = (id) => id===UNASSIGNED_LIFE_AREA ? 'Unassigned' : (LIFE_AREA_NAMES[id] || id);

  const searchNeedle = deferredSearchQuery.trim().toLowerCase();
  const taskMatchesSearch = (t) => {
    if(!searchNeedle) return true;
    const projLabel = PROJ.find(p=>p.id===t.project)?.label || '';
    const lifeAreaId = getEffectiveLifeArea(t);
    const lifeAreaLabel = lifeAreaId ? (LIFE_AREA_NAMES[lifeAreaId] || lifeAreaId) : 'Unassigned';
    const tags = (t.tags||[]).map(tg=>TAG_NAMES[tg]||tg).join(' ');
    return [t.title,t.description,projLabel,t.project,t.priority,t.pri,t.date,t.dueDate,tags,lifeAreaLabel,lifeAreaId].filter(Boolean).join(' ').toLowerCase().includes(searchNeedle);
  };
  const taskOwnFilters = (t) => {
    if(!taskMatchesSearch(t)) return false;
    const activeAxes = [];
    if(filters.projects.length) activeAxes.push(filters.projects.includes(t.project));
    if(filters.tags.length) activeAxes.push((t.tags||[]).some(tg=>filters.tags.includes(tg)));
    // Buckets filter — replaces lifeAreas. '__nobucket__' pseudo-id matches
    // tasks with no groupId set (the "No bucket" entry in the filter list).
    if((filters.buckets || []).length) {
      activeAxes.push((filters.buckets || []).some(id => id==='__nobucket__' ? !t.groupId : t.groupId===id));
    }
    if(filters.priorities.length) activeAxes.push(filters.priorities.includes(t.pri||t.priority));
    if(!activeAxes.length) return true;
    return filterMode === 'or' ? activeAxes.some(Boolean) : activeAxes.every(Boolean);
  };
  // For project shells: pass-through if any child matches the filters/search.
  // This ensures search hits inside a project surface the project at top level.
  const applyFilters = (ts) => ts.filter(t => {
    if(taskOwnFilters(t)) return true;
    if(t.cardType==='project') {
      const kids = childrenByParent.get(t.id) || [];
      if(kids.some(k=>taskOwnFilters(k))) return true;
    }
    return false;
  });
  const filtersActive = !!searchNeedle || filters.projects.length>0 || filters.tags.length>0 || (filters.buckets || []).length>0 || filters.priorities.length>0;

  useEffect(()=>{
    setSelectedIds(prev => {
      const next = new Set([...prev].filter(id=>taskMap.has(id)));
      return next.size===prev.size ? prev : next;
    });
  }, [taskMap]);
  const activeTasks = useMemo(()=>tasks.filter(t=>!t.archived), [tasks]);
  // children of each project, ordered by the project's childOrder
  const childrenByParent = useMemo(()=>{
    const map = new Map();
    activeTasks.forEach(t=>{
      if(!t.parentId) return;
      if(!map.has(t.parentId)) map.set(t.parentId, []);
      map.get(t.parentId).push(t);
    });
    activeTasks.forEach(p=>{
      if(p.cardType!=='project' || !p.childOrder) return;
      const arr = map.get(p.id); if(!arr) return;
      const order = new Map(p.childOrder.map((id,i)=>[id,i]));
      arr.sort((a,b)=>(order.has(a.id)?order.get(a.id):1e9) - (order.has(b.id)?order.get(b.id):1e9));
    });
    return map;
  }, [activeTasks]);
  // Projects whose visibility is solely due to a matching child — auto-expand
  // so the matching child is actually visible.
  const forceOpenProjects = useMemo(()=>{
    if(!filtersActive) return new Set();
    const s = new Set();
    activeTasks.forEach(t=>{
      if(t.cardType!=='project') return;
      const kids = childrenByParent.get(t.id) || [];
      if(kids.some(k=>taskOwnFilters(k))) s.add(t.id);
    });
    return s;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTasks, childrenByParent, filtersActive, searchNeedle, filters]);
  const childrenOf = (id) => childrenByParent.get(id) || [];
  // project rollups: count, done count, total minutes
  const projectStats = (project) => {
    const kids = childrenOf(project.id);
    const total = kids.length;
    const done = kids.filter(k=>k.done).length;
    const mins = kids.reduce((s,k)=>s+parseTimeEst(k.timeEstimate),0);
    return { total, done, mins, kids };
  };
  // Auto-snooze: hide a delegation parent from columns while it has pending check-ins.
  // The check-ins themselves still appear, so the user always has something actionable.
  // Disabled when `showWaitingOn` (legacy) or new per-axis show-delegations toggle is on.
  const showDelegationsOnTimeline = !!tweaks.showDelegationsOnTimeline;
  const showCheckInsOnTimeline = !!tweaks.showCheckInsOnTimeline;
  const isAutoSnoozedDelegation = (t) => {
    if (showWaitingOn || showDelegationsOnTimeline) return false;
    if (!t || !t.delegatedTo || t.done) return false;
    const ids = t.checkInTaskIds || [];
    if (!ids.length) return false;
    return ids.some(cid => {
      const ct = activeTasks.find(x => x.id === cid);
      return ct && !ct.done;
    });
  };
  // Per-parent earliest active nudge. Used to dedupe nudge cards on the
  // Timeline so the same delegation doesn't litter the week with one card per
  // scheduled check-in — you only ever act on the next one.
  const nextNudgeIds = useMemo(()=>{
    const byParent = new Map();
    activeTasks.forEach(t=>{
      if(!t.checkInOf) return;
      if(t.done) return;
      if(t.snoozedUntil) return;
      const prev = byParent.get(t.checkInOf);
      const cmp = (a,b) => {
        const ad = a.date || '9999-99-99';
        const bd = b.date || '9999-99-99';
        if(ad !== bd) return ad < bd ? -1 : 1;
        return (a.checkInDayOffset ?? 0) - (b.checkInDayOffset ?? 0);
      };
      if(!prev || cmp(t, prev) < 0) byParent.set(t.checkInOf, t);
    });
    return new Set(Array.from(byParent.values()).map(t => t.id));
  }, [activeTasks]);
  const tasksByDate = useMemo(()=>{
    const map = new Map([['inbox', []]]);
    activeTasks.forEach(t=>{
      if(t.someday) return;
      if(t.parentId) return; // children render inside their project, not in a column
      if(isAutoSnoozedDelegation(t)) return;
      // Two-toggle model: delegated tasks are hidden unless `showDelegationsOnTimeline`
      // is on; check-in (synthetic reminder) tasks hidden unless `showCheckInsOnTimeline`.
      // Legacy `showWaitingOn`: when on, surface BOTH and *only* delegated/check-in.
      // Personal-reminder override: when a delegation's `personalReminderDate`
      // has arrived, the card surfaces regardless of the show-delegations toggle.
      const todayStr = D.str(D.today());
      const reminderDue = t.delegatedTo && t.personalReminderDate && t.personalReminderDate <= todayStr;
      if (showWaitingOn) {
        if (!t.delegatedTo && !t.checkInOf) return;
      } else {
        if (t.delegatedTo && !showDelegationsOnTimeline && !reminderDue) return;
        // Check-in reminders always surface on the timeline — they're the
        // actionable nudges, and the delegation parent is auto-snoozed
        // (isAutoSnoozedDelegation above), so without the check-ins visible
        // the delegation is invisible from the timeline entirely. The
        // showCheckInsOnTimeline tweak is kept for back-compat but no
        // longer gates visibility.
      }
      // Timeline-only: only the earliest active nudge per parent surfaces;
      // the rest stay accessible via Stack / drawer / parent's activity log.
      if(view === 'week' && t.checkInOf && !nextNudgeIds.has(t.id)) return;
      if(showStaleOnly && !isStale(t)) return;
      // Snoozed tasks bucket into the column matching their wake-up day so
      // the user can SEE what they've snoozed and when it'll return. Per
      // Column.jsx, snoozed tasks render in their own collapsible group
      // (parallel to Completed). For tasks snoozed to today, the SnoozeCountdown
      // bar + timer make the wait visible at a glance.
      const key = t.snoozedUntil
        ? (D.snoozeDayKey(t.snoozedUntil) || 'inbox')
        : (t.date || 'inbox');
      if(!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTasks, showWaitingOn, showStaleOnly, showDelegationsOnTimeline, showCheckInsOnTimeline, view, nextNudgeIds]);
  const taxonomyActions = {
    add(kind,label) {
      const trimmed = String(label||'').trim();
      if(!trimmed) return;
      setTaxonomy(prev => {
        if(kind==='context') {
          let id = slugId(trimmed,'CTX');
          const ids = new Set(prev.contexts.map(c=>c.id));
          let n=2; while(ids.has(id)) id = `${slugId(trimmed,'CTX')}_${n++}`;
          return {...prev, contexts:[...prev.contexts,{id,label:trimmed,color:'#94a3b8',defaultLifeArea:null}]};
        }
        const isLifeArea = kind==='lifeArea';
        const baseId = slugId(trimmed,isLifeArea?'area':'tag').toLowerCase();
        let id = baseId;
        const ids = new Set((isLifeArea ? prev.lifeAreas : prev.tags).map(t=>t.id));
        let n=2; while(ids.has(id)) id = `${baseId}_${n++}`;
        const colors = tagColors(id);
        const nextItem = {id,label:trimmed,color:colors.light.fg,dark:colors.dark,light:colors.light};
        return isLifeArea
          ? {...prev, lifeAreas:[...prev.lifeAreas,nextItem]}
          : {...prev, tags:[...prev.tags,nextItem]};
      });
    },
    update(kind,id,changes) {
      setTaxonomy(prev => {
        if(kind==='context') {
          return {...prev, contexts:prev.contexts.map(c=>c.id===id?{...c,...changes}:c)};
        }
        const key = kind==='lifeArea' ? 'lifeAreas' : 'tags';
        return {...prev, [key]:prev[key].map(t=>{
          if(t.id!==id) return t;
          if(changes.color) {
            return {
              ...t,
              ...changes,
              dark: changes.dark || {...(t.dark||tagColors(id).dark),fg:changes.color},
              light: changes.light || {...(t.light||tagColors(id).light),fg:changes.color},
            };
          }
          return {...t,...changes};
        })};
      });
    },
    autoColor(kind, scheme='Pastel') {
      const schemeFor = section => typeof scheme === 'object' ? (scheme[section] || 'Pastel') : scheme;
      const runSeed = `${Date.now()}-${Math.random()}`;
      const colorContexts = contexts => {
        const picks = taxonomyAutoSwatches(contexts.length, `context-${runSeed}-${contexts.map(c=>c.id).join('|')}`, schemeFor('context'));
        return contexts.map((c,i) => {
          const picked = picks[i] || taxonomyAutoSwatch(i, c.id, schemeFor('context'));
          return {...c,color:picked.color};
        });
      };
      const colorItems = (items, itemKind, offset=0) => {
        const picks = taxonomyAutoSwatches(items.length, `${itemKind}-${runSeed}-${offset}-${items.map(item=>item.id).join('|')}`, schemeFor(itemKind));
        return items.map((item,i) => {
          const picked = picks[i] || taxonomyAutoSwatch(i + offset, item.id, schemeFor(itemKind));
          return {...item,color:picked.color,dark:picked.dark,light:picked.light};
        });
      };
      setTaxonomy(prev => {
        if(kind==='context') {
          return {
            ...prev,
            contexts: colorContexts(prev.contexts),
          };
        }
        if(kind==='all') {
          return {
            ...prev,
            contexts: colorContexts(prev.contexts),
            tags: colorItems(prev.tags, 'tag', prev.contexts.length),
            lifeAreas: colorItems(prev.lifeAreas, 'lifeArea', prev.contexts.length + prev.tags.length),
          };
        }
        const key = kind==='lifeArea' ? 'lifeAreas' : 'tags';
        return {
          ...prev,
          [key]: colorItems(prev[key], kind),
        };
      });
      const target = kind==='all' ? 'everything' : kind==='context' ? 'locations' : kind==='lifeArea' ? 'life areas' : 'tags';
      const schemeLabel = kind==='all' && typeof scheme === 'object' ? 'selected schemes' : scheme;
      showToast(`Applied ${schemeLabel} colors to ${target}.`, {timeout:2500});
    },
    remove(kind,id) {
      if(kind==='context') {
        setTaxonomy(prev => ({...prev, contexts:prev.contexts.filter(c=>c.id!==id)}));
        setTasks(prev=>prev.map(t=>t.project===id?{...t,project:null}:t));
        setFilters(f=>({...f,projects:f.projects.filter(p=>p!==id)}));
      } else if (kind==='tag') {
        setTaxonomy(prev => ({...prev, tags:prev.tags.filter(t=>t.id!==id)}));
        setTasks(prev=>prev.map(t=>(t.tags||[]).includes(id)?{...t,tags:(t.tags||[]).filter(x=>x!==id)}:t));
        setFilters(f=>({...f,tags:f.tags.filter(t=>t!==id)}));
      } else {
        setTaxonomy(prev => ({
          ...prev,
          contexts: prev.contexts.map(c=>c.defaultLifeArea===id ? {...c,defaultLifeArea:null} : c),
          lifeAreas: prev.lifeAreas.filter(a=>a.id!==id),
        }));
        setTasks(prev=>prev.map(t=>t.lifeArea===id?{...t,lifeArea:null}:t));
        setFilters(f=>({...f,lifeAreas:f.lifeAreas.filter(a=>a!==id)}));
      }
    },
    move(kind,id,dir) {
      setTaxonomy(prev => {
        const key = kind==='context' ? 'contexts' : kind==='lifeArea' ? 'lifeAreas' : 'tags';
        const arr = [...prev[key]];
        const idx = arr.findIndex(x=>x.id===id);
        const ni = Math.max(0,Math.min(arr.length-1,idx+dir));
        if(idx<0 || idx===ni) return prev;
        const [item] = arr.splice(idx,1);
        arr.splice(ni,0,item);
        return {...prev,[key]:arr};
      });
    },
    async exportTaxonomy() {
      const stamp = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const text = JSON.stringify(taxonomy, null, 2);
      try { await navigator.clipboard.writeText(text); } catch {}
      const blob = new Blob([text], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tm-taxonomy-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Taxonomy exported');
    },
    importTaxonomy(file) {
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || 'null'));
          const next = normalizeTaxonomy(parsed);
          if(!window.confirm('Replace current taxonomy?')) return;
          setTaxonomy(next);
          showToast('Taxonomy imported');
        } catch {
          showToast('Invalid taxonomy JSON');
        }
      };
      reader.readAsText(file);
    },
  };
  const tasksForCol = (colKey) => applyFilters(tasksByDate.get(colKey) || []);

  // Append a reason to the recent-block-reasons LRU (max 8). Persistence
  // rides the settings blob via setTweak; no separate storage hop.
  const rememberRecentReason = (reason) => {
    const r = (reason||'').trim(); if (!r) return;
    setRecentBlockReasons(prev => [r, ...prev.filter(x=>x!==r)].slice(0,8));
  };

  // Precomputed inverse-blocker map: id -> count of tasks that list this id in blockedBy.
  const blockingCountMap = useMemo(()=>{
    const m = new Map();
    for (const t of tasks) {
      if (!t.blocked || t.done) continue;
      for (const id of (t.blockedBy||[])) m.set(id, (m.get(id)||0)+1);
    }
    return m;
  },[tasks]);
  const blockingCountFor = (id) => blockingCountMap.get(id) || 0;
  const taskTitleById = (id) => taskMap.get(id)?.title || null;

  // Cycle guard: would adding any of `candidateBlockers` to `rootId.blockedBy` create a cycle?
  const hasCycle = (rootId, candidateBlockers) => {
    const dfs = (cur, seen) => {
      if (cur === rootId) return true;
      if (seen.has(cur)) return false;
      seen.add(cur);
      const node = taskMap.get(cur);
      const adj = node?.blockedBy || [];
      return adj.some(n => dfs(n, seen));
    };
    return (candidateBlockers||[]).some(b => dfs(b, new Set()));
  };

  // Block a task. Idempotent on already-blocked tasks (just updates fields).
  const setBlocked = (id, opts={}) => {
    const { reason='', blockedBy=[], followUpAt=null, noUndo=false } = opts;
    const t = taskMap.get(id); if(!t) return;
    if (hasCycle(id, blockedBy)) {
      setToast('Would create a cycle'); setTimeout(()=>setToast(null),1400); return;
    }
    const now = new Date().toISOString();
    const tags = (t.tags||[]).includes('blocked') ? t.tags : [...(t.tags||[]), 'blocked'];
    const nextActivity = [...(t.activity||[]), {type:'blocked', reason, blockedBy, at: now}];
    if (!noUndo) setUndoStack(s=>[...s.slice(-9),{id,before:t}]);
    setTasks(prev => prev.map(x => x.id===id ? {
      ...x,
      blocked:true, blockedReason:reason, blockedBy:[...blockedBy], followUpAt,
      blockedSince: x.blockedSince || now,
      tags, activity: nextActivity,
    } : x));
    if (reason.trim()) rememberRecentReason(reason.trim());
  };

  // Clear block state on a task.
  const clearBlocked = (id, opts={}) => {
    const { fromAuto=false, noUndo=false } = opts;
    const t = taskMap.get(id); if(!t) return;
    const now = new Date().toISOString();
    const tags = (t.tags||[]).filter(x => x !== 'blocked');
    const nextActivity = [...(t.activity||[]), {type: fromAuto?'auto-unblocked':'unblocked', at: now}];
    if (!noUndo) setUndoStack(s=>[...s.slice(-9),{id,before:t}]);
    setTasks(prev => prev.map(x => x.id===id ? {
      ...x,
      blocked:false, blockedReason:'', blockedBy:[], blockedSince:null, followUpAt:null,
      tags, activity: nextActivity,
    } : x));
  };

  // Apply delegation transitions (delegatee change, schedule change, expiry change).
  // Returns { tasks: nextArr, mergedChanges: {...changes plus auto-derived fields like delegatedAt, checkInTaskIds, expiryTaskId} }.
  // Pure: no React state mutation. Side-effect: people-store updates via record* helpers.
  const applyDelegationChanges = (prev, before, changes) => {
    const ts = new Date().toISOString();
    const nameBefore = before.delegatedTo;
    const nameAfter  = changes.delegatedTo !== undefined ? changes.delegatedTo : nameBefore;
    const schedBefore = before.checkInSchedule;
    const schedAfterIncoming = changes.checkInSchedule !== undefined ? changes.checkInSchedule : schedBefore;
    const expBefore = before.expiryDate;
    const expAfter  = changes.expiryDate !== undefined ? changes.expiryDate : expBefore;

    // Detect transitions
    const delegateeAdded   = !nameBefore && nameAfter;
    const delegateeRemoved = nameBefore && !nameAfter;
    const delegateeChanged = nameBefore && nameAfter && nameBefore !== nameAfter;
    const scheduleChanged  = JSON.stringify(schedBefore) !== JSON.stringify(schedAfterIncoming) && nameAfter && !delegateeAdded && !delegateeRemoved && !delegateeChanged;
    const expiryChanged    = expBefore !== expAfter;

    if (!delegateeAdded && !delegateeRemoved && !delegateeChanged && !scheduleChanged && !expiryChanged) {
      return { tasks: null, mergedChanges: changes }; // no delegation work needed
    }

    let next = prev.slice();
    const merged = {...changes};
    const activity = [...(before.activity || [])];
    const pendingCheckInIds = (before.checkInTaskIds || []).filter(cid => {
      const t = next.find(x => x.id === cid);
      return t && !t.done;
    });

    const removePendingCheckIns = () => {
      if (!pendingCheckInIds.length) return;
      const set = new Set(pendingCheckInIds);
      next = next.filter(t => !set.has(t.id));
    };
    const removePendingExpiry = () => {
      if (!before.expiryTaskId) return;
      const exp = next.find(t => t.id === before.expiryTaskId);
      if (exp && !exp.done) next = next.filter(t => t.id !== before.expiryTaskId);
    };

    // Resolve final schedule (auto-fill from people store on first delegation)
    let finalSchedule = schedAfterIncoming;
    if ((delegateeAdded || delegateeChanged) && (!finalSchedule || !finalSchedule.length)) {
      finalSchedule = getPreferredCadence(nameAfter) || CHECKIN_PRESETS.standard;
    }

    if (delegateeAdded) {
      removePendingCheckIns(); // none should exist, but be safe
      removePendingExpiry();
      const delegationParent = {...before, ...merged, delegatedTo: nameAfter, checkInSchedule: finalSchedule};
      const checkIns = buildCheckInTasks(delegationParent, finalSchedule, ts);
      checkIns.forEach(c => next.push(c));
      let expiryTaskId = null;
      if (expAfter) {
        const exp = buildExpiryTask(delegationParent, expAfter);
        if (exp) { next.push(exp); expiryTaskId = exp.id; }
      }
      activity.push({type:'delegated', to: nameAfter, at: ts});
      Object.assign(merged, {
        delegatedAt: ts,
        delegationStatus: 'waiting',
        checkInSchedule: finalSchedule,
        checkInTaskIds: checkIns.map(c => c.id),
        expiryDate: expAfter || null,
        expiryTaskId,
        lastContactAt: null,
        activity,
      });
      recordDelegation(nameAfter, finalSchedule);
    } else if (delegateeChanged) {
      removePendingCheckIns();
      removePendingExpiry();
      const history = [...(before.delegationHistory || []), {to: nameBefore, at: before.delegatedAt || ts}];
      const delegationParent = {...before, ...merged, delegatedTo: nameAfter, checkInSchedule: finalSchedule};
      const checkIns = buildCheckInTasks(delegationParent, finalSchedule, ts);
      checkIns.forEach(c => next.push(c));
      let expiryTaskId = null;
      if (expAfter) {
        const exp = buildExpiryTask(delegationParent, expAfter);
        if (exp) { next.push(exp); expiryTaskId = exp.id; }
      }
      activity.push({type:'re-delegated', from: nameBefore, to: nameAfter, at: ts});
      Object.assign(merged, {
        delegatedAt: ts,
        delegationStatus: 'waiting',
        checkInSchedule: finalSchedule,
        checkInTaskIds: checkIns.map(c => c.id),
        expiryDate: expAfter || null,
        expiryTaskId,
        delegationHistory: history,
        lastContactAt: null,
        activity,
      });
      adjustOpenCount(nameBefore, -1);
      recordDelegation(nameAfter, finalSchedule);
    } else if (delegateeRemoved) {
      removePendingCheckIns();
      removePendingExpiry();
      activity.push({type:'reclaimed', at: ts});
      Object.assign(merged, {
        delegatedTo: null,
        delegationStatus: null,
        checkInSchedule: null,
        checkInTaskIds: [],
        expiryDate: null,
        expiryTaskId: null,
        // Take-back lands the task on today's column so the user actually sees it
        // again. Leaving date unchanged would leave it where it was at delegation,
        // potentially in the past.
        date: D.str(D.today()),
        someday: false,
        snoozedUntil: null,
        activity,
      });
      adjustOpenCount(nameBefore, -1);
    } else if (scheduleChanged) {
      removePendingCheckIns();
      const delegationParent = {...before, ...merged, checkInSchedule: finalSchedule};
      const checkIns = buildCheckInTasks(delegationParent, finalSchedule, before.delegatedAt || ts);
      checkIns.forEach(c => next.push(c));
      activity.push({type:'cadence-changed', schedule: finalSchedule, at: ts});
      Object.assign(merged, {
        checkInSchedule: finalSchedule,
        checkInTaskIds: checkIns.map(c => c.id),
        activity,
      });
      // Save the new cadence as preferred for this person
      recordDelegation.__skipBump = true; // sentinel — actually just upsert preferred without bumping totals
      const people = loadPeople();
      const k = personKey(nameAfter);
      if (k && people[k]) { people[k].preferredCadence = finalSchedule.slice(); savePeople(people); }
    } else if (expiryChanged) {
      removePendingExpiry();
      let expiryTaskId = null;
      if (expAfter) {
        const exp = buildExpiryTask({...before, ...merged}, expAfter);
        if (exp) { next.push(exp); expiryTaskId = exp.id; }
      }
      activity.push({type:'expiry-set', date: expAfter, at: ts});
      Object.assign(merged, { expiryDate: expAfter || null, expiryTaskId, activity });
    }

    return { tasks: next, mergedChanges: merged };
  };

  const updateTask = (id, changes) => {
    const before = tasks.find(t=>t.id===id);
    if(!before) return;
    // Delegation transitions: spawn/clean check-in tasks and expiry tasks.
    // Probe once to detect whether this update will cause a delegation transition.
    const probe = applyDelegationChanges(tasks, before, changes);
    if (probe.tasks) {
      setUndoStack(s=>[...s.slice(-9),{id,before}]);
      // Re-run applyDelegationChanges against the LATEST state inside the
      // setter so we don't clobber concurrent edits (realtime echoes, snooze
      // ticks, other updateTask calls in the same batch). Using the probe's
      // snapshot directly was the source of "delegations not saving on refresh"
      // — when something else mutated tasks between the probe and the commit,
      // the probe overwrote the new state with stale data.
      setTasks(prev => {
        const latestBefore = prev.find(t => t.id === id) || before;
        const out = applyDelegationChanges(prev, latestBefore, changes);
        const base = out.tasks || prev;
        return base.map(t => t.id === id ? applyTaskPatch(t, out.mergedChanges) : t);
      });
      return;
    }
    // Convert project → task: promote children up to parent's column.
    if(before.cardType==='project' && changes.cardType==='task') {
      const kids = tasks.filter(t=>t.parentId===id);
      pushSnapshotUndo();
      setTasks(prev=>prev.map(t=>{
        if(t.id===id) return applyTaskPatch(t, {...changes, childOrder:null});
        if(t.parentId===id) return applyTaskPatch(t, { parentId:null, date: before.date || null });
        return t;
      }));
      return;
    }
    // Convert task → project: ensure childOrder is initialized.
    if(before.cardType!=='project' && changes.cardType==='project') {
      setUndoStack(s=>[...s.slice(-9),{id,before}]);
      setTasks(prev=>prev.map(t=>t.id===id ? applyTaskPatch(t, {...changes, childOrder:t.childOrder||[]}) : t));
      return;
    }
    // Cadence re-alignment. If the user is setting/changing a recurrence
    // with a freq that doesn't match the card's current date (e.g. card on
    // Thursday, recurrence "weekly on Tuesday"), move the card to the next
    // valid cadence date >= card.date. Past dates are left alone — they're
    // history, not future-facing. Inbox tasks (no date) get nothing changed.
    const newRecForAlign = Object.prototype.hasOwnProperty.call(changes, 'recurrence') ? changes.recurrence : undefined;
    if (newRecForAlign?.freq && before.date) {
      const todayForAlign = D.str(D.today());
      if (before.date >= todayForAlign) {
        const dayCodes = ['sun','mon','tue','wed','thu','fri','sat'];
        const matchesCadence = (dateStr, rec) => {
          if (!rec?.freq) return true;
          const d = D.parse(dateStr); const dow = d.getDay();
          if (rec.freq === 'daily') return true;
          if (rec.freq === 'weekdays') return dow >= 1 && dow <= 5;
          if (rec.freq === 'weekly') {
            if (Array.isArray(rec.byDay) && rec.byDay.length) return rec.byDay.includes(dayCodes[dow]);
            return true;
          }
          if (rec.freq === 'monthly') {
            if (rec.byMonthDay) return d.getDate() === rec.byMonthDay;
            return true;
          }
          return true;
        };
        if (!matchesCadence(before.date, newRecForAlign)) {
          // Walking nextOccurrence from yesterday-of-start finds the next
          // valid date >= startDate (returns start if it matches, else next).
          const aligned = nextOccurrence(
            { recurrence: newRecForAlign },
            D.str(D.add(D.parse(before.date), -1))
          );
          if (aligned && aligned !== before.date) {
            changes = { ...changes, date: aligned };
          }
        }
      }
    }
    // Series propagation for recurrence edits. When the user changes a
    // routine's recurrence in the drawer, the change should affect more than
    // just this instance — otherwise the series silently desyncs. Rules:
    //   • pure isRoutine flip → copy flag to all non-archived siblings.
    //   • pattern change → drop open siblings (today + future); past
    //     done/archived stay frozen as historical record (Q1-B).
    //   • recurrence removed → drop future open siblings, this task becomes a
    //     one-off; past instances keep their recurrence shape.
    // extendRoutineHorizon next render regenerates the future on the new
    // schedule, walking forward from the edited instance's date.
    const beforeRec = before.recurrence;
    const recurrenceTouched =
      Object.prototype.hasOwnProperty.call(changes, 'recurrence') &&
      !!beforeRec?.recurrenceId;
    if (recurrenceTouched) {
      const rid = beforeRec.recurrenceId;
      const newRec = changes.recurrence;
      const patternKeys = ['freq','interval','byDay','byMonthDay','until'];
      const sameVal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const isPatternChange = !newRec || patternKeys.some(k => !sameVal(beforeRec[k], newRec[k]));
      const todayStr = D.str(D.today());
      pushSnapshotUndo();
      setTasks(prev => prev.flatMap(t => {
        if (t.id === id) return [applyTaskPatch(t, changes)];
        if (t.recurrence?.recurrenceId !== rid) return [t];
        if (!newRec) {
          // None on instance X: split-point semantics. The edited X becomes a
          // one-off (recurrence:null via applyTaskPatch above). Other siblings
          // dated AFTER X.date AND open are dropped — these are the "ones
          // ahead of it" the user wants gone. Siblings dated at-or-before X
          // (past done/archived, today, intermediate open) are left intact
          // EXCEPT they get `until: dayBefore(X.date)` added to their
          // recurrence so extendRoutineHorizon won't keep regenerating the
          // future. Series effectively ends at the previous occurrence.
          // Q1-B (history-honest): past recurrence shape kept, only the
          // until field is appended.
          const cutoffDate = before.date;
          if (!cutoffDate) return t.done || t.archived ? [t] : [];
          const dayBefore = D.str(D.add(D.parse(cutoffDate), -1));
          if (!t.done && !t.archived && t.date && t.date > cutoffDate) return [];
          if (t.recurrence) return [{ ...t, recurrence: { ...t.recurrence, until: dayBefore } }];
          return [t];
        }
        if (isPatternChange) {
          // Pattern change. Drop other open today/future siblings;
          // extendRoutineHorizon regenerates them on the new schedule next
          // render. Past done/archived siblings keep their existing
          // recurrence shape (Q1-B).
          if (!t.done && !t.archived && t.date && t.date >= todayStr) return [];
          return [t];
        }
        // Pure isRoutine flip — propagate the flag to all non-archived
        // siblings so strip / dashboard / rollup all read consistently.
        if (t.archived) return [t];
        return [{ ...t, recurrence: { ...t.recurrence, isRoutine: !!newRec.isRoutine } }];
      }));
      return;
    }
    // Date change on a routine instance whose series is freshly auto-spawned.
    // When a user converts a one-off task to a routine then immediately picks
    // a different start date, the horizon already populated future days based
    // on the old date. Drop those horizon-spawned siblings so the series
    // re-anchors at the new date; extendRoutineHorizon regenerates on the
    // next render. We only drop siblings that were horizon-spawned (their
    // activity log entry has reason: 'horizon') so user-created instances
    // (e.g. drag-out one-offs that stayed in the series) are left alone.
    if (
      Object.prototype.hasOwnProperty.call(changes, 'date') &&
      changes.date !== before.date &&
      before.recurrence?.recurrenceId
    ) {
      const rid = before.recurrence.recurrenceId;
      const isHorizonSpawned = (t) => Array.isArray(t.activity)
        && t.activity.length === 1
        && t.activity[0]?.reason === 'horizon';
      pushSnapshotUndo();
      setTasks(prev => prev.flatMap(t => {
        if (t.id === id) return [applyTaskPatch(t, changes)];
        if (t.recurrence?.recurrenceId !== rid) return [t];
        if (t.done || t.archived) return [t];
        if (isHorizonSpawned(t)) return [];
        return [t];
      }));
      return;
    }
    // First-add path: recurrence is going from null (or no recurrenceId) to
    // a full recurrence shape (freq + recurrenceId). When the source task is
    // already DONE and dated in the PAST, back-fill the gap from its date to
    // yesterday with done siblings — per user request, "if a user has a card
    // that has been complete in the past and makes it a routine, it should
    // make completed instances in the past, and uncompleted instances in
    // the present and future." extendRoutineHorizon handles today+future
    // (undone) on the next render; archiveStaleRoutines skips done siblings,
    // so the back-filled history sticks.
    const todayStr = D.str(D.today());
    if (
      Object.prototype.hasOwnProperty.call(changes, 'recurrence') &&
      changes.recurrence?.freq &&
      changes.recurrence?.recurrenceId &&
      !beforeRec?.freq &&
      before.done &&
      before.date &&
      before.date < todayStr
    ) {
      const newRec = changes.recurrence;
      const backfill = [];
      let cur = before.date;
      let pastDoneCount = 0;
      let presentCount = 0;
      for (let i = 0; i < 400; i++) {
        const nextDate = nextOccurrence({ recurrence: newRec }, cur);
        if (!nextDate || nextDate > todayStr) break;
        const isPast = nextDate < todayStr;
        const now = new Date().toISOString();
        backfill.push(syncTaskSnooze({
          ...before,
          id: mkid(),
          date: nextDate,
          done: isPast,
          completedAt: isPast ? (before.completedAt || now) : null,
          archived: false,
          subtasks: (before.subtasks || []).map(s => ({ ...s, done: isPast })),
          activity: [{ type: 'created', at: now, reason: 'back-fill' }],
          createdAt: now,
          recurrence: newRec,
        }));
        if (isPast) pastDoneCount++; else presentCount++;
        cur = nextDate;
      }
      if (backfill.length) {
        pushSnapshotUndo();
        setTasks(prev => [
          ...prev.map(t => t.id === id ? applyTaskPatch(t, changes) : t),
          ...backfill,
        ]);
        const parts = [];
        if (pastDoneCount) parts.push(`${pastDoneCount} past as done`);
        if (presentCount) parts.push(`today undone`);
        showToast(`Back-filled ${parts.join(' + ')}`, { undoable: true });
        return;
      }
    }
    // Title propagation for routine series. Renaming any instance renames all siblings.
    const titleTouched =
      Object.prototype.hasOwnProperty.call(changes, 'title') &&
      changes.title !== before.title &&
      before.recurrence?.recurrenceId;
    if (titleTouched) {
      const rid = before.recurrence.recurrenceId;
      pushSnapshotUndo();
      setTasks(prev => prev.map(t => {
        if (t.id === id) return applyTaskPatch(t, changes);
        if (t.recurrence?.recurrenceId !== rid) return t;
        return { ...t, title: changes.title };
      }));
      return;
    }
    setUndoStack(s=>[...s.slice(-9),{id,before}]);
    setTasks(prev=>prev.map(t=>t.id===id ? applyTaskPatch(t, changes) : t));
  };
  const bulkUpdateTasks = (ids, changes) => {
    if (!ids || !ids.length) return;
    pushSnapshotUndo();
    const idSet = new Set(ids);
    setTasks(prev => prev.map(t => idSet.has(t.id) ? applyTaskPatch(t, changes) : t));
    if (changes.tags) (changes.tags||[]).forEach(t => pushRecent('tags', t));
    if (changes.project) pushRecent('projects', changes.project);
    showToast(`Updated ${ids.length} task${ids.length===1?'':'s'}`, {undoable:true});
  };
  // Collect the pending check-in + expiry follower IDs for a delegated parent.
  // Returns null if the parent isn't delegated or has no pending followers, so
  // callers can short-circuit without paying the people-store adjustment.
  const delegationFollowersOf = (task, taskList) => {
    if (!task || !task.delegatedTo) return null;
    const ids = new Set();
    (task.checkInTaskIds || []).forEach(cid => {
      const ct = taskList.find(x => x.id === cid);
      if (ct && !ct.done) ids.add(cid);
    });
    if (task.expiryTaskId) {
      const exp = taskList.find(x => x.id === task.expiryTaskId);
      if (exp && !exp.done) ids.add(task.expiryTaskId);
    }
    return ids.size ? { followerIds: ids, openCountName: task.delegatedTo } : null;
  };

  const deleteTask = (id) => {
    const task = taskById(id); if(!task) return;
    // Project: promote children to the column instead of cascading delete.
    if(task.cardType === 'project') {
      const kids = tasks.filter(t=>t.parentId===id);
      const followers = delegationFollowersOf(task, tasks);
      pushSnapshotUndo();
      setTasks(prev => prev
        .filter(t => t.id!==id && !(followers && followers.followerIds.has(t.id)))
        .map(t => t.parentId===id ? applyTaskPatch(t, { parentId:null, date: task.date || null }) : t));
      // Cascade-delete calendar events for the deleted project + any deleted followers.
      const removedIds = new Set([id, ...(followers ? [...followers.followerIds] : [])]);
      setEvents(prev => prev.filter(e => !e.taskId || !removedIds.has(e.taskId)));
      if (followers) adjustOpenCount(followers.openCountName, -1);
      setSelectedIds(prev=>{const next=new Set(prev);next.delete(id);return next;});
      if(drawerId===id) setDrawerId(null);
      if(focusedId===id) setFocusedId(null);
      if(kids.length) {
        setToast(`Project deleted; ${kids.length} card${kids.length===1?'':'s'} promoted`);
        setTimeout(()=>setToast(null),1600);
      }
      return;
    }
    // Child of a project: also remove from parent's childOrder.
    const followers = delegationFollowersOf(task, tasks);
    if(task.parentId) {
      pushSnapshotUndo();
      setTasks(prev => prev
        .filter(t => t.id!==id && !(followers && followers.followerIds.has(t.id)))
        .map(t => t.id===task.parentId ? {...t, childOrder:(t.childOrder||[]).filter(cid=>cid!==id)} : t));
    } else {
      setUndoStack(s=>[...s.slice(-9),{id,before:task,deleted:true}]);
      setTasks(prev => prev.filter(t => t.id!==id && !(followers && followers.followerIds.has(t.id))));
    }
    // Cascade-delete calendar events across all dates for the deleted task + followers.
    const removedIds = new Set([id, ...(followers ? [...followers.followerIds] : [])]);
    setEvents(prev => prev.filter(e => !e.taskId || !removedIds.has(e.taskId)));
    if (followers) adjustOpenCount(followers.openCountName, -1);
    setSelectedIds(prev=>{const next=new Set(prev);next.delete(id);return next;});
    if(drawerId===id) setDrawerId(null);
    if(focusedId===id) setFocusedId(null);
    showToast(`Deleted "${(task.title||'Task').slice(0,40)}"`, {undoable:true});
  };
  const archiveTask = (id) => {
    const task=taskById(id); if(!task) return;
    // Project: cascade archive to all children. Also archive the delegation
    // followers (check-ins/expiry) so they don't linger as ghost tasks.
    if(task.cardType==='project') {
      const now = new Date().toISOString();
      // Gather follower IDs from the project itself and any delegated children.
      const followerIds = new Set();
      const openCountAdjustments = [];
      const collect = (t) => {
        const f = delegationFollowersOf(t, tasks);
        if (f) {
          f.followerIds.forEach(fid => followerIds.add(fid));
          openCountAdjustments.push(f.openCountName);
        }
      };
      collect(task);
      tasks.filter(t => t.parentId===id).forEach(collect);
      pushSnapshotUndo();
      setTasks(prev=>prev.map(t=>{
        if(t.id===id || t.parentId===id || followerIds.has(t.id)) return {...t, archived:true, archivedAt:now};
        return t;
      }));
      openCountAdjustments.forEach(name => adjustOpenCount(name, -1));
    } else {
      const followers = delegationFollowersOf(task, tasks);
      const now = new Date().toISOString();
      setUndoStack(s=>[...s.slice(-9),{id,before:task}]);
      setTasks(prev=>prev.map(t=>{
        if (t.id===id || (followers && followers.followerIds.has(t.id))) return {...t, archived:true, archivedAt:now};
        return t;
      }));
      if (followers) adjustOpenCount(followers.openCountName, -1);
    }
    if(drawerId===id) setDrawerId(null);
    if(focusedId===id) setFocusedId(null);
    if(renamingId===id) setRenamingId(null);
    setSelectedIds(prev=>{const next=new Set(prev);next.delete(id);return next;});
    setToast('Archived');
    setTimeout(()=>setToast(null),1400);
  };
  const duplicateTask = (id) => {
    const t=taskById(id); if(!t) return;
    const now = new Date().toISOString();
    if(t.cardType === 'project') {
      // Deep copy: clone project + children with new ids, rewire parentId/childOrder.
      const kids = tasks.filter(c=>c.parentId===id);
      const idMap = new Map(); // oldChildId -> newChildId
      kids.forEach(k => idMap.set(k.id, mkid()));
      const newProjectId = mkid();
      const newProject = syncTaskSnooze({
        ...t,
        id: newProjectId,
        title: t.title + ' (copy)',
        createdAt: now,
        childOrder: (t.childOrder||[]).map(cid => idMap.get(cid)).filter(Boolean),
      });
      const newKids = kids.map(k => syncTaskSnooze({
        ...k,
        id: idMap.get(k.id),
        parentId: newProjectId,
        createdAt: now,
      }));
      pushSnapshotUndo();
      setTasks(prev => [...prev, newProject, ...newKids]);
      return;
    }
    const nt=syncTaskSnooze({...t,id:mkid(),title:t.title+' (copy)',createdAt:now});
    setTasks(prev=>[...prev,nt]);
  };
  const addTask = (colKey, date, title, position={}) => {
    // If adding inside a project, inherit project context/tags/priority and skip the date.
    let inherit = {};
    let parentId = position.parentId || null;
    if(parentId) {
      const parent = taskById(parentId);
      if(parent) inherit = {project:parent.project, tags:[...(parent.tags||[])], priority:parent.priority, pri:parent.pri||parent.priority};
    }
    // Group context: explicit position.groupId wins; otherwise inherit from a
    // sibling reference (beforeId / afterId) so "+ between members" lands in
    // the same group. validGid guards against stale group references.
    const validGid = new Set((tweaks.customGroups||[]).map(g=>g.id));
    let groupId = position.groupId && validGid.has(position.groupId) ? position.groupId : null;
    if (!groupId && (position.beforeId || position.afterId)) {
      const ref = taskById(position.beforeId || position.afterId);
      if (ref?.groupId && validGid.has(ref.groupId)) groupId = ref.groupId;
    }
    const trimmedTitle = title || 'Untitled';
    const explicitLifeArea = position.lifeArea;
    const inheritedProject = inherit.project || position.project || null;
    const defaultProject = inheritedProject || 'LIFE';
    const suggestedLifeArea = suggestLifeAreaFromTitle(trimmedTitle);
    const nextLifeArea = explicitLifeArea !== undefined
      ? explicitLifeArea
      : suggestedLifeArea
        ? suggestedLifeArea
        : parentId
          ? null
          : defaultLifeAreaForLocation(defaultProject, taxonomy);
    const nt = makeTask({
      title: trimmedTitle,
      date: parentId ? null : (date?D.str(date):null),
      parentId,
      lifeArea: nextLifeArea,
      ...inherit,
      ...(groupId ? { groupId } : {}),
    });
    const placeAtTop = (tweaks.newTaskPosition || 'top') === 'top';
    setTasks(prev=>{
      // Stamp `position` on top-level tasks so the slot survives a refresh.
      // Children sort via the parent's childOrder, so they don't need one.
      if (!parentId) {
        const dateKey = nt.date || null;
        const bucket = prev.filter(t =>
          (dateKey ? t.date === dateKey : !t.date) &&
          !t.parentId && !t.archived
        );
        const sortedBucket = [...bucket].sort((a, b) =>
          (Number.isFinite(a.position) ? a.position : Infinity) -
          (Number.isFinite(b.position) ? b.position : Infinity)
        );
        let above = null, below = null;
        const refId = position.beforeId || position.afterId;
        if (refId) {
          const idx = sortedBucket.findIndex(t => t.id === refId);
          if (idx >= 0) {
            if (position.afterId) { above = sortedBucket[idx]; below = sortedBucket[idx + 1]; }
            else { above = sortedBucket[idx - 1]; below = sortedBucket[idx]; }
          }
        }
        if (!refId) {
          if (placeAtTop) below = sortedBucket[0];
          else above = sortedBucket[sortedBucket.length - 1];
        }
        nt.position = computePosition(above, below);
      }
      let next = [...prev, nt];
      if(parentId) {
        // Insert into the parent's childOrder at the requested index (before/after a sibling, or append).
        next = next.map(t => {
          if(t.id !== parentId) return t;
          const order = [...(t.childOrder || [])];
          const refId = position.beforeId || position.afterId;
          if(refId) {
            const idx = order.indexOf(refId);
            if(idx >= 0) {
              const insertAt = position.afterId ? idx + 1 : idx;
              order.splice(insertAt, 0, nt.id);
            } else {
              order.push(nt.id);
            }
          } else if (placeAtTop) {
            order.unshift(nt.id);
          } else {
            order.push(nt.id);
          }
          return {...t, childOrder: order};
        });
        return next;
      }
      const targetId = position.beforeId || position.afterId;
      if(targetId) {
        const idx = prev.findIndex(t=>t.id===targetId);
        if(idx<0) return next;
        const insertAt = position.afterId ? idx + 1 : idx;
        return [...prev.slice(0,insertAt),nt,...prev.slice(insertAt)];
      }
      return placeAtTop ? [nt, ...prev] : next;
    });
    if (view === 'stack' && !parentId && !(position.beforeId || position.afterId)) {
      // Record the new task's slot in manualOrder so it lands sensibly when the
      // user later switches to Manual sort. Don't flip the active sort — that
      // silently reorders the whole list out from under the user.
      const order = tweaks.stackOrder || [];
      const filtered = order.filter(id => id !== nt.id);
      let nextOrder = null;
      if (groupId) {
        // Adding to an existing group: anchor next to the last member so the
        // group's slot stays where it is. Otherwise the new task lands at
        // index 0 of stackOrder and (in manual sort) becomes the first
        // groupId match in `sorted`, dragging the whole group's slot to the
        // top of the stack.
        const memberIds = tasks
          .filter(t => t.groupId === groupId && t.id !== nt.id)
          .map(t => t.id);
        const orderedMembers = memberIds
          .map(id => ({ id, idx: filtered.indexOf(id) }))
          .filter(x => x.idx >= 0)
          .sort((a, b) => a.idx - b.idx);
        const lastMember = orderedMembers[orderedMembers.length - 1];
        if (lastMember) {
          nextOrder = [
            ...filtered.slice(0, lastMember.idx + 1),
            nt.id,
            ...filtered.slice(lastMember.idx + 1),
          ];
        } else if (memberIds.length) {
          // Members exist but none are in stackOrder yet — append the new
          // task to the end so it doesn't jump to the top.
          nextOrder = [...filtered, nt.id];
        }
      }
      if (!nextOrder) {
        nextOrder = placeAtTop ? [nt.id, ...filtered] : [...filtered, nt.id];
      }
      setTweak('stackOrder', nextOrder);
    }
    setSettingsOpen(false);
    setDrawerId(null);
    setFocusedId(nt.id);
    setRenamingId(nt.id);
  };
  // Apply done-completion to a single task (no project logic, no recurrence spawn).
  // Returns the updated task list mapper.
  const applyDoneToTask = (prev, id, nowDone, ts) => prev.map(t => {
    if (t.id !== id) return t;
    if (nowDone) {
      // Completing a task clears its blocked state and #blocked tag.
      const tags = (t.tags||[]).filter(x => x !== 'blocked');
      // Inbox tasks (no date, top-level) move to today's completed bucket on completion.
      const datePatch = (!t.date && !t.parentId) ? {date: todayKey} : {};
      return {...t, done:true, completedAt: ts, ...datePatch,
        blocked:false, blockedReason:'', blockedBy:[], blockedSince:null, followUpAt:null, tags};
    }
    return {...rollTaskDateForward(t), done:false, completedAt: null};
  });

  // Sweep tasks: drop `completedId` from any blocker list; if a task's blockedBy empties, auto-unblock.
  // Returns { tasks: nextArr, autoUnblockedTitles: [titles] } so the caller can toast.
  const sweepAutoUnblock = (prev, completedId) => {
    const titles = [];
    const next = prev.map(t => {
      if (t.done || !t.blocked) return t;
      const list = t.blockedBy || [];
      if (!list.includes(completedId)) return t;
      const remaining = list.filter(x => x !== completedId);
      if (remaining.length === 0) {
        titles.push(t.title);
        const tags = (t.tags||[]).filter(x => x !== 'blocked');
        const activity = [...(t.activity||[]), {type:'auto-unblocked', at: new Date().toISOString()}];
        return {...t, blocked:false, blockedReason:'', blockedBy:[], blockedSince:null, followUpAt:null, tags, activity};
      }
      return {...t, blockedBy: remaining};
    });
    return {tasks: next, autoUnblockedTitles: titles, firstUnblockedId: next.find(t=>titles.includes(t.title))?.id};
  };

  // Delegation sweep on completion. Two cases:
  //  (A) `completedTask` is a check-in task: advance parent's delegationStatus, log activity,
  //      maybe stretch cadence (two nudge-sents in a row), record contact if 'heard-back'.
  //  (B) `completedTask` is a delegation parent: drop pending check-in + expiry tasks.
  // `mode` is 'sent-nudge' | 'heard-back' | undefined (auto-derive from parent status).
  const sweepDelegationOnComplete = (prev, completedTask, ts, mode) => {
    if (completedTask.checkInOf) {
      const parentId = completedTask.checkInOf;
      const parent = prev.find(t => t.id === parentId);
      if (!parent) return { tasks: prev };
      if (!mode) mode = (parent.delegationStatus === 'sent') ? 'heard-back' : 'sent-nudge';

      let next = prev.map(t => {
        if (t.id !== parentId) return t;
        const activity = [...(t.activity||[])];
        let newStatus = t.delegationStatus;
        let lastContactAt = t.lastContactAt;
        if (mode === 'sent-nudge') {
          newStatus = 'sent';
          activity.push({type:'nudge-sent', day: completedTask.checkInDayOffset, at: ts});
        } else {
          newStatus = 'heard-back';
          lastContactAt = ts;
          activity.push({type:'heard-back', day: completedTask.checkInDayOffset, at: ts});
        }
        return {...t, delegationStatus: newStatus, lastContactAt, activity};
      });

      let stretchTriggered = false;
      if (mode === 'sent-nudge') {
        const evs = (parent.activity||[]).filter(a => a.type === 'nudge-sent' || a.type === 'heard-back');
        const last = evs[evs.length - 1];
        if (last && last.type === 'nudge-sent') {
          const oldSched = parent.checkInSchedule || [];
          const newSched = stretchSchedule(oldSched, completedTask.checkInDayOffset, 1.5);
          if (JSON.stringify(newSched) !== JSON.stringify(oldSched)) {
            stretchTriggered = true;
            const pendingPast = new Set();
            (parent.checkInTaskIds || []).forEach(cid => {
              const ct = next.find(x => x.id === cid);
              if (ct && !ct.done && ct.checkInDayOffset > completedTask.checkInDayOffset) pendingPast.add(cid);
            });
            next = next.filter(t => !pendingPast.has(t.id));
            const remainingIds = (parent.checkInTaskIds||[]).filter(cid => !pendingPast.has(cid));
            const updatedParent = {...parent, checkInSchedule: newSched};
            const newOffsets = newSched.filter(o => o > completedTask.checkInDayOffset);
            const newCheckIns = buildCheckInTasks(updatedParent, newOffsets, parent.delegatedAt || ts);
            newCheckIns.forEach(c => next.push(c));
            next = next.map(t => t.id === parentId ? {
              ...t, checkInSchedule: newSched,
              checkInTaskIds: [...remainingIds, ...newCheckIns.map(c=>c.id)],
              activity: [...(t.activity||[]), {type:'cadence-stretched', factor:1.5, at: ts}],
            } : t);
          }
        }
      }

      return {
        tasks: next,
        recordContactName: mode === 'heard-back' ? parent.delegatedTo : null,
        stretchTriggered,
      };
    }

    if (completedTask.delegatedTo && ((completedTask.checkInTaskIds||[]).length || completedTask.expiryTaskId)) {
      const pendingIds = new Set();
      (completedTask.checkInTaskIds || []).forEach(cid => {
        const ct = prev.find(x => x.id === cid);
        if (ct && !ct.done) pendingIds.add(cid);
      });
      let clearExpiry = false;
      if (completedTask.expiryTaskId) {
        const exp = prev.find(x => x.id === completedTask.expiryTaskId);
        if (exp && !exp.done) { pendingIds.add(completedTask.expiryTaskId); clearExpiry = true; }
      }
      if (pendingIds.size) {
        // Strip the soon-to-be-deleted IDs from the parent so syncTaskDiff doesn't
        // upsert a parent row that points at children we're about to delete in the
        // same batch (which is what stranded Tax return's check-ins in Supabase).
        return {
          tasks: prev
            .filter(t => !pendingIds.has(t.id))
            .map(t => {
              if (t.id !== completedTask.id) return t;
              const remainingIds = (t.checkInTaskIds || []).filter(cid => !pendingIds.has(cid));
              const patch = { checkInTaskIds: remainingIds };
              if (clearExpiry) patch.expiryTaskId = null;
              return { ...t, ...patch };
            }),
          openCountChange: -1,
          openCountName: completedTask.delegatedTo,
        };
      }
    }
    return { tasks: prev };
  };

  const shiftDueDateForRecurrence = (item, nextDate) => {
    if (!item?.dueDate) return null;
    if (!item.date) return item.dueDate;
    const delta = Math.round((D.parse(item.dueDate) - D.parse(item.date)) / 86400000);
    return D.str(D.add(D.parse(nextDate), delta));
  };

  // Spawn the next recurrence of a task (deep-copy children if it's a project).
  const spawnRecurrence = (task, nextDate, prevTasks) => {
    const now = new Date().toISOString();
    const additions = [];
    if(task.cardType === 'project') {
      const kids = prevTasks.filter(c=>c.parentId===task.id);
      const idMap = new Map();
      kids.forEach(k => idMap.set(k.id, mkid()));
      const newProjectId = mkid();
      additions.push(syncTaskSnooze({
        ...task,
        id: newProjectId,
        done: false, completedAt: null,
        date: nextDate,
        dueDate: shiftDueDateForRecurrence(task, nextDate),
        childOrder: (task.childOrder||[]).map(cid => idMap.get(cid)).filter(Boolean),
        subtasks: (task.subtasks || []).map(s => ({ ...s, done: false })),
        activity: [{type:'created',at:now}],
      }));
      kids.forEach(k => additions.push(syncTaskSnooze({
        ...k,
        id: idMap.get(k.id),
        parentId: newProjectId,
        done: false, completedAt: null,
        dueDate: shiftDueDateForRecurrence(k, k.date || nextDate),
        subtasks: (k.subtasks || []).map(s => ({ ...s, done: false })),
        activity: [{type:'created',at:now}],
      })));
    } else {
      additions.push(syncTaskSnooze({
        ...task, id: mkid(),
        done:false, completedAt:null,
        date: nextDate,
        dueDate: shiftDueDateForRecurrence(task, nextDate),
        // Fresh checklist on each spawn — same for tasks-with-cadence and
        // routines (we don't want last cycle's ticks bleeding into this one).
        subtasks: (task.subtasks || []).map(s => ({ ...s, done: false })),
        activity:[{type:'created',at:now}],
      }));
    }
    return additions;
  };

  // Mark a project + all its children done (or undone, no dialog).
  const setProjectDone = (projectId, nowDone) => {
    const ts = new Date().toISOString();
    pushSnapshotUndo();
    let projectAfter = null;
    const completedIds = [];
    setTasks(prev => {
      let next = prev.map(t => {
          if(t.id===projectId) {
            if (nowDone) completedIds.push(t.id);
            const cleared = nowDone ? {blocked:false, blockedReason:'', blockedBy:[], blockedSince:null, followUpAt:null, tags:(t.tags||[]).filter(x=>x!=='blocked')} : {};
            projectAfter = {...(nowDone ? t : rollTaskDateForward(t)), done:nowDone, completedAt: nowDone?ts:null, ...cleared};
            return projectAfter;
          }
          if(t.parentId===projectId) {
            if (nowDone) completedIds.push(t.id);
            const cleared = nowDone ? {blocked:false, blockedReason:'', blockedBy:[], blockedSince:null, followUpAt:null, tags:(t.tags||[]).filter(x=>x!=='blocked')} : {};
            return {...(nowDone ? t : rollTaskDateForward(t)), done:nowDone, completedAt: nowDone?ts:null, ...cleared};
          }
        return t;
      });
      // Auto-unblock anything waiting on these.
      if (nowDone && completedIds.length) {
        let allTitles = [];
        let firstUnblockedId = null;
        for (const cid of completedIds) {
          const swept = sweepAutoUnblock(next, cid);
          next = swept.tasks;
          allTitles = allTitles.concat(swept.autoUnblockedTitles);
          if (!firstUnblockedId && swept.firstUnblockedId) firstUnblockedId = swept.firstUnblockedId;
        }
        if (allTitles.length) {
          const names = allTitles.slice(0,2).join(', ') + (allTitles.length>2 ? `, +${allTitles.length-2}` : '');
          setToast(`Unblocked: ${names}`);
          setTimeout(()=>setToast(null), 2200);
          if (firstUnblockedId) setFocusedId(firstUnblockedId);
        }
      }
      // Delegation sweep: when a delegated project is marked done, drop pending check-ins/expiry.
      // (Mirrors the per-task sweep at the bottom of completeTask. setProjectDone bypasses that
      // branch because projects cascade, so the cleanup has to happen here.)
      if (nowDone && projectAfter && projectAfter.delegatedTo) {
        const sweepDel = sweepDelegationOnComplete(next, projectAfter, ts);
        next = sweepDel.tasks;
        if (sweepDel.openCountChange && sweepDel.openCountName) adjustOpenCount(sweepDel.openCountName, sweepDel.openCountChange);
      }
      return next;
    });
    // Recurrence on the project shell, only when marking done.
    if(nowDone) {
      const proj = taskById(projectId);
      if(proj?.recurrence && proj.date) {
        const nextDate = nextOccurrence(proj, proj.date);
        if(nextDate) {
          setTasks(prev => {
            const additions = spawnRecurrence(proj, nextDate, prev);
            additions.forEach(a => setSpawning(s=>new Set([...s,a.id])));
            setToast(`↻ Recurring · next: ${nextDate}`);
            setTimeout(()=>{ setSpawning(s=>{const ns=new Set(s);additions.forEach(a=>ns.delete(a.id));return ns;}); setToast(null); }, 3000);
            return [...prev, ...additions];
          });
        }
      }
    }
  };

  const completeTask = (id, colKey, checkInMode) => {
    const task=taskById(id); if(!task) return;
    const nowDone=!task.done;
    if (nowDone) haptics.tap();
    // Project with at least one incomplete child → confirm dialog before cascading.
    if(task.cardType==='project') {
      const kids = tasks.filter(t=>t.parentId===id);
      const incomplete = kids.filter(k=>!k.done);
      if(nowDone && incomplete.length > 0) {
        setConfirmDialog({
          message: `Mark project and all ${incomplete.length} child card${incomplete.length===1?'':'s'} as done?`,
          onConfirm: () => { setProjectDone(id, true); setConfirmDialog(null); },
          onCancel: () => setConfirmDialog(null),
        });
        return;
      }
      setProjectDone(id, nowDone);
      return;
    }
    // Regular task or child: standard completion.
    const ts = new Date().toISOString();
    setUndoStack(s=>[...s.slice(-9),{id,before:task}]);
    setTasks(prev=>{
      let next = applyDoneToTask(prev, id, nowDone, ts);
      // If completing a child, check if all siblings are now done → auto-complete project (passive, no dialog).
      let autoCompletedProject = null;
      if(nowDone && task.parentId) {
        const siblings = next.filter(t=>t.parentId===task.parentId);
        const allDone = siblings.length > 0 && siblings.every(s=>s.done);
        if(allDone) {
          next = next.map(t => {
            if (t.id===task.parentId && !t.done) {
              const updated = {...t, done:true, completedAt:ts};
              autoCompletedProject = updated;
              return updated;
            }
            return t;
          });
        }
      }
      // If a delegated project just auto-completed, sweep its pending check-ins/expiry.
      if (autoCompletedProject && autoCompletedProject.delegatedTo) {
        const sweepDel = sweepDelegationOnComplete(next, autoCompletedProject, ts);
        next = sweepDel.tasks;
        if (sweepDel.openCountChange && sweepDel.openCountName) adjustOpenCount(sweepDel.openCountName, sweepDel.openCountChange);
      }
      // Auto-unblock any tasks whose blockers just got completed.
      if (nowDone) {
        const swept = sweepAutoUnblock(next, id);
        next = swept.tasks;
        if (swept.autoUnblockedTitles.length) {
          const names = swept.autoUnblockedTitles.slice(0,2).join(', ') + (swept.autoUnblockedTitles.length>2 ? `, +${swept.autoUnblockedTitles.length-2}` : '');
          const jumpId = swept.firstUnblockedId;
          setToast(`Unblocked: ${names}`);
          setTimeout(()=>setToast(null), 2200);
          if (jumpId) {
            // Stash for the toast click handler — simplest: set focus to the first unblocked task.
            setFocusedId(jumpId);
          }
        }
        // Delegation sweep: handle check-in completion → parent status; or parent done → kill children.
        const sweepDel = sweepDelegationOnComplete(next, task, ts, checkInMode);
        next = sweepDel.tasks;
        if (sweepDel.recordContactName) recordContact(sweepDel.recordContactName, ts);
        if (sweepDel.openCountChange && sweepDel.openCountName) adjustOpenCount(sweepDel.openCountName, sweepDel.openCountChange);
        if (sweepDel.stretchTriggered) {
          setToast('Cadence stretched ×1.5');
          setTimeout(()=>setToast(null), 2200);
        }
      }
      return next;
    });
    // Spawn-on-completion for recurring tasks. Skip for routines — those are
    // pre-generated by extendRoutineHorizon (which runs idempotently on the
    // tasks effect), so completing a routine MUST NOT spawn a duplicate of
    // tomorrow's instance that horizon already created. Also dedup against
    // existing siblings at nextDate so toggling done→undone→done doesn't
    // pile up future copies.
    if(nowDone && task.recurrence && task.date && !task.recurrence.isRoutine) {
      const nextDate=nextOccurrence(task,task.date);
      if(nextDate) {
        setTasks(prev => {
          const rid = task.recurrence?.recurrenceId;
          const dupe = rid && prev.some(t => t.id !== task.id && t.recurrence?.recurrenceId === rid && t.date === nextDate && !t.archived);
          if (dupe) return prev;
          const additions = spawnRecurrence(task, nextDate, prev);
          additions.forEach(a => setSpawning(s=>new Set([...s,a.id])));
          setToast(`↻ Recurring · next: ${nextDate}`);
          setTimeout(()=>{ setSpawning(s=>{const ns=new Set(s);additions.forEach(a=>ns.delete(a.id));return ns;}); setToast(null); }, 3000);
          return [...prev, ...additions];
        });
      }
    }
  };
  const moveTaskDay = (id, delta) => {
    const task=taskById(id); if(!task) return;
    if(!task.date) { updateTask(id,{date:D.str(D.add(D.today(),delta>0?0:-1))}); return; }
    updateTask(id,{date:D.str(D.add(D.parse(task.date),delta))});
  };
  const undo = () => {
    if(!undoStack.length) return;
    const last=undoStack[undoStack.length-1];
    setUndoStack(s=>s.slice(0,-1));
    if(last.bulk) {
      setTasks(last.before);
      if (last.beforeGroups !== undefined) setTweak('customGroups', last.beforeGroups);
      return;
    }
    if(last.deleted) { setTasks(prev=>[...prev,last.before]); return; }
    setTasks(prev=>prev.map(t=>t.id===last.id?last.before:t));
  };

  const resizeSidePanel = (e, panel) => {
    e.preventDefault();
    e.stopPropagation();
    const key = panel==='inbox' ? 'inboxWidth' : panel==='nobucket' ? 'noBucketWidth' : 'projectPanelWidth';
    const startX = e.clientX;
    const startWidth = Number(tweaks[key]) || (panel==='inbox'?340:panel==='nobucket'?260:190);
    const min = panel==='inbox'?132:panel==='nobucket'?132:140;
    const max = panel==='inbox'?360:panel==='nobucket'?400:360;
    const onMove = ev => setTweak(key, Math.max(min, Math.min(max, startWidth + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const resizeNav = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = Number(tweaks.navWidth) || 196;
    const onMove = ev => setTweak('navWidth', Math.max(140, Math.min(280, startWidth + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Pick a fractional `position` between two neighbours so a single drag-drop
  // is captured by syncTaskDiff with one row update — the field changes,
  // JSON.stringify differs, the diff effect fires. Without this the array
  // splice alone is invisible to the diff and the manual order is lost on
  // refresh (fetchTasks orders by `position` then `created_at`).
  // `computePosition` now lives in src/utils/position.js — shared with mobile.

  // Reorder a task within a specific date column to position `index` among
  // the cards currently visible in that column. Mirrors `reorderToInbox` but
  // for a YYYY-MM-DD column key.
  const reorderInDate = (taskId, dateKey, index) => {
    setTasks(prev => {
      const next = [...prev];
      const fromIdx = next.findIndex(t => t.id === taskId);
      if (fromIdx < 0) return prev;
      const moved = next[fromIdx];
      let oldParentId = null;
      if (moved.parentId) oldParentId = moved.parentId;
      next.splice(fromIdx, 1);
      const inCol = next.filter(t => t.date===dateKey && !t.done && !t.parentId && !t.archived && !t.snoozedUntil && !t.someday);
      const targetTask = inCol[index];
      const newPosition = computePosition(inCol[index - 1], targetTask);
      const newMoved = {...moved, date: dateKey, parentId: null, position: newPosition};
      let insertAt;
      if (!targetTask) {
        const last = inCol[inCol.length - 1];
        insertAt = last ? next.indexOf(last) + 1 : next.length;
      } else {
        insertAt = next.indexOf(targetTask);
      }
      next.splice(insertAt, 0, newMoved);
      if (oldParentId) {
        return next.map(t => t.id===oldParentId ? {...t, childOrder:(t.childOrder||[]).filter(cid=>cid!==taskId)} : t);
      }
      return next;
    });
  };

  // Reorder a task within the inbox to position `index` among current inbox tasks.
  // If task is from elsewhere (date, project), strip date/parent first.
  const reorderToInbox = (taskId, index) => {
    setTasks(prev => {
      const next = [...prev];
      const fromIdx = next.findIndex(t => t.id === taskId);
      if(fromIdx < 0) return prev;
      const moved = next[fromIdx];
      // If moved was a child, remove from former parent's childOrder.
      let parentPatch = null;
      if(moved.parentId) {
        parentPatch = moved.parentId;
      }
      next.splice(fromIdx, 1);
      // Compute insertion point: find the inbox task at `index` (post-removal) and insert before it.
      const inboxList = next.filter(t => !t.date && !t.done && !t.parentId && !t.archived);
      const targetTask = inboxList[index];
      const newPosition = computePosition(inboxList[index - 1], targetTask);
      const newMoved = {...moved, date:null, parentId:null, position: newPosition};
      let insertAt;
      if(!targetTask) {
        const lastInbox = inboxList[inboxList.length - 1];
        insertAt = lastInbox ? next.indexOf(lastInbox) + 1 : next.length;
      } else {
        insertAt = next.indexOf(targetTask);
      }
      next.splice(insertAt, 0, newMoved);
      if(parentPatch) {
        return next.map(t => t.id===parentPatch ? {...t, childOrder:(t.childOrder||[]).filter(cid=>cid!==taskId)} : t);
      }
      return next;
    });
  };

  // Multi-id variants of reorderInDate / reorderToInbox. When a multi-selected
  // card is dragged, every selected card moves together as a contiguous group
  // at the drop point, preserving their source-array order. `anchorId` is the
  // over-card's id; if it's part of `taskIds` (drop on self when the target is
  // also selected), we slide to the next non-moved card in the destination.
  const computeGroupPositions = (above, below, count) => {
    const A = above && Number.isFinite(above.position) ? above.position : null;
    const B = below && Number.isFinite(below.position) ? below.position : null;
    const out = [];
    if (A != null && B != null) {
      if (Math.abs(B - A) < 1e-9) {
        // Collapsed gap (neighbours share a position). Mirror computePosition's
        // single-card fallback: nudge above A by 0.5 + small per-item delta so
        // the drag at least produces a distinct, ordered position.
        for (let i = 0; i < count; i++) out.push(A + 0.5 + i * 1e-6);
      } else {
        const step = (B - A) / (count + 1);
        for (let i = 0; i < count; i++) out.push(A + step * (i + 1));
      }
    } else if (A != null) {
      for (let i = 0; i < count; i++) out.push(A + i + 1);
    } else if (B != null) {
      // Drop above B: every new position must be strictly < B. Place in
      // [B-count, B-1]. Previous formula `B - count + i + 1` produced B for the
      // last item, colliding with the card below.
      for (let i = 0; i < count; i++) out.push(B - count + i);
    } else {
      for (let i = 0; i < count; i++) out.push(i + 1);
    }
    return out;
  };

  // insertAfter=true means "drop after the anchor card" (cursor in the lower
  // half of the anchor, or below the last card). Without this branch, the
  // dnd-kit collision detection always picks the closest card as anchor and
  // we'd insert before it — so dropping below the last card in a column
  // landed second-to-last instead of last, which feels like a snap-back.
  const reorderManyInDate = (taskIds, dateKey, anchorId, insertAfter = false, extraPatch = null) => {
    if (!taskIds || !taskIds.length) return;
    setTasks(prev => {
      const idSet = new Set(taskIds);
      const movedOrdered = prev.filter(t => idSet.has(t.id));
      if (!movedOrdered.length) return prev;
      const remaining = prev.filter(t => !idSet.has(t.id));
      const inCol = remaining.filter(t => t.date===dateKey && !t.done && !t.parentId && !t.archived && !t.snoozedUntil && !t.someday);
      let anchorTask = anchorId ? inCol.find(t => t.id === anchorId) : null;
      // If anchor was itself selected (moved), slide to the next inCol member.
      if (!anchorTask && anchorId) {
        const anchorPrevIdx = prev.findIndex(t => t.id === anchorId);
        if (anchorPrevIdx >= 0) {
          for (const c of inCol) {
            if (prev.indexOf(c) > anchorPrevIdx) { anchorTask = c; break; }
          }
        }
      }
      // Slot index: where the moved card(s) will sit in the column. For an
      // "after" drop, advance one past the anchor — that may push us past the
      // last index, which legitimately means "drop at end" (below = null).
      let slotIdx = anchorTask ? inCol.indexOf(anchorTask) : inCol.length;
      if (anchorTask && insertAfter) slotIdx += 1;
      const above = slotIdx > 0 ? inCol[slotIdx - 1] : null;
      const below = slotIdx < inCol.length ? inCol[slotIdx] : null;
      const positions = computeGroupPositions(above, below, movedOrdered.length);
      const patched = movedOrdered.map((t, i) => ({...t, date: dateKey, parentId: null, position: positions[i], ...(extraPatch || {})}));
      // Array insert index mirrors the column slot.
      let insertAt;
      if (below) insertAt = remaining.indexOf(below);
      else if (above) insertAt = remaining.indexOf(above) + 1;
      else insertAt = remaining.length;
      const result = [...remaining];
      result.splice(insertAt, 0, ...patched);
      const parentIds = new Set(movedOrdered.filter(t => t.parentId).map(t => t.parentId));
      if (parentIds.size) {
        return result.map(t => parentIds.has(t.id)
          ? {...t, childOrder: (t.childOrder||[]).filter(cid => !idSet.has(cid))}
          : t);
      }
      return result;
    });
  };

  // Sibling of reorderManyInDate, but for Buckets: groups by groupId and
  // writes bucketPosition. Shares Timeline's computeGroupPositions interpolation
  // logic by passing { position } shims over the bucketPosition field, so the
  // same fractional-position math handles single-card and multi-card moves.
  // Pre-filter mirrors BucketsView's isTriageCandidate so the position math
  // ignores cards that aren't on the bucket board.
  const reorderManyInBucket = (taskIds, bucketId, anchorId, insertAfter = false, extraPatch = null) => {
    if (!taskIds || !taskIds.length) return;
    setTasks(prev => {
      const idSet = new Set(taskIds);
      const movedOrdered = prev.filter(t => idSet.has(t.id));
      if (!movedOrdered.length) return prev;
      const remaining = prev.filter(t => !idSet.has(t.id));
      const inCol = remaining.filter(t =>
        (t.groupId ?? null) === bucketId
        && !t.archived && !t.parentId
        && !t.snoozedUntil && !t.someday && !t.blocked
        && !t.delegatedTo && !t.checkInOf
        && !(t.recurrence && t.recurrence.isRoutine)
      ).sort((a, b) => {
        const pa = Number.isFinite(a.bucketPosition) ? a.bucketPosition : Infinity;
        const pb = Number.isFinite(b.bucketPosition) ? b.bucketPosition : Infinity;
        return pa - pb;
      });
      let anchorTask = anchorId ? inCol.find(t => t.id === anchorId) : null;
      if (!anchorTask && anchorId) {
        const anchorPrevIdx = prev.findIndex(t => t.id === anchorId);
        if (anchorPrevIdx >= 0) {
          for (const c of inCol) {
            if (prev.indexOf(c) > anchorPrevIdx) { anchorTask = c; break; }
          }
        }
      }
      let slotIdx = anchorTask ? inCol.indexOf(anchorTask) : inCol.length;
      if (anchorTask && insertAfter) slotIdx += 1;
      const above = slotIdx > 0 ? inCol[slotIdx - 1] : null;
      const below = slotIdx < inCol.length ? inCol[slotIdx] : null;
      // computeGroupPositions reads `.position` — shim the bucketPosition field.
      const aShim = above ? { position: above.bucketPosition } : null;
      const bShim = below ? { position: below.bucketPosition } : null;
      const positions = computeGroupPositions(aShim, bShim, movedOrdered.length);
      const patched = movedOrdered.map((t, i) => ({
        ...t,
        groupId: bucketId,
        bucketPosition: positions[i],
        ...(extraPatch || {}),
      }));
      let insertAt;
      if (below) insertAt = remaining.indexOf(below);
      else if (above) insertAt = remaining.indexOf(above) + 1;
      else insertAt = remaining.length;
      const result = [...remaining];
      result.splice(insertAt, 0, ...patched);
      return result;
    });
  };

  const reorderManyToInbox = (taskIds, anchorId, insertAfter = false) => {
    if (!taskIds || !taskIds.length) return;
    setTasks(prev => {
      const idSet = new Set(taskIds);
      const movedOrdered = prev.filter(t => idSet.has(t.id));
      if (!movedOrdered.length) return prev;
      const remaining = prev.filter(t => !idSet.has(t.id));
      const inbox = remaining.filter(t => !t.date && !t.done && !t.parentId && !t.archived);
      let anchorTask = anchorId ? inbox.find(t => t.id === anchorId) : null;
      if (!anchorTask && anchorId) {
        const anchorPrevIdx = prev.findIndex(t => t.id === anchorId);
        if (anchorPrevIdx >= 0) {
          for (const c of inbox) {
            if (prev.indexOf(c) > anchorPrevIdx) { anchorTask = c; break; }
          }
        }
      }
      let slotIdx = anchorTask ? inbox.indexOf(anchorTask) : inbox.length;
      if (anchorTask && insertAfter) slotIdx += 1;
      const above = slotIdx > 0 ? inbox[slotIdx - 1] : null;
      const below = slotIdx < inbox.length ? inbox[slotIdx] : null;
      const positions = computeGroupPositions(above, below, movedOrdered.length);
      const patched = movedOrdered.map((t, i) => ({...t, date: null, parentId: null, position: positions[i]}));
      let insertAt;
      if (below) insertAt = remaining.indexOf(below);
      else if (above) insertAt = remaining.indexOf(above) + 1;
      else insertAt = remaining.length;
      const result = [...remaining];
      result.splice(insertAt, 0, ...patched);
      const parentIds = new Set(movedOrdered.filter(t => t.parentId).map(t => t.parentId));
      if (parentIds.size) {
        return result.map(t => parentIds.has(t.id)
          ? {...t, childOrder: (t.childOrder||[]).filter(cid => !idSet.has(cid))}
          : t);
      }
      return result;
    });
  };

  // Snapshot the entire tasks array for atomic undo of multi-task ops.
  const pushSnapshotUndo = () => setUndoStack(s => [...s.slice(-9), {bulk:true, before:tasks}]);

  // ── dnd-kit unified drag handlers ──────────────────────────────────────
  // Sensors + start/end callbacks replace the four separate HTML5 implementations
  // (Stack, Timeline, Projects, Groups). Each draggable's data.current.kind
  // tells onDragEnd how to route.
  const dndSensors = useDndSensors();
  const dragPointerY = useRef(null);
  const dndOnDragStart = (event) => {
    haptics.pickup();
    const data = event.active.data.current || {};
    const srcId = String(event.active.id);
    // Capture the source card's HTML so the DragOverlay can render an identical
    // ghost — chips, priority bars, project progress, the whole thing — rather
    // than a stub with just the title.
    let srcHTML = null;
    let routineGhost = null;
    try {
      if (data.kind === 'routine-instance') {
        // Routine strip pills aren't cards — build a card-shaped ghost from
        // the task itself so the morph reads as pill → card during drag.
        const t = taskById(data.taskId);
        if (t) {
          routineGhost = { title: t.title, date: t.date, project: t.project };
        }
      } else {
        const el = document.querySelector(`[data-card-id="${srcId}"]`);
        if (el) {
          // Measure the source card so the destination gap is exactly its height.
          document.body.style.setProperty('--drag-card-h', el.offsetHeight + 'px');
          const clone = el.cloneNode(true);
          clone.removeAttribute('style');
          clone.classList.remove('is-dragging','dragging','focused','selected','spawning','card-drop-target');
          srcHTML = clone.outerHTML;
        }
      }
    } catch {}
    // fromCol mirrors the card's column for the §09 cross-column arming check.
    // null date → inbox; 'stack-task' source has no date so we fall back to inbox.
    // In Buckets view, the column key is `bk:<bucketId>` (or `bk:none` for the
    // No-bucket sidebar) so the same arming logic works without conflating
    // bucket ids with date strings.
    const fromCol = data.kind === 'bucket-task'
      ? `bk:${data.bucketId || 'none'}`
      : (data.date != null ? data.date : 'inbox');
    const altCopy = !!(event.activatorEvent?.altKey);
    // Multi-select count for the +n badge in the DragOverlay. Read once at
    // drag-start; subsequent selection changes shouldn't affect the in-flight
    // visual. selectedIds may include the active card itself.
    const multiCount = (selectedIds.has(srcId) && selectedIds.size > 1)
      ? selectedIds.size
      : 1;
    setActiveDrag({ id: srcId, kind: data.kind || 'task', fromCol, srcHTML, routineGhost, altCopy, multiCount });
    document.body.dataset.dndActive = 'true';
    document.body.dataset.fromCol = fromCol;
    // Pointer-Y tracker: keeps dragPointerY fresh between dndOnDragOver fires.
    // Also re-evaluates the drop-line direction on every mouse move so the
    // line updates smoothly as the cursor crosses a card's midpoint.
    const onPointer = (e) => {
      dragPointerY.current = e.clientY;
      // Refresh drop-line on the current over-card based on cursor position.
      const lined = document.querySelector('[data-drop-line]');
      if (lined) {
        const r = lined.getBoundingClientRect();
        const dir = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
        if (lined.getAttribute('data-drop-line') !== dir) lined.setAttribute('data-drop-line', dir);
      }
    };
    window.addEventListener('pointermove', onPointer);
    dragPointerY._cleanup = () => window.removeEventListener('pointermove', onPointer);
  };
  // Track the column the cursor is currently over so we can arm it. dnd-kit's
  // collision detection resolves over→card when the column has cards in it,
  // so the column-level droppable's `isOver` is false in that case. We climb
  // back up via the card's own data.current.date and toggle .col-armed on the
  // matching wrapper. Skip arming when the over-column is the source column
  // (within-column reorder doesn't need cross-column highlight).
  //
  // Also: stamp data-drop-line="before"/"after" on the card under the cursor
  // so the destination shows a clear insertion line between cards. dnd-kit's
  // per-column SortableContext doesn't auto-render a placeholder in the
  // destination during cross-column drags; this fills that gap.
  const dndOnDragOver = (event) => {
    const aData = event.active?.data?.current || {};
    const oData = event.over?.data?.current;
    let overCol = null;
    if (oData) {
      if (oData.kind === 'task' || oData.kind === 'stack-task' || oData.kind === 'completed-task') overCol = oData.date != null ? oData.date : 'inbox';
      else if (oData.kind === 'column') overCol = oData.date != null ? oData.date : 'inbox';
      else if (oData.kind === 'bucket-col') overCol = `bk:${oData.bucketId || 'none'}`;
      else if (oData.kind === 'bucket-task') overCol = `bk:${oData.bucketId || 'none'}`;
      else if (oData.kind === 'bucket-column-target') overCol = `bk:${oData.bucketId || 'none'}`;
    }
    const fromCol = document.body.dataset.fromCol;
    // Clear all current armed wrappers first
    document.querySelectorAll('.col-armed').forEach(el => el.classList.remove('col-armed'));
    if (overCol && overCol !== fromCol) {
      document.body.dataset.armedCol = overCol;
      let sel;
      if (overCol === 'inbox') {
        sel = '.side-panel.inbox-col[data-col-key="inbox"]';
      } else if (overCol.startsWith('bk:')) {
        // Bucket columns carry data-bucket-col-key="<bucketId|none>"; the
        // No-bucket sidebar uses the same attribute on its .side-panel wrapper.
        const bk = overCol.slice(3);
        sel = `[data-bucket-col-key="${CSS.escape(bk)}"]`;
      } else {
        sel = `.col[data-col-key="${CSS.escape(overCol)}"]`;
      }
      document.querySelector(sel)?.classList.add('col-armed');
    } else {
      delete document.body.dataset.armedCol;
    }
    // Drop-line on the over-card. Stamp ONLY for cross-context drops — when
    // source and target sit in the same SortableContext, dnd-kit's
    // verticalListSortingStrategy already shifts siblings via transform to
    // open a slot. Adding the manual margin-based gap on top of that
    // double-shifts the over-card's bounding box mid-animation, which makes
    // the cursor's collision target oscillate to a neighbour and back at
    // 60Hz (the Stack flicker reported by the user).
    document.querySelectorAll('[data-drop-line]').forEach(el => el.removeAttribute('data-drop-line'));
    if (!oData) return;
    if (oData.kind !== 'task' && oData.kind !== 'stack-task' && oData.kind !== 'bucket-task') return;

    let sameContext = false;
    if (aData.kind === 'stack-task' && oData.kind === 'stack-task') {
      sameContext = true; // single SortableContext for the entire Stack
    } else if (aData.kind === 'bucket-task' && oData.kind === 'bucket-task') {
      // Buckets: each column is its own vertical SortableContext keyed by
      // bucketId (null/undefined = the No-bucket sidebar). Same-context drops
      // (within the column) animate via sortable transforms; cross-column drops
      // get the manual drop-line stamp below.
      const aBk = aData.bucketId ?? null;
      const oBk = oData.bucketId ?? null;
      sameContext = aBk === oBk;
    } else if (aData.kind === 'task' && oData.kind === 'task') {
      // Task SortableContext is now per-group within a column (Column.jsx /
      // InboxCol). Same-context drops are only those in the same date+parent
      // AND same group; cross-group drops within the same column need the
      // manual drop-line gap because dnd-kit doesn't shift cards across
      // separate SortableContexts.
      const aDate = aData.date == null ? null : aData.date;
      const oDate = oData.date == null ? null : oData.date;
      const aParent = aData.parentId || null;
      const oParent = oData.parentId || null;
      const aGrp = aData.grpKey || null;
      const oGrp = oData.grpKey || null;
      sameContext = aDate === oDate && aParent === oParent && aGrp === oGrp;
    }
    if (sameContext) return;

    const overEl = document.querySelector(`[data-card-id="${CSS.escape(String(event.over.id))}"]`);
    const y = dragPointerY.current;
    if (overEl && y != null) {
      const r = overEl.getBoundingClientRect();
      const dir = y < r.top + r.height / 2 ? 'before' : 'after';
      overEl.setAttribute('data-drop-line', dir);
    }
  };
  const dndOnDragEnd = (event) => {
    const { active, over } = event;
    const aData = active.data.current || {};
    const oData = over?.data.current || {};
    const activeId = String(active.id);
    try {
      if (!over) return;
      haptics.drop();

      // ── Buckets view ────────────────────────────────────────────────────
      // Card → bucket column or No-bucket sidebar. `bucket-col` is the body
      // droppable; `bucket-task` is a card in the destination column (drop
      // resolves to its insertion slot); `bucket-column-handle` is the column
      // wrapper itself (only reached if collision detection routes there — we
      // treat it as a drop on that bucket's body).
      if (aData.kind === 'bucket-task') {
        // Header (bucket-column-target) can also be reached if the cursor sits
        // on the column header during a card drag — treat it the same as a
        // bucket-col body drop (top of that column).
        if (oData.kind !== 'bucket-task' && oData.kind !== 'bucket-col' && oData.kind !== 'bucket-column-target') return;
        const toBucketId = oData.bucketId ?? null; // null = sidebar (clear bucket)
        const fromBucketId = aData.bucketId ?? null;
        const sortMode = tweaks.bucketsSort || 'manual';
        // Multi-select fan-out: every selected card moves with the dragged one.
        const srcIds = (selectedIds.has(activeId) && selectedIds.size > 1)
          ? [...selectedIds].filter(id => taskById(id))
          : [activeId];
        // Anchor + cursor-Y vs midpoint — exactly Timeline's pattern.
        const anchorId = oData.kind === 'bucket-task' ? String(over.id) : null;
        let insertAfter = false;
        if (anchorId) {
          const anchorEl = document.querySelector(`.card[data-card-id="${anchorId}"]`);
          const y = dragPointerY.current;
          if (anchorEl && y != null) {
            const r = anchorEl.getBoundingClientRect();
            insertAfter = y >= r.top + r.height / 2;
          }
        }
        pushSnapshotUndo();
        if (toBucketId === null) {
          // Drop on the No-bucket sidebar — clear groupId + bucketPosition so a
          // re-bucket later doesn't carry a stale slot.
          setTasks(prev => prev.map(t => srcIds.includes(t.id)
            ? applyTaskPatch(t, { groupId: null, bucketPosition: null })
            : t));
        } else {
          reorderManyInBucket(srcIds, toBucketId, anchorId, insertAfter);
        }
        // Within-column drag while a non-manual sort is active: silently flip
        // back to Manual so the new ordering is visible.
        if (sortMode !== 'manual' && fromBucketId === toBucketId) {
          setTweak('bucketsSort', 'manual');
        }
        // Toast + undo.
        const bucketName = (tweaks.customGroups || []).find(g => g.id === toBucketId)?.name;
        const n = srcIds.length;
        let msg;
        if (toBucketId === null) {
          msg = n > 1 ? `Cleared bucket on ${n} cards` : 'Cleared bucket';
        } else if (fromBucketId === toBucketId) {
          msg = n > 1 ? `Reordered ${n} cards` : 'Reordered';
        } else {
          msg = n > 1
            ? `Moved ${n} cards to ${bucketName || 'bucket'}`
            : `Moved to ${bucketName || 'bucket'}`;
        }
        showToast(msg, { undoable: true, timeout: 4500 });
        return;
      }

      // Bucket column reorder. Grip (kind='bucket-column-handle') dropped on a
      // column header (kind='bucket-column-target'). Reorders tweaks.customGroups.
      if (aData.kind === 'bucket-column-handle' && oData.kind === 'bucket-column-target') {
        const fromId = aData.bucketId;
        const toId = oData.bucketId;
        if (!fromId || !toId || fromId === toId) return;
        const order = (tweaks.customGroups || []).map(g => g.id);
        const fromIdx = order.indexOf(fromId);
        const toIdx = order.indexOf(toId);
        if (fromIdx < 0 || toIdx < 0) return;
        const nextIds = arrayMove(order, fromIdx, toIdx);
        const byId = new Map((tweaks.customGroups || []).map(g => [g.id, g]));
        const nextGroups = nextIds.map(id => byId.get(id)).filter(Boolean);
        setTweak('customGroups', nextGroups);
        return;
      }

      // Routine strip pill dragged out of the strip.
      // - Drop on a column (body, strip, task, or completed-task) →
      //   reschedule: keep recurrence, change date to that day. Refuse if
      //   target already has a sibling of same series, target date is in
      //   the past, or target is the same day.
      // - Drop on inbox column → ignored (unscheduling a routine doesn't
      //   make sense; the drawer's None preset is the way to stop a series).
      // Filter-aware: if active filter would hide the resulting card on the
      // target column, the drop still succeeds (Q3-B) and a toast surfaces
      // with an Undo affordance.
      // Regular card dropped onto a column's routines strip → mark the task
      // as a "pending routine" (isRoutine=true + new recurrenceId, no freq
      // yet) so it shows up immediately in the strip as a single instance.
      // extendRoutineHorizon skips series with no freq (nextOccurrence
      // returns null), so no phantom future instances spawn until the user
      // picks a cadence in the drawer. Repeats row opens emphasized purple.
      // If the user picks a preset → horizon kicks in and future spawns. If
      // they close the drawer without picking → the task stays in the strip
      // as a pending routine; they can finish later or click None to demote.
      // Tasks already in a routine series are no-op.
      if (aData.kind === 'task' && oData.kind === 'routine-strip') {
        const targetDate = oData.date;
        if (!targetDate) return;
        const t = taskById(activeId);
        if (!t || t.recurrence?.isRoutine) return;
        pushSnapshotUndo();
        const pendingRec = { recurrenceId: mkRecurrenceId(), isRoutine: true };
        setTasks(prev => prev.map(x => x.id === t.id
          ? syncTaskSnooze({
              ...x,
              date: targetDate,
              recurrence: pendingRec,
              activity: [...(x.activity||[]), { type: 'queued-for-routine', at: new Date().toISOString() }],
            })
          : x
        ));
        setDrawerId(t.id);
        setFocusedId(t.id);
        setDrawerInitialFocus('recurrence');
        showToast(`Pick a cadence to make "${t.title}" a routine`, { undoable: true });
        return;
      }

      if (aData.kind === 'routine-instance') {
        const taskId = aData.taskId || activeId.replace(/^routine:/, '');
        const task = taskById(taskId);
        if (!task) return;
        let targetDate = null;
        if (oData.kind === 'routine-strip') {
          targetDate = oData.date;
        } else if (oData.kind === 'column') {
          targetDate = oData.date === undefined ? null : oData.date;
        } else if (oData.kind === 'task' || oData.kind === 'completed-task' || oData.kind === 'stack-task') {
          const overTask = taskById(String(over.id));
          targetDate = oData.date === undefined ? (overTask?.date || null) : oData.date;
        } else {
          return;
        }
        // Reschedule — keep recurrence, change date. Refuse same-day,
        // past-day, duplicate-sibling, or inbox (no date).
        if (!targetDate || targetDate === task.date) return;
        const todayStr = D.str(D.today());
        if (targetDate < todayStr) {
          showToast('Can’t reschedule a routine to a past day', { timeout: 1800 });
          return;
        }
        const conflict = tasks.some(t =>
          t.id !== task.id &&
          t.recurrence?.recurrenceId === task.recurrence?.recurrenceId &&
          t.date === targetDate &&
          !t.archived);
        if (conflict) {
          showToast(`${task.title}: already an instance on that day`, { timeout: 1800 });
          return;
        }
        pushSnapshotUndo();
        setTasks(prev => prev.map(t => t.id === task.id ? syncTaskSnooze({ ...t, date: targetDate }) : t));
        // Filter-aware toast (Q3-B): warn if filters would hide the rescheduled card.
        const wouldBeFiltered = !taskOwnFilters({ ...task, date: targetDate });
        if (wouldBeFiltered) {
          showToast(`Routine moved to ${targetDate} — clear filters to see it`, { undoable: true });
        } else {
          showToast(`Routine moved to ${targetDate}`, { undoable: true });
        }
        return;
      }

      // Stack reorder — both source and target are stack tasks.
      // Multi-select: when the dragged card is part of a multi-selection, every
      // selected stack card moves as a contiguous group at the drop point,
      // preserving sortable order. Matches arrayMove semantics for direction:
      // dragging downward inserts after the target, upward inserts before.
      if (aData.kind === 'stack-task' && oData.kind === 'stack-task') {
        const ids = aData.sortableIds || [];
        const fromIdx = ids.indexOf(activeId);
        const toIdx = ids.indexOf(String(over.id));
        if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
          const srcSet = (selectedIds.has(activeId) && selectedIds.size > 1)
            ? new Set(ids.filter(id => selectedIds.has(id)))
            : new Set([activeId]);
          const srcIds = ids.filter(id => srcSet.has(id));
          let next;
          if (srcIds.length === 1) {
            next = arrayMove(ids, fromIdx, toIdx);
          } else {
            const remaining = ids.filter(id => !srcSet.has(id));
            const targetId = String(over.id);
            let insertAt;
            if (srcSet.has(targetId)) {
              // Target is also selected — slide to next non-moved id at or after toIdx.
              let anchor = null;
              for (let i = toIdx + 1; i < ids.length; i++) {
                if (!srcSet.has(ids[i])) { anchor = ids[i]; break; }
              }
              insertAt = anchor ? remaining.indexOf(anchor) : remaining.length;
            } else {
              insertAt = remaining.indexOf(targetId);
              if (toIdx > fromIdx) insertAt += 1; // downward: insert after target
            }
            next = [...remaining.slice(0, insertAt), ...srcIds, ...remaining.slice(insertAt)];
          }
          setTweak('stackOrder', next);
          const stackSort = tweaks.stackSort;
          if (stackSort && stackSort !== 'manual') setTweak('stackSort', 'manual');
          // Group reconcile: the dragged card adopts the target's groupId (or null
          // if target is ungrouped). Apply to every moved card so the whole
          // selection joins/leaves the group together.
          const targetTask = taskById(String(over.id));
          const draggedTask = taskById(activeId);
          if (draggedTask && targetTask) {
            const validGid = new Set((tweaks?.customGroups || []).map(g => g.id));
            const tg = targetTask.groupId && validGid.has(targetTask.groupId) ? targetTask.groupId : null;
            const dg = draggedTask.groupId && validGid.has(draggedTask.groupId) ? draggedTask.groupId : null;
            if (tg !== dg) {
              if (srcIds.length === 1) {
                updateTask(activeId, { groupId: tg });
              } else {
                setTasks(prev => prev.map(t => srcSet.has(t.id) ? {...t, groupId: tg} : t));
              }
            }
          }
        }
        return;
      }

      // Completed task dragged out of a day's Completed section → reopen + move.
      // Restricted to today or a future date (past targets are no-ops; the
      // Completed view itself isn't a meaningful destination).
      if (aData.kind === 'completed-task') {
        let targetDate;
        if (oData.kind === 'task' || oData.kind === 'completed-task') {
          const overTask = taskById(String(over.id));
          targetDate = oData.date === undefined ? (overTask?.date || null) : oData.date;
        } else if (oData.kind === 'column') {
          targetDate = oData.date === undefined ? null : oData.date;
        } else {
          return;
        }
        if (!targetDate || D.isPast(targetDate)) return;
        const srcIds = (selectedIds.has(activeId) && selectedIds.size > 1)
          ? [...selectedIds].filter(id => taskById(id)?.done)
          : [activeId];
        if (!srcIds.length) return;
        // Anchor only meaningful when dropping onto an active task in the
        // destination column. Dropping onto another completed card (or empty
        // column body) appends at the end of the destination's active list.
        const anchorId = oData.kind === 'task' ? String(over.id) : null;
        let insertAfter = false;
        if (anchorId) {
          const anchorEl = document.querySelector(`.card[data-card-id="${anchorId}"]`);
          const y = dragPointerY.current;
          if (anchorEl && y != null) {
            const r = anchorEl.getBoundingClientRect();
            insertAfter = y >= r.top + r.height / 2;
          }
        }
        pushSnapshotUndo();
        reorderManyInDate(srcIds, targetDate, anchorId, insertAfter, { done: false, completedAt: null });
        setToast(srcIds.length > 1 ? `Reopened ${srcIds.length}` : 'Reopened');
        setTimeout(()=>setToast(null), 1400);
        return;
      }

      // Timeline / Inbox / Project reorder + cross-column move.
      if (aData.kind === 'task') {
        // Drop on a project body — only reached when compositeCollisionDetection
        // routed to the body itself (cursor in top/bottom 8px edge zone, or an
        // empty body). The middle of the body resolves to a subtask, handled
        // in the oData.kind === 'task' branch below.
        if (oData.kind === 'project-body') {
          const srcIds = selectedIds.has(activeId) && selectedIds.size > 1 ? [...selectedIds] : [activeId];
          // Cursor-Y in body's top 8px → nest as first child. Otherwise append.
          const bodyEl = document.querySelector(`.card[data-card-id="${oData.targetId}"] .card-project-body`);
          let dropIndex;
          if (bodyEl && dragPointerY.current != null) {
            const r = bodyEl.getBoundingClientRect();
            if (dragPointerY.current - r.top <= 8) dropIndex = 0;
          }
          handleCardDrop(srcIds, oData.targetId, dropIndex);
          return;
        }
        // Drop on a custom-group box → join group, optionally move date.
        if (oData.kind === 'group-target') {
          const srcIds = selectedIds.has(activeId) && selectedIds.size > 1 ? [...selectedIds] : [activeId];
          const newDate = oData.colKey === 'inbox' ? null : oData.colKey;
          pushSnapshotUndo();
          setTasks(prev => {
            const idSet = new Set(srcIds);
            return prev.map(t => {
              if (idSet.has(t.id)) {
                const patch = { groupId: oData.groupId, parentId: null };
                if (newDate !== undefined) patch.date = newDate;
                return applyTaskPatch(t, patch);
              }
              if ((t.childOrder || []).some(id => idSet.has(id))) {
                return { ...t, childOrder: t.childOrder.filter(id => !idSet.has(id)) };
              }
              return t;
            });
          });
          return;
        }
        // Drop on another task in the same parent (or same date column) → reorder.
        // Drop on a task in a different column → cross-column move at that index.
        // Drop on column body → drop at end of that column.
        const aDate = aData.date === undefined ? null : aData.date;
        let targetDate = aDate;
        if (oData.kind === 'task') {
          const overTask = taskById(String(over.id));
          if (overTask) {
            // Positional subtask drop: cursor over a subtask → nest at that
            // subtask's slot, before/after based on cursor-Y vs midpoint
            // (read from data-drop-line stamped in dndOnDragOver).
            if (overTask.parentId) {
              const parent = taskById(overTask.parentId);
              const srcIds = selectedIds.has(activeId) && selectedIds.size > 1 ? [...selectedIds] : [activeId];
              if (parent) {
                const order = parent.childOrder || [];
                const idx = order.indexOf(overTask.id);
                const overEl = document.querySelector(`.card[data-card-id="${overTask.id}"]`);
                const dir = overEl?.getAttribute('data-drop-line') || 'before';
                const dropIndex = idx >= 0 ? idx + (dir === 'after' ? 1 : 0) : undefined;
                // Pass parent.id (not overTask.id) so handleCardDrop's
                // child→parent re-route doesn't clobber our before/after index
                // (it would overwrite with `idx`, i.e. always insert-before).
                handleCardDrop(srcIds, parent.id, dropIndex);
                return;
              }
              handleCardDrop(srcIds, overTask.id);
              return;
            }
            targetDate = oData.date === undefined ? overTask.date || null : oData.date;
          }
          // Anchor for multi-id reorder is over.id (set below). reorderMany*
          // resolves anchor post-removal even when the anchor was itself selected.
        } else if (oData.kind === 'column') {
          targetDate = oData.date === undefined ? null : oData.date;
        }
        // Multi-select fan-out: every selected card moves with the dragged
        // card. Cards keep their source-array order at the drop point.
        const srcIds = (selectedIds.has(activeId) && selectedIds.size > 1)
          ? [...selectedIds]
          : [activeId];
        const anchorId = oData.kind === 'task' ? String(over.id) : null;
        // Determine drop direction (before/after anchor) from the cursor's
        // actual Y position vs the anchor card's vertical midpoint. This is
        // the universal signal — works for both cross-context drops (which
        // dndOnDragOver stamps via data-drop-line) and same-context drops
        // (which it intentionally skips to avoid fighting sortable's CSS
        // transforms). dragPointerY.current is kept fresh by the pointermove
        // listener installed in dndOnDragStart, so it reflects the final
        // drop position even when dndOnDragOver hasn't refreshed yet.
        let insertAfter = false;
        if (anchorId) {
          const anchorEl = document.querySelector(`.card[data-card-id="${anchorId}"]`);
          const y = dragPointerY.current;
          if (anchorEl && y != null) {
            const r = anchorEl.getBoundingClientRect();
            insertAfter = y >= r.top + r.height / 2;
          }
        }
        // Cross-group patch: when a card is dropped into a different group in
        // the same date column, update the group-determining attribute so the
        // card visually lands in the target group. Without this, the card stays
        // in its source group (its project/priority field is unchanged) and
        // appears to snap back even though the array splice was correct.
        const aGrpKey = aData.grpKey || null;
        const oGrpKey = oData.grpKey || null;
        let crossGroupPatch = null;
        if (targetDate !== null && anchorId && aGrpKey && oGrpKey && aGrpKey !== oGrpKey && !oGrpKey.startsWith('__cg__')) {
          if (globalGroupBy === 'project') {
            crossGroupPatch = { project: oGrpKey === '_none' ? null : oGrpKey };
          } else if (globalGroupBy === 'priority') {
            crossGroupPatch = { priority: oGrpKey };
          }
        }
        // Alt+drag: copy to destination, leave originals at source.
        if (activeDrag?.altCopy) {
          const snapshots = srcIds.map(id => taskById(id)).filter(Boolean);
          pushSnapshotUndo();
          if (targetDate == null) {
            reorderManyToInbox(srcIds, anchorId, insertAfter);
          } else {
            reorderManyInDate(srcIds, targetDate, anchorId, insertAfter, crossGroupPatch);
          }
          // Re-add originals at their source positions (new IDs = fresh copies left behind).
          setTasks(prev => [
            ...prev,
            ...snapshots.map(t => ({
              ...t,
              id: mkid(),
              createdAt: new Date().toISOString(),
              activity: [...(t.activity || []), { type: 'copied', at: new Date().toISOString() }],
            })),
          ]);
          showToast(snapshots.length > 1 ? `Copied ${snapshots.length} tasks` : 'Copied task');
          return;
        }
        if (targetDate == null) {
          reorderManyToInbox(srcIds, anchorId, insertAfter);
        } else {
          // Detect drag-into-past BEFORE reorder so we read pre-move task state.
          // Skip projects with open kids — completeTask would pop a confirm modal mid-drag.
          const past = D.isPast(targetDate);
          reorderManyInDate(srcIds, targetDate, anchorId, insertAfter, crossGroupPatch);
          if (past) {
            for (const id of srcIds) {
              const t = taskById(id);
              if (!t || t.done) continue;
              const hasOpenKids = t.cardType === 'project' && tasks.some(c => c.parentId === id && !c.done);
              if (hasOpenKids) continue;
              completeTask(id, targetDate);
            }
            setCompletedOpen(s => new Set([...s, targetDate]));
          }
        }
        return;
      }
    } finally {
      dndCleanupAfterDrag();
    }
  };
  const dndOnDragCancel = () => { dndCleanupAfterDrag(); };
  // Shared post-drag cleanup. Used by both the success path (finally block in
  // dndOnDragEnd) and the cancel path. The cancel branch previously cleared
  // only activeDrag and dndActive, which leaked the pointermove listener and
  // left stale .col-armed / [data-drop-line] / --drag-card-h after every Esc.
  const dndCleanupAfterDrag = () => {
    setActiveDrag(null);
    delete document.body.dataset.dndActive;
    delete document.body.dataset.armedCol;
    delete document.body.dataset.fromCol;
    document.body.style.removeProperty('--drag-card-h');
    document.querySelectorAll('.col-armed').forEach(el => el.classList.remove('col-armed'));
    document.querySelectorAll('[data-drop-line]').forEach(el => el.removeAttribute('data-drop-line'));
    dragPointerY._cleanup?.();
    dragPointerY._cleanup = null;
    dragPointerY.current = null;
  };

  // The big one: drop a set of source cards onto a target card.
  // - If target is already a child: re-route to its parent.
  // - If target is a project: nest sources at dropIndex.
  // - Else: promote target to project, then nest sources.
  // Skips sources that are themselves projects (toast + continue).
  const handleCardDrop = (sourceIds, targetId, dropIndex) => {
    if(!sourceIds.length) return;
    let target = taskById(targetId); if(!target) return;
    // Re-route drop on a child to its parent. Use the child's index as the drop position.
    if(target.parentId) {
      const parent = taskById(target.parentId);
      if(parent) {
        const order = parent.childOrder || [];
        const idx = order.indexOf(target.id);
        dropIndex = idx >= 0 ? idx : undefined;
        target = parent;
      }
    }
    const sources = sourceIds.map(taskById).filter(Boolean).filter(s => s.id !== target.id);
    if(!sources.length) return;
    const blocked = sources.filter(s => s.cardType === 'project');
    // movable = anything that's not itself a project. Includes sources already in the target
    // (those are handled as a reorder via dropIndex), and sources from elsewhere (re-parent).
    const movable = sources.filter(s => s.cardType !== 'project');
    if(blocked.length) {
      setToast("Projects can't be nested");
      setTimeout(()=>setToast(null), 1600);
    }
    if(!movable.length) return;
    pushSnapshotUndo();
    setTasks(prev => {
      let next = prev.map(t => ({...t}));
      const byId = new Map(next.map(t=>[t.id,t]));
      let tgt = byId.get(target.id);
      // Promote target if it's a regular task and is receiving children.
      const willReceive = movable.some(s => s.parentId !== tgt.id || tgt.cardType==='project');
      if(tgt.cardType !== 'project' && willReceive) {
        tgt.cardType = 'project';
        tgt.childOrder = tgt.childOrder || [];
      }
      const movableIds = movable.map(s=>s.id);
      movable.forEach(s => {
        const src = byId.get(s.id);
        if(src.parentId && src.parentId !== tgt.id) {
          const oldParent = byId.get(src.parentId);
          if(oldParent) oldParent.childOrder = (oldParent.childOrder||[]).filter(id => id !== src.id);
        }
        src.parentId = tgt.id;
        src.date = null;
      });
      // Remove movable ids from target's childOrder, then re-insert at dropIndex (or append).
      let order = (tgt.childOrder||[]).filter(id => !movableIds.includes(id));
      if(typeof dropIndex === 'number' && dropIndex >= 0 && dropIndex <= order.length) {
        order = [...order.slice(0, dropIndex), ...movableIds, ...order.slice(dropIndex)];
      } else {
        order = [...order, ...movableIds];
      }
      tgt.childOrder = order;
      return next;
    });
  };

  const onToggleProject = (id) => setCollapsedProjects(prev => {
    const ns = new Set(prev);
    ns.has(id) ? ns.delete(id) : ns.add(id);
    return ns;
  });

  // focused card helpers
  const getFocusedColIdx = () => {
    if(!focusedId) return -1;
    const task=taskById(focusedId); if(!task) return -1;
    const colKey=task.date||'inbox';
    return visColKeys.indexOf(colKey);
  };
  const getColTasks = (colKey) => tasksForCol(colKey);
  const moveFocusInCol = (dir) => {
    if(!focusedId){ if(visColKeys.length) { const ts=getColTasks(visColKeys[0]); if(ts.length) setFocusedId(ts[0].id); } return; }
    const task=taskById(focusedId); if(!task) return;
    const colKey=task.date||'inbox';
    const colTasks=getColTasks(colKey);
    const idx=colTasks.findIndex(t=>t.id===focusedId);
    const next=colTasks[idx+dir]; if(next) setFocusedId(next.id);
  };
  // Stack/List views render a flat sequence of cards; j/k walks the visible DOM order.
  const moveFocusInFlat = (dir) => {
    const els = Array.from(document.querySelectorAll('[data-card-id], [data-list-id]'))
      .filter(el => el.offsetParent !== null);
    const idOf = el => el.getAttribute('data-card-id') || el.getAttribute('data-list-id');
    if(!els.length) return;
    if(!focusedId){ setFocusedId(idOf(dir>0 ? els[0] : els[els.length-1])); return; }
    const idx = els.findIndex(el => idOf(el) === focusedId);
    if(idx < 0){ setFocusedId(idOf(els[0])); return; }
    const next = els[idx + dir];
    if(next) setFocusedId(idOf(next));
  };
  const moveFocusToCol = (dir) => {
    const ci=getFocusedColIdx();
    const ni=ci<0?0:Math.max(0,Math.min(visColKeys.length-1,ci+dir));
    const ts=getColTasks(visColKeys[ni]);
    if(ts.length) setFocusedId(ts[0].id); else setFocusedId(null);
  };

  // keyboard
  useEffect(()=>{
    const fn=e=>{
      const inInput=['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);
      if((e.metaKey||e.ctrlKey)&&e.key==='k'){ e.preventDefault(); setPalette(p=>!p); return; }
      if((e.metaKey||e.ctrlKey)&&e.key===' '){ e.preventDefault(); setQuickEntry(q=>!q); return; }
      if((e.metaKey||e.ctrlKey)&&e.key==='\\'){ e.preventDefault(); setNavCollapsed(n=>!n); return; }
      if((e.metaKey||e.ctrlKey)&&(e.key==='z'||e.key==='Z')){ e.preventDefault(); undo(); return; }
      if(e.key==='Escape'){ setRenamingId(null); setDrawerId(null); setSettingsOpen(false); setFocusedId(null); setPalette(false); setShortcuts(false); setQuickEntry(false); setAddModal(null); setFilterOpen(false); clearSelection(); if (tweaks.calendarOpen) setTweak('calendarOpen', false); return; }
      if(inInput) return;
      if(e.key==='?'){ setShortcuts(s=>!s); return; }
      const flatNav = view==='stack' || view==='list' || view==='inbox' || view==='upcoming' || view==='backlog' || view==='snoozed' || view==='recently-woken' || view==='someday' || view==='blocked' || view==='completed' || view==='archived' || view?.type==='project' || view?.type==='tag' || view?.type==='lifeArea';
      if(e.key==='j'||e.key==='J'){ flatNav ? moveFocusInFlat(1) : moveFocusInCol(1); }
      if(e.key==='k'||e.key==='K'){ flatNav ? moveFocusInFlat(-1) : moveFocusInCol(-1); }
      if(e.key==='ArrowRight'){ if(!flatNav) moveFocusToCol(1); else moveFocusInFlat(1); }
      if(e.key==='ArrowLeft'){ if(!flatNav) moveFocusToCol(-1); else moveFocusInFlat(-1); }
      // x = schedule into today's calendar (bulk-aware via selectedIds).
      if((e.key==='x'||e.key==='X') && (focusedId || selectedIds.size)) {
        const ids = selectedIds.size > 1 ? [...selectedIds] : (focusedId ? [focusedId] : []);
        if (ids.length) scheduleTasksToday(ids);
      }
      // d = complete (bulk-aware). Plain d/D only; Shift+D opens the date picker below.
      if((e.key==='d'||e.key==='D') && !e.shiftKey && (focusedId || selectedIds.size)) {
        const ids = selectedIds.size > 1 ? [...selectedIds] : (focusedId ? [focusedId] : []);
        for (const id of ids) {
          const t = taskById(id);
          if (t) completeTask(t.id, t.date || 'inbox');
        }
      }
      if((e.key==='e'||e.key==='E')&&focusedId){ e.preventDefault(); setDrawerId(null); setSettingsOpen(false); setRenamingId(focusedId); }
      if(e.key==='Enter'&&focusedId&&!drawerId){ setSettingsOpen(false); setRenamingId(null); setDrawerId(focusedId); }
      if(e.key==='n'||e.key==='N'){ if(view==='stack'||view==='list'){ addTask('inbox',null,'Untitled'); } else { const ci=getFocusedColIdx(); const ck=visColKeys[ci<0?1:ci]||visColKeys[1]; const date=ck&&ck!=='inbox'?D.parse(ck):null; addTask(ck||'inbox',date,'Untitled'); } }
      if(e.key==='a'||e.key==='A'){
        e.preventDefault();
        const t = focusedId ? taskById(focusedId) : null;
        if(t){
          if(t.parentId){
            addTask('inbox', null, 'Untitled', {parentId: t.parentId, afterId: t.id});
          } else {
            const ck = (view==='stack'||view==='list') ? 'inbox' : (t.date || 'inbox');
            const date = ck!=='inbox' ? D.parse(ck) : null;
            addTask(ck, date, 'Untitled', {afterId: t.id});
          }
        } else {
          const ci=getFocusedColIdx(); const ck=visColKeys[ci<0?1:ci]||visColKeys[1]; const date=ck&&ck!=='inbox'?D.parse(ck):null; addTask(ck||'inbox',date,'Untitled');
        }
      }
      if((e.key==='c'||e.key==='C')&&focusedId){ e.preventDefault(); archiveTask(focusedId); }
      if(e.key==='G' && e.shiftKey && focusedId) {
        e.preventDefault();
        const t = taskById(focusedId);
        if(!t) { /* noop */ }
        else if(t.parentId) { setToast("Already inside a project"); setTimeout(()=>setToast(null),1400); }
        else if(t.cardType==='project') updateTask(t.id,{cardType:'task'});
        else updateTask(t.id,{cardType:'project'});
      }
      if(e.key==='t'||e.key==='T') resetTimelineToToday();
      if(e.key==='l'||e.key==='L') setTheme(t=>t==='dark'?'light':'dark');
      if(e.key==='w'||e.key==='W') setShowWknd(s=>!s);
      if((e.key==='z'||e.key==='Z')&&focusedId){ const t=taskById(focusedId); if(t) updateTask(t.id,{someday:!t.someday}); }
      if(e.key==='1'&&focusedId) updateTask(focusedId,{priority:'p1',pri:'p1'});
      if(e.key==='2'&&focusedId) updateTask(focusedId,{priority:'p2',pri:'p2'});
      if(e.key==='3'&&focusedId) updateTask(focusedId,{priority:'p3',pri:'p3'});
      if(e.key==='['&&focusedId) moveTaskDay(focusedId,-1);
      if(e.key===']'&&focusedId) moveTaskDay(focusedId,1);
      if(e.key==='d'||e.key==='D'){ if(focusedId) duplicateTask(focusedId); }
      if(e.key==='B' && e.shiftKey && selectedIds.size>0){
        e.preventDefault();
        pushSnapshotUndo();
        const ids = [...selectedIds];
        ids.forEach(id => { const t = taskMap.get(id); if (!t) return; t.blocked ? clearBlocked(id,{noUndo:true}) : setBlocked(id,{noUndo:true}); });
        setToast(`${ids.length} toggled`); setTimeout(()=>setToast(null),1400);
      } else if((e.key==='b'||e.key==='B') && focusedId){
        const t = taskMap.get(focusedId);
        if(t) (t.blocked ? clearBlocked(t.id) : setBlocked(t.id));
      }
      if((e.key==='Backspace'||e.key==='Delete')&&focusedId&&!drawerId) deleteTask(focusedId);
      // Card popover shortcuts (Sunsama-style). Use letters that don't collide with existing bindings.
      if(focusedId && !drawerId){
        if(e.key==='T' && e.shiftKey){ e.preventDefault(); setPopRequest({id:focusedId, field:'tag'}); }
        else if(e.key==='p' || e.key==='P'){ if(!e.shiftKey){ e.preventDefault(); setPopRequest({id:focusedId, field:'proj'}); } }
        else if(e.key==='m' || e.key==='M'){ e.preventDefault(); setPopRequest({id:focusedId, field:'time'}); }
        else if(e.key==='D' && e.shiftKey){ e.preventDefault(); setPopRequest({id:focusedId, field:'date'}); }
        else if(e.key==='R' && e.shiftKey){ e.preventDefault(); setPopRequest({id:focusedId, field:'pri'}); }
        else if(e.key==='s' || e.key==='S'){ if(!e.shiftKey){ e.preventDefault(); setPopRequest({id:focusedId, field:'snooze'}); } }
      }
    };
    window.addEventListener('keydown',fn);
    return ()=>window.removeEventListener('keydown',fn);
  });

  const onPaletteCmd = (cmd) => {
    if(cmd.l.includes('New task')) addTask('today',D.today(),'Untitled');
    if(cmd.l.includes('Archive') && focusedId) archiveTask(focusedId);
    if(cmd.l.includes('today')) resetTimelineToToday();
    if(cmd.l.includes('theme')) setTheme(t=>t==='dark'?'light':'dark');
    if(cmd.l.includes('weekends')) setShowWknd(s=>!s);
    if(cmd.l.includes('Priorities')) setView('upcoming');
    if(cmd.l.includes('inbox')) setView('inbox');
  };

  // filter helpers
  const toggleFilter = (key, val) => {
    setFilters(f=>({ ...f, [key]: (f[key] || []).includes(val)?(f[key] || []).filter(x=>x!==val):[...(f[key] || []),val] }));
  };
  const activeFilterPills = [
    ...filters.projects.map(p=>({key:'projects',val:p,label:PROJ.find(x=>x.id===p)?.label||p})),
    ...filters.tags.map(t=>({key:'tags',val:t,label:TAG_NAMES[t]||t})),
    // Buckets pills replace the old lifeAreas pills.
    ...((filters.buckets || []).map(bid => {
      if (bid === '__nobucket__') return { key: 'buckets', val: bid, label: 'No bucket' };
      const b = (tweaks.customGroups || []).find(g => g.id === bid);
      return { key: 'buckets', val: bid, label: b?.name || bid };
    })),
    ...filters.priorities.map(p=>({key:'priorities',val:p,label:{p1:'P1',p2:'P2',p3:'P3'}[p]||p})),
  ];

  // view title
  const timelineStartDate = visibleDates[0] || D.today();
  const timelineEndDate = visibleDates[visibleDates.length-1] || D.today();
  const timelineTitle = `Timeline ${MONTH_S[timelineStartDate.getMonth()]} ${timelineStartDate.getDate()} - ${timelineStartDate.getMonth()!==timelineEndDate.getMonth()?MONTH_S[timelineEndDate.getMonth()]+' ':''}${timelineEndDate.getDate()}, ${timelineEndDate.getFullYear()}`;
  const viewTitle = view==='week'?timelineTitle:view==='stack'?'Stack':view==='list'?'List':view==='inbox'?'Inbox':view==='upcoming'?'Upcoming':view==='backlog'?'Backlog':view==='snoozed'?'Snoozed':view==='someday'?'Someday':view==='blocked'?'Blocked':view==='completed'?'Completed':view==='archived'?'Archived':view==='delegations'?'Delegations':view?.type==='project'?PROJ.find(p=>p.id===view.id)?.label||'Location':view?.type==='tag'?TAG_NAMES[view.name]||view.name:view?.type==='lifeArea'?lifeAreaOptionLabel(view.id):'Tasks';

  // Stack/List task pool — all open top-level tasks, ignoring topbar pill filters by design.
  // Search still applies so users can find tasks in these views.
  // Check-in nudges are normally excluded (they're surfaced on Timeline), but
  // today's / overdue nudges surface here too so an "act today" Stack pass
  // includes chase-ups. Future-dated nudges stay hidden — Timeline owns those.
  const allOpenTopLevel = activeTasks.filter(t=>!t.done&&!t.parentId&&!t.snoozedUntil&&!t.delegatedTo&&(!t.checkInOf || (t.date && t.date <= todayStr))&&taskMatchesSearch(t));
  // Stack body excludes routines entirely — they live in the pinned strip
  // above. The strip handles today's routines; the rest of the routine series
  // (tomorrow's walk, next week's triage, etc.) is chrome that shouldn't
  // compete with priority work. Tasks-with-cadence (isRoutine === false) still
  // appear here normally, marked only by the purple ↻ pill.
  const stackOpenTopLevel = allOpenTopLevel.filter(t => !t.someday && !t.recurrence?.isRoutine);

  // non-week view tasks
  const listTasks = ()=>{
    if(view==='inbox') return applyFilters(activeTasks.filter(t=>!t.date&&!t.done&&!t.parentId&&!t.snoozedUntil&&!t.someday&&!t.blocked&&!t.delegatedTo));
    if(view==='upcoming') return applyFilters(activeTasks.filter(t=>D.isFut(t.date)&&!t.done&&!t.parentId&&!t.blocked&&!t.delegatedTo));
    if(view==='backlog') return applyFilters(activeTasks.filter(t=>!t.date&&!t.done&&!t.parentId&&!t.someday&&!t.blocked&&!t.delegatedTo));
    if(view==='snoozed') return applyFilters(activeTasks.filter(t=>!!t.snoozedUntil&&!t.parentId&&!t.delegatedTo));
    if(view==='someday') return applyFilters(activeTasks.filter(t=>!!t.someday&&!t.parentId&&!t.delegatedTo));
    if(view==='blocked') return applyFilters(activeTasks.filter(t=>t.blocked&&!t.done&&!t.parentId&&!t.delegatedTo));
    if(view==='completed') return applyFilters(activeTasks.filter(t=>t.done&&!t.parentId));
    if(view==='archived') return applyFilters(tasks.filter(t=>t.archived&&!t.parentId));
    if(view?.type==='project') return applyFilters(activeTasks.filter(t=>t.project===view.id&&!t.done&&!t.parentId&&!t.delegatedTo));
    if(view?.type==='tag') return applyFilters(activeTasks.filter(t=>(t.tags||[]).includes(view.name)&&!t.done&&!t.parentId&&!t.delegatedTo));
    if(view?.type==='lifeArea') return applyFilters(activeTasks.filter(t=>{
      if(t.done || t.parentId || t.delegatedTo) return false;
      const lifeArea = getEffectiveLifeArea(t);
      return view.id===UNASSIGNED_LIFE_AREA ? !lifeArea : lifeArea===view.id;
    }));
    return [];
  };
  const applyInboxFilters = (list) => {
    const incP = Object.entries(inboxFilters.projects).filter(([,v])=>v==='inc').map(([k])=>k);
    const excP = Object.entries(inboxFilters.projects).filter(([,v])=>v==='exc').map(([k])=>k);
    const incT = Object.entries(inboxFilters.tags).filter(([,v])=>v==='inc').map(([k])=>k);
    const excT = Object.entries(inboxFilters.tags).filter(([,v])=>v==='exc').map(([k])=>k);
    // Bucket inbox-filter axis (replaces lifeAreas). '__nobucket__' pseudo-id
    // matches tasks with no groupId.
    const incB = Object.entries(inboxFilters.buckets || {}).filter(([,v])=>v==='inc').map(([k])=>k);
    const excB = Object.entries(inboxFilters.buckets || {}).filter(([,v])=>v==='exc').map(([k])=>k);
    const incPri = Object.entries(inboxFilters.priorities).filter(([,v])=>v==='inc').map(([k])=>k);
    const excPri = Object.entries(inboxFilters.priorities).filter(([,v])=>v==='exc').map(([k])=>k);
    if(!incP.length && !excP.length && !incT.length && !excT.length && !incB.length && !excB.length && !incPri.length && !excPri.length) return list;
    return list.filter(t => {
      const proj = t.project || '_none';
      const tags = t.tags || [];
      const gid = t.groupId || null;
      const pri = t.pri || t.priority || 'p3';
      if(incP.length && !incP.includes(proj)) return false;
      if(excP.length && excP.includes(proj)) return false;
      if(incT.length && !tags.some(tg=>incT.includes(tg))) return false;
      if(excT.length && tags.some(tg=>excT.includes(tg))) return false;
      if(incB.length && !incB.some(id => id==='__nobucket__' ? !gid : gid===id)) return false;
      if(excB.length && excB.some(id => id==='__nobucket__' ? !gid : gid===id)) return false;
      if(incPri.length && !incPri.includes(pri)) return false;
      if(excPri.length && excPri.includes(pri)) return false;
      return true;
    });
  };
  const sidePanelTasks = ()=>{
    let list;
    if(sidePanelView==='timeline') list = visColKeys.filter(k=>k!=='inbox').flatMap(k=>tasksForCol(k));
    else if(sidePanelView==='inbox') list = applyFilters(activeTasks.filter(t=>!t.date&&!t.done&&!t.parentId&&!t.snoozedUntil&&!t.someday&&!t.blocked&&!t.delegatedTo));
    else if(sidePanelView==='upcoming') list = applyFilters(activeTasks.filter(t=>D.isFut(t.date)&&!t.done&&!t.parentId&&!t.blocked&&!t.delegatedTo));
    else if(sidePanelView==='backlog') list = applyFilters(activeTasks.filter(t=>!t.date&&!t.done&&!t.parentId&&!t.someday&&!t.blocked&&!t.delegatedTo));
    else if(sidePanelView==='snoozed') list = applyFilters(activeTasks.filter(t=>!!t.snoozedUntil&&!t.parentId&&!t.delegatedTo));
    else if(sidePanelView==='recently-woken') {
      // Tasks whose most recent activity entry is a 'woke' event in the past
      // 24h. Lets users find tasks that quietly returned to view after a
      // sleep (especially after wake-on-load).
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      list = applyFilters(activeTasks.filter(t => {
        if (t.parentId || t.delegatedTo) return false;
        const acts = Array.isArray(t.activity) ? t.activity : [];
        const lastWoke = acts.slice().reverse().find(a => a?.type === 'woke');
        if (!lastWoke) return false;
        const at = new Date(lastWoke.at).getTime();
        return Number.isFinite(at) && at >= cutoff;
      }));
    }
    else if(sidePanelView==='someday') list = applyFilters(activeTasks.filter(t=>!!t.someday&&!t.parentId&&!t.delegatedTo));
    else if(sidePanelView==='blocked') list = applyFilters(activeTasks.filter(t=>t.blocked&&!t.done&&!t.parentId&&!t.delegatedTo));
    else if(sidePanelView==='completed') list = applyFilters(activeTasks.filter(t=>t.done&&!t.parentId));
    else if(sidePanelView==='archived') list = applyFilters(tasks.filter(t=>t.archived&&!t.parentId));
    else list = [];
    return applyInboxFilters(list);
  };
  const cycleInboxFilter = (kind, val) => setInboxFilters(prev => {
    const cur = prev[kind][val];
    const next = cur==='inc' ? 'exc' : cur==='exc' ? null : 'inc';
    const newKind = {...prev[kind]};
    if(next) newKind[val] = next; else delete newKind[val];
    return {...prev, [kind]: newKind};
  });
  const clearInboxFilters = () => setInboxFilters({projects:{},tags:{},buckets:{},priorities:{}});
  const inboxFilterCount = Object.values(inboxFilters).reduce((s,o)=>s+Object.keys(o).length, 0);
  const sidePanelCurrentTasks = view==='week' ? sidePanelTasks() : [];
  const sidePanelCurrentIds = sidePanelCurrentTasks.map(t=>t.id);
  const currentVisibleTasks = view==='week' ? visColKeys.flatMap(k=>tasksForCol(k)) : listTasks();
  const currentVisibleIds = currentVisibleTasks.map(t=>t.id);
  const selectedTasks = [...selectedIds].map(id=>taskById(id)).filter(Boolean);
  const selectedFromPanel = view==='week' && sidePanelCurrentIds.some(id=>selectedIds.has(id));
  const bulkScopeIds = selectedFromPanel ? sidePanelCurrentIds : currentVisibleIds;
  const bulkScopeLabel = selectedFromPanel ? 'panel' : 'view';
  const allBulkScopeSelected = bulkScopeIds.length>0 && bulkScopeIds.every(id=>selectedIds.has(id));
  const toggleSelected = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Toggle body class so scrolling areas can pad-bottom when the bulk bar is up
  useEffect(() => {
    document.body.classList.toggle('has-bulk-bar', selectedTasks.length > 0);
    return () => document.body.classList.remove('has-bulk-bar');
  }, [selectedTasks.length]);

  const selectBulkScope = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      bulkScopeIds.forEach(id=>next.add(id));
      return next;
    });
  };
  const bulkUpdate = (mutator, doneMsg='Updated') => {
    if(!selectedIds.size) return;
    const ids = new Set(selectedIds);
    setUndoStack(s=>[...s.slice(-9),{bulk:true,before:tasks}]);
    setTasks(prev=>prev.map(t=>ids.has(t.id)?mutator(t):t));
    setToast(doneMsg);
    setTimeout(()=>setToast(null),1400);
  };
  const bulkSet = (changes, label='Updated') => bulkUpdate(t=>{
      const next = applyTaskPatch(t, changes);
      return changes.done === false ? {...rollTaskDateForward(next), completedAt: null} : next;
  }, label);
  const bulkAddTag = (tag) => {
    if(!tag) return;
    bulkUpdate(t=>({...t,tags:[...new Set([...(t.tags||[]), tag])]}), 'Tag added');
  };
  const bulkGroupIntoProject = () => {
    const sel = [...selectedIds].map(id=>taskById(id)).filter(Boolean);
    if(sel.length < 2) return;
    // Disallow if any selected card is itself a project, or is already a child.
    if(sel.some(t=>t.cardType==='project')) {
      setToast("Can't group: selection contains a project");
      setTimeout(()=>setToast(null),1600);
      return;
    }
    if(sel.some(t=>t.parentId)) {
      setToast("Can't group: selection contains a child of another project");
      setTimeout(()=>setToast(null),1600);
      return;
    }
    const first = sel[0];
    // Inherit context/tags/priority from the first selected card.
    const newProject = makeTask({
      title: 'Untitled project',
      cardType: 'project',
      childOrder: sel.map(s=>s.id),
      date: first.date || null,
      dueDate: first.dueDate || null,
      project: first.project,
      lifeArea: getEffectiveLifeArea(first),
      tags: [...(first.tags||[])],
      priority: first.priority,
    });
    pushSnapshotUndo();
    const ids = new Set(sel.map(s=>s.id));
    setTasks(prev => [...prev.map(t => ids.has(t.id) ? applyTaskPatch(t, { parentId:newProject.id, date:null }) : t), newProject]);
    setSelectedIds(new Set());
    setRenamingId(null);
    setTimeout(()=>{ setDrawerId(newProject.id); setFocusedId(newProject.id); }, 60);
  };

  const bulkDelete = () => {
    if(!selectedIds.size) return;
    const ids = new Set(selectedIds);
    const count = ids.size;
    const doDelete = () => {
      setUndoStack(s=>[...s.slice(-9),{bulk:true,before:tasks,beforeGroups:tweaks.customGroups||[]}]);
      const nextTasks = tasks.filter(t=>!ids.has(t.id));
      setTasks(nextTasks);
      pruneEmptyGroups(nextTasks);
      setSelectedIds(new Set());
      setDrawerId(id=>ids.has(id)?null:id);
      setFocusedId(id=>ids.has(id)?null:id);
      setToast('Deleted');
      setTimeout(()=>setToast(null),1400);
      setConfirmDialog(null);
    };
    setConfirmDialog({
      message: `Delete ${count} selected task${count===1?'':'s'}? Hold to confirm.`,
      hold: true,
      destructive: true,
      confirmLabel: 'Hold to delete',
      onConfirm: doDelete,
      onCancel: () => setConfirmDialog(null),
    });
  };

  // ---- Custom groups (user-created, persistent multi-card clusters) ----
  const GROUP_PALETTE = ['#0f766e','#7c3aed','#db2777','#ea580c','#0284c7','#65a30d','#ca8a04','#dc2626'];
  // Dedupe a customGroups array by id (first occurrence wins). Used both on
  // cloud load and inside any updater that mutates the list, so no code path
  // can leave duplicate-id entries in state.
  const dedupeCustomGroups = (list) => {
    const seen = new Set();
    const out = [];
    for (const g of list || []) {
      if (!g?.id || seen.has(g.id)) continue;
      seen.add(g.id);
      out.push(g);
    }
    return out;
  };
  // Prune groups with no member tasks. Reads customGroups from the live
  // `prev` inside a functional setter so it never sees stale state.
  const pruneEmptyGroups = (taskList) => {
    const used = new Set((taskList||[]).map(t=>t.groupId).filter(Boolean));
    setTweakState(prev => {
      const list = dedupeCustomGroups(prev.customGroups);
      const next = list.filter(g => used.has(g.id));
      if (next.length === (prev.customGroups || []).length) return prev;
      return { ...prev, customGroups: next };
    });
  };
  const groupSelected = () => {
    if (selectedIds.size < 2) return;
    const id = mkid();
    const ids = new Set(selectedIds);
    const nextTasks = tasks.map(t => ids.has(t.id) ? {...t, groupId: id} : t);
    setUndoStack(s=>[...s.slice(-9),{bulk:true,before:tasks,beforeGroups:tweaks.customGroups||[]}]);
    setTweakState(prev => {
      // Compute name + color against the *current* customGroups so concurrent
      // calls don't both read the same stale length.
      const list = dedupeCustomGroups(prev.customGroups);
      const used = new Set(nextTasks.map(t=>t.groupId).filter(Boolean));
      // Drop empties first so positional naming reflects what survives.
      const live = list.filter(g => used.has(g.id) || g.id === id);
      const grp = {
        id,
        name: `Group ${live.length + 1}`,
        color: GROUP_PALETTE[live.length % GROUP_PALETTE.length],
        createdAt: new Date().toISOString(),
      };
      return { ...prev, customGroups: [...live, grp] };
    });
    setTasks(nextTasks);
    setRenamingGroupId(id);
    setSelectedIds(new Set());
    setToast('Grouped'); setTimeout(()=>setToast(null), 1200);
  };
  const ungroupSelected = () => {
    if (!selectedIds.size) return;
    const ids = new Set(selectedIds);
    setUndoStack(s=>[...s.slice(-9),{bulk:true,before:tasks,beforeGroups:tweaks.customGroups||[]}]);
    const nextTasks = tasks.map(t => ids.has(t.id) ? {...t, groupId: null} : t);
    setTasks(nextTasks);
    pruneEmptyGroups(nextTasks);
    setToast('Ungrouped'); setTimeout(()=>setToast(null), 1200);
  };
  const renameGroup = (id, name) => {
    const trimmed = (name||'').trim();
    if (!trimmed) return;
    setTweak('customGroups', (tweaks.customGroups||[]).map(g => g.id===id ? {...g, name: trimmed} : g));
  };

  const openTask = (id) => { setSettingsOpen(false); setRenamingId(null); setDrawerFromLeft(false); setDrawerId(id); setFocusedId(id); };

  // Jump to a task by id, switch to a view that should make it visible,
  // animate-scroll it to center, and highlight it until the user clicks
  // elsewhere. Used by "Go to first instance" in the drawer's recurrence
  // section. View choice:
  //   • done task → 'completed' view (shows past completed instances)
  //   • else → 'week' (Timeline)
  const jumpToTaskHighlighted = (id) => {
    const t = taskById(id);
    if (!t) return;
    setDrawerId(id);
    setFocusedId(id);
    if (t.archived) setView('archived');
    else if (t.done) setView('completed');
    else setView('week');
    // Retry-find the element across a few frames so the view-switch render
    // can settle (especially Timeline which virtualises). Once found, scroll
    // into view + apply the persistent highlight.
    const sel = `[data-card-id="${CSS.escape(id)}"], .list-item[data-list-id="${CSS.escape(id)}"]`;
    let tries = 0;
    const findAndHighlight = () => {
      tries += 1;
      const el = document.querySelector(sel);
      if (!el) {
        if (tries < 30) setTimeout(findAndHighlight, 40);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      el.classList.add('routine-jump-highlight');
      const clear = (e) => {
        if (e && el.contains(e.target)) return;
        el.classList.remove('routine-jump-highlight');
        document.removeEventListener('click', clear, true);
      };
      setTimeout(() => document.addEventListener('click', clear, true), 300);
      setTimeout(() => clear(null), 12000);
    };
    setTimeout(findAndHighlight, 40);
  };
  const openSettings = () => { setDrawerId(null); setRenamingId(null); if (!settingsOpen && !tweaks.calendarPinned) setTweak('calendarOpen', false); setSettingsOpen(s=>!s); };
  const drawerTask = drawerId ? taskById(drawerId) : null;

  // Shift+drag marquee selection — works on board AND stack-body backgrounds.
  const startMarquee = (e, root) => {
    if (!root) return;
    e.preventDefault();
    marqueeBaseRef.current = new Set(selectedIds);
    const rect = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
    setMarquee(rect);
    document.body.classList.add('marquee-active');
    let raf = 0;
    const onMove = ev => {
      rect.x1 = ev.clientX; rect.y1 = ev.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setMarquee({...rect});
        const x0 = Math.min(rect.x0, rect.x1), x1 = Math.max(rect.x0, rect.x1);
        const y0 = Math.min(rect.y0, rect.y1), y1 = Math.max(rect.y0, rect.y1);
        const next = new Set(marqueeBaseRef.current);
        root.querySelectorAll('[data-card-id]').forEach(node => {
          const r = node.getBoundingClientRect();
          if (r.right < x0 || r.left > x1 || r.bottom < y0 || r.top > y1) return;
          next.add(node.dataset.cardId);
        });
        setSelectedIds(next);
      });
    };
    const onUp = () => {
      if (raf) cancelAnimationFrame(raf);
      setMarquee(null);
      document.body.classList.remove('marquee-active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  const onStackMarqueeStart = (e, root) => startMarquee(e, root);

  // board pan-to-scroll — attach move/up to document so fast drags don't lose events
  const onBoardMouseDown = e => {
    if (e.button !== 0) return;
    if (e.target.closest('.card,.col-add,.col-groupby,.col-groupby-wrap,.card-add-zone,.side-panel,.col-hdr,.grp-hdr,.done-grp-hdr,.tb-btn,.lnav-item,.drawer,.col-routines-strip,.crs-item')) return;
    const el = boardRef.current; if (!el) return;
    if (e.shiftKey) { startMarquee(e, el); return; }
    userScrolledRef.current = true;
    panState.current = {isPanning:true, startX:e.clientX, scrollLeft:el.scrollLeft};
    el.classList.add('panning');
    const onMove = ev => {
      if (!panState.current.isPanning) return;
      el.scrollLeft = panState.current.scrollLeft - (ev.clientX - panState.current.startX);
    };
    const onUp = () => {
      panState.current.isPanning = false;
      el.classList.remove('panning');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  const onBoardScroll = e => {
    const el = e.currentTarget;
    if(boardRaf.current) cancelAnimationFrame(boardRaf.current);
    boardRaf.current = requestAnimationFrame(()=>{
      const shell = boardShellRef.current;
      // Skip the update unless scroll moved by ~half a column or layout
      // changed. Re-rendering App on every pixel of scroll causes a visible
      // flicker on a busy board because every TaskCard's useSortable hook
      // re-subscribes; the column-virtualization slice doesn't actually
      // change unless we cross a column boundary.
      const newWidth = el.clientWidth;
      const newBoardWidth = shell?.clientWidth||el.clientWidth;
      const oldSL = boardMetrics.scrollLeft;
      const newSL = el.scrollLeft;
      const dx = Math.abs(newSL - oldSL);
      const layoutChanged = newWidth !== boardMetrics.width || newBoardWidth !== boardMetrics.boardWidth;
      const COL_HALF = (typeof COL_W === 'number' ? COL_W : 240) / 2;
      // Force an update if the scroll crossed today's natural position — the
      // pinClass on the today column depends on boardMetrics.scrollLeft, so
      // letting state lag would leave today un-pinned across the boundary,
      // briefly scrolling it out of view instead of sticking it.
      const todayPosLocal = todayIdxRef.current >= 0 ? todayIdxRef.current * (colWRef.current || COL_W) : null;
      const viewportW = newWidth;
      const crossedToday = todayPosLocal !== null && (
        (oldSL < todayPosLocal && newSL >= todayPosLocal) ||
        (oldSL >= todayPosLocal && newSL < todayPosLocal) ||
        // also catch the off-screen-right boundary
        (oldSL + viewportW - (colWRef.current || COL_W) < todayPosLocal) !==
        (newSL + viewportW - (colWRef.current || COL_W) < todayPosLocal)
      );
      if (!layoutChanged && dx < COL_HALF && !crossedToday) return;
      setBoardMetrics({scrollLeft:newSL, width:newWidth, boardWidth:newBoardWidth});
    });
    if (el.scrollLeft < COL_W * 4 && weekOff > -TIMELINE_MAX_DAYS) {
      const add = Math.min(TIMELINE_EXTEND_DAYS, weekOff + TIMELINE_MAX_DAYS);
      const prepended = getWeekDays(weekOff - add, add)
        .filter(d=>showWknd || [1,2,3,4,5].includes(d.getDay()) || D.str(d)===todayStr).length;
      pendingScrollShift.current += prepended * COL_W;
      setWeekOff(o=>o-add);
      setTimelineDays(d=>Math.min(d+add, TIMELINE_MAX_DAYS * 2));
    }
    if (el.scrollWidth - el.scrollLeft - el.clientWidth < COL_W * 6) {
      setTimelineDays(d=>Math.min(d+TIMELINE_EXTEND_DAYS, TIMELINE_MAX_DAYS * 2));
    }
  };
  const todayCount = activeTasks.filter(t=>D.isTdy(t.date)&&!t.done).length;
  const allCount   = activeTasks.filter(t=>!t.done).length;

  // Card popovers / context menu / recents wiring
  const onCardContextMenu = (task, x, y) => setContextMenu({task, x, y});
  const cardExtras = {
    onContextMenu: onCardContextMenu,
    onBulkUpdate: bulkUpdateTasks,
    recents,
    onRecentTag: t => pushRecent('tags', t),
    onRecentProj: p => pushRecent('projects', p),
    getEffectiveLifeArea,
    openPopRequest: popRequest,
    onPopHandled: () => setPopRequest(null),
    onAddTaxonomy: (kind, label) => taxonomyActions.add(kind, label),
    onStartRename: (id) => { setFocusedId(id); setRenamingId(id); },
    customGroups: tweaks.customGroups || [],
    renamingGroupId,
    onStartGroupRename: (id) => setRenamingGroupId(id),
    onGroupRenameDone: () => setRenamingGroupId(null),
    onRenameGroup: renameGroup,
    // When the calendar drawer is open, inbox cards initiate the prototype's
    // external-drag system instead of @dnd-kit's pointer sensor. TaskCard
    // checks for this prop and swaps listeners accordingly.
    onExternalDrag: tweaks.calendarOpen ? onTaskMouseDown : null,
  };
  const renderTimelineColumn = (date, keyPrefix='') => {
    const colKey=D.str(date);
    const colTasks=tasksForCol(colKey);
    // Always apply today-pinned so sticky is CSS-resolved (no React state
    // race when crossing today's natural position). pin-${dir} is only for
    // the directional shadow + border — lagging that a frame is fine.
    const pinClass = colKey===todayStr && todayPinEnabled ? `today-pinned${todayPin ? ` pin-${todayPin}` : ''}` : '';
    return <Column key={`${keyPrefix}${colKey}`} className={pinClass} date={date} tasks={colTasks}
      focusedCardId={focusedId} selectedIds={selectedIds} spawning={spawning} theme={theme} tweaks={tweaks}
      showRoutines={tweaks.showRoutinesOnTimeline !== false}
      renamingId={renamingId}
      groupBy={globalGroupBy}
      collapsedGrps={collapsedGrps}
      completedOpen={completedOpen.has(colKey)}
      blockedOpen={blockedOpen.has(colKey)}
      snoozedOpen={colKey === todayStr ? !tweaks.snoozedTodayClosed : snoozedOpen.has(colKey)}
      onToggleGrp={gk=>setCollapsedGrps(s=>{const ns=new Set(s);ns.has(gk)?ns.delete(gk):ns.add(gk);return ns;})}
      onToggleCompleted={ck=>setCompletedOpen(s=>{const ns=new Set(s);ns.has(ck)?ns.delete(ck):ns.add(ck);return ns;})}
      onToggleBlocked={ck=>setBlockedOpen(s=>{const ns=new Set(s);ns.has(ck)?ns.delete(ck):ns.add(ck);return ns;})}
      onToggleSnoozed={ck=>{
        if(ck===todayStr){ setTweak('snoozedTodayClosed', !tweaks.snoozedTodayClosed); }
        else { setSnoozedOpen(s=>{const ns=new Set(s);ns.has(ck)?ns.delete(ck):ns.add(ck);return ns;}); }
      }}
      onAdd={(ck,d,pos)=>addTask(ck,d,'Untitled',pos)}
      onOpen={openTask}
      onToggle={completeTask} onDelete={deleteTask}
      onFocus={setFocusedId}
      onSelect={toggleSelected}
      onRename={updateTask}
      onRenameDone={()=>setRenamingId(null)}
      childrenOf={childrenOf} projectStats={projectStats}
      collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
      forceOpenProjects={forceOpenProjects}
      blockingCountFor={blockingCountFor} taskTitleById={taskTitleById}
      todayPinned={todayPinEnabled}
      onToggleTodayPin={()=>setTweak('todayPinned', !todayPinEnabled)}
      cardExtras={cardExtras}/>;
  };
  const ctxItems = contextMenu ? (() => {
    const t = contextMenu.task;
    // Only TaskCard (Column / Timeline / week view) consumes popRequest and
    // hosts the per-card picker popovers. StackCard (.scard) and ListTaskItem
    // (.list-item) don't, so popRequest is a no-op there. For any non-Timeline
    // view, open the Edit-submenu pickers as a portal popover anchored at the
    // menu's cursor coords instead.
    const open = field => {
      if (view === 'week') {
        setPopRequest({id:t.id, field});
      } else {
        setStackPicker({id:t.id, field, x:contextMenu.x, y:contextMenu.y});
      }
      setFocusedId(t.id);
    };
    return [
      {type:'lbl', label:'Edit'},
      {label:'Tag…',      onClick:()=>open('tag'),    kbd:'T'},
      {label:'Location…', onClick:()=>open('proj'),   kbd:'P'},
      {label:'Time…',     onClick:()=>open('time'),   kbd:'M'},
      {label:'Start Date…', onClick:()=>open('date'),   kbd:'⇧D'},
      {label:'Priority…', onClick:()=>open('pri'),    kbd:'⇧R'},
      {label:'Snooze…',   onClick:()=>open('snooze'), kbd:'S'},
      {label: t.delegatedTo ? 'Re-delegate / edit…' : 'Delegate to…',
        onClick: () => {
          // Open the card in the drawer; drawer.jsx auto-expands the Delegation
          // section when delegatedTo is set, and we'll nudge it open via the
          // drawerInitialFocus state below for a fresh delegation.
          setDrawerInitialFocus('delegation');
          openTask(t.id);
        }},
      {label:'Card colour…', onClick:()=>setCardColorPickerFor({id:t.id, x:contextMenu.x, y:contextMenu.y}), kbd:'⇧C'},
      {type:'sep'},
      {label:'Open in drawer', onClick:()=>openTask(t.id), kbd:'↵'},
      {label:'Rename',         onClick:()=>setRenamingId(t.id), kbd:'E'},
      {label:'Duplicate',      onClick:()=>duplicateTask(t.id), kbd:'D'},
      ...(t.date == null
        ? [{label:'Move to today', onClick:()=>updateTask(t.id,{date:D.str(D.today()),someday:false,...clearSnoozePatch})}]
        : [{label:'Move to inbox', onClick:()=>updateTask(t.id,{date:null,someday:false,...clearSnoozePatch})}]
      ),
      {label: t.someday ? 'Remove from Someday' : 'Move to Someday',
        onClick:()=>updateTask(t.id,{someday:!t.someday}), kbd:'Z'},
      {label: t.cardType==='project' ? 'Convert to task' : 'Convert to project',
        onClick:()=>{
          if (t.parentId) { setToast('Already inside a project'); setTimeout(()=>setToast(null),1400); return; }
          updateTask(t.id, {cardType: t.cardType==='project' ? 'task' : 'project'});
        }, kbd:'⇧G'},
      ...((() => {
        const idsToUngroup = selectedIds.size > 0 ? selectedIds : new Set([t.id]);
        const anyGrouped = tasks.some(tk => idsToUngroup.has(tk.id) && tk.groupId);
        if (!anyGrouped) return [];
        return [{label:'Ungroup', onClick:()=>{
          setUndoStack(s=>[...s.slice(-9),{bulk:true,before:tasks,beforeGroups:tweaks.customGroups||[]}]);
          const nextTasks = tasks.map(tk => idsToUngroup.has(tk.id) ? {...tk, groupId:null} : tk);
          setTasks(nextTasks);
          pruneEmptyGroups(nextTasks);
          setToast('Ungrouped'); setTimeout(()=>setToast(null), 1200);
        }}];
      })()),
      {type:'sep'},
      {label:'Archive', onClick:()=>archiveTask(t.id), kbd:'C'},
      {label:'Delete',  onClick:()=>deleteTask(t.id), danger:true, kbd:'⌫'},
    ];
  })() : [];

  return <DndContext
    sensors={dndSensors}
    collisionDetection={compositeCollisionDetection}
    onDragStart={dndOnDragStart}
    onDragOver={dndOnDragOver}
    onDragEnd={dndOnDragEnd}
    onDragCancel={dndOnDragCancel}
  >
    <SnoozeTickProvider tasks={tasks}>
    <AutoWakeWatcher tasks={tasks} tasksReady={tasksReady} onWake={handleWakeTasks}/>
    {!supabaseDisabled && tasksReady && !migrationDismissed && (
      <MigrateFromLocal onComplete={() => setMigrationDismissed(true)} />
    )}
    {/* TOPBAR */}
    <div className="topbar">
      <button className="app-burger" onClick={()=>setNavCollapsed(c=>!c)} aria-label={navCollapsed?'Open menu':'Close menu'} title="Menu">
        <span/><span/><span/>
      </button>
      <div className="tb-logo"><div className="tb-icon">K</div>kanban</div>
      <div className="tb-sep tb-hide-mobile"/>
      <div className="tb-crumb tb-hide-mobile">
        <span>Workspace</span><span>›</span>
        <span className="tb-crumb-active">{viewTitle}</span>
      </div>
      <div className="tb-secondary tb-secondary-left">
        <div className="tb-sep"/>
        <div className="tb-btn-group" title="Switch view layout">
          <button className={`tb-btn${view==='week'?' active':''}`} onClick={()=>setView('week')} title="Cards (Timeline)"><I.Cards/></button>
          <button className={`tb-btn${view==='list'?' active':''}`} onClick={()=>setView('list')} title="List"><I.List/></button>
          <button className={`tb-btn${view==='stack'?' active':''}`} onClick={()=>setView('stack')} title="Stack"><I.Stack/></button>
        </div>
        <button
          className={`tb-btn cal-toggle${tweaks.calendarOpen?' active':''}`}
          onClick={()=>{ const next=!tweaks.calendarOpen; setTweak('calendarOpen',next); if(next) setSettingsOpen(false); }}
          title={tweaks.calendarOpen ? 'Close calendar' : 'Open day calendar'}
          aria-pressed={!!tweaks.calendarOpen}
        ><I.Cal/></button>
        {view==='week' && <>
          <div className="tb-sep"/>
          <button className="tb-btn" onClick={()=>setWeekOff(o=>o-30)}><I.Chv d="l"/></button>
          <button className="tb-btn" onClick={resetTimelineToToday}>Today</button>
          <button className="tb-btn" onClick={()=>setWeekOff(o=>o+30)}><I.Chv d="r"/></button>
          <div className="tb-btn-group" title="Visible day columns including Today">
            {['auto',4,5,7].map(o=>(
              <button key={o} className={`tb-btn${dayWindowSetting===o?' active':''}`} onClick={()=>setTweak('dayWindow',o)}>
                {o==='auto'?'Auto':o}
              </button>
            ))}
          </div>
        </>}
        {view==='buckets' && (() => {
          // Global sort selector for the Buckets view. Manual is the default
          // and re-engages on any within-column drag. Five sort modes total.
          const cur = BUCKETS_SORT_MODES.includes(tweaks.bucketsSort) ? tweaks.bucketsSort : 'manual';
          const LABELS = { manual: 'Manual', date: 'Date', priority: 'Priority', created: 'Recent', title: 'Title A–Z' };
          return (
            <>
              <div className="tb-sep"/>
              <label className="tb-sort-label">Sort</label>
              <select
                className="tb-select bk-sort-select"
                value={cur}
                onChange={e => setTweak('bucketsSort', e.target.value)}
                title="Sort cards inside every bucket column"
              >
                {BUCKETS_SORT_MODES.map(m => <option key={m} value={m}>{LABELS[m]}</option>)}
              </select>
              <button
                type="button"
                className={`tb-btn bk-autofit-btn${tweaks.bucketsAutoFit ? ' active' : ''}`}
                onClick={() => setTweak('bucketsAutoFit', !tweaks.bucketsAutoFit)}
                title={tweaks.bucketsAutoFit ? 'Switch to manual column width' : 'Auto-fit columns to screen'}
              >Fit</button>
            </>
          );
        })()}
      </div>
      <div className="tb-spacer"/>
      <div className="tb-secondary tb-secondary-right">
      <div className="search-box">
        <I.Search/>
        <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search tasks"/>
        {searchQuery && <button className="search-clear" onClick={()=>setSearchQuery('')}>×</button>}
      </div>
      {/* active filter pills */}
      {activeFilterPills.map(p=>(
        <div key={`${p.key}-${p.val}`} className="filter-pill">
          {p.label}<span className="filter-pill-x" onClick={()=>toggleFilter(p.key,p.val)}>×</span>
        </div>
      ))}
      {/* group dropdown (global) */}
      {view==='week' && (
        <div className="filter-dd-wrap" onClick={e=>e.stopPropagation()}>
          <button className="tb-btn" onClick={()=>setGroupOpen(o=>!o)}>
            Group: {{none:'None',project:'Location',bucket:'Bucket',tag:'Tag',priority:'Priority'}[globalGroupBy]||'Location'}
          </button>
          {groupOpen && (
            <div className="filter-dd" style={{minWidth:140}}>
              {[{v:'project',l:'Location'},{v:'bucket',l:'Bucket'},{v:'tag',l:'Tag'},{v:'priority',l:'Priority'},{v:'none',l:'None'}].map(o=>(
                <div key={o.v} className={`fdd-item${globalGroupBy===o.v?' active':''}`}
                  onClick={()=>{setGlobalGroupBy(o.v);setGroupOpen(false);}}
                  style={globalGroupBy===o.v?{color:'var(--accent)'}:undefined}>{o.l}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* filter dropdown */}
      <div className="filter-dd-wrap">
        <button className="tb-btn" onClick={()=>setFilterOpen(o=>!o)}><I.Filter/>Filter</button>
        {filterOpen && (
          <div className="filter-dd">
            <div className="fdd-section">
              <div className="fdd-label">Match</div>
              <div style={{display:'flex',gap:6,padding:'0 12px 8px'}}>
                <button className={`tb-btn${filterMode==='and'?' primary':''}`} style={{height:24,padding:'0 8px'}} onClick={()=>setFilterMode('and')}>All axes (AND)</button>
                <button className={`tb-btn${filterMode==='or'?' primary':''}`} style={{height:24,padding:'0 8px'}} onClick={()=>setFilterMode('or')}>Any axis (OR)</button>
              </div>
            </div>
            <div className="fdd-sep"/>
            <div className="fdd-section">
              <div className="fdd-label">Location</div>
              {PROJ.map(p=><div key={p.id} className="fdd-item" onClick={()=>toggleFilter('projects',p.id)}><input type="checkbox" readOnly checked={filters.projects.includes(p.id)}/>{p.label}</div>)}
            </div>
            <div className="fdd-sep"/>
            <div className="fdd-section">
              <div className="fdd-label">Priority</div>
              {['p1','p2','p3'].map(p=><div key={p} className="fdd-item" onClick={()=>toggleFilter('priorities',p)}><input type="checkbox" readOnly checked={filters.priorities.includes(p)}/>{p.toUpperCase()}</div>)}
            </div>
            <div className="fdd-sep"/>
            {/* Buckets filter — replaces the old Life Area filter section.
                Sources from tweaks.customGroups; "No bucket" matches tasks
                with no groupId set. */}
            <div className="fdd-section">
              <div className="fdd-label">Bucket</div>
              {(tweaks.customGroups || []).map(b => (
                <div key={b.id} className="fdd-item" onClick={()=>toggleFilter('buckets', b.id)}>
                  <input type="checkbox" readOnly checked={(filters.buckets || []).includes(b.id)}/>
                  <span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:b.color||'#94a3b8',marginRight:6,verticalAlign:'middle'}}/>
                  {b.name}
                </div>
              ))}
              <div className="fdd-item" onClick={()=>toggleFilter('buckets','__nobucket__')}>
                <input type="checkbox" readOnly checked={(filters.buckets || []).includes('__nobucket__')}/>No bucket
              </div>
            </div>
            <div className="fdd-sep"/>
            <div className="fdd-section">
              <div className="fdd-label">Tag</div>
              {ALL_TAGS.map(t=><div key={t} className="fdd-item" onClick={()=>toggleFilter('tags',t)}><input type="checkbox" readOnly checked={filters.tags.includes(t)}/>{TAG_NAMES[t]}</div>)}
            </div>
          </div>
        )}
      </div>
      <div className="tb-btn-group" title="Delegations">
        <button className={`tb-btn${view==='delegations'?' tb-btn-pressed':''}`}
          onClick={()=>{
            if(view==='delegations'){setView(preDeleg||'week');setPreDeleg(null);}
            else{setPreDeleg(view);setView('delegations');}
          }}
          title={view==='delegations'?'Back to previous view':'Delegations dashboard'}
          aria-pressed={view==='delegations'}
          aria-label="Open delegations dashboard"><I.Deleg/>Delegations</button>
      </div>
      {view==='week' && <button className={`tb-btn${tweaks.showRoutinesOnTimeline===false?' tb-btn-inactive':''}`}
        onClick={()=>setTweak('showRoutinesOnTimeline', tweaks.showRoutinesOnTimeline===false ? true : false)}
        title={tweaks.showRoutinesOnTimeline===false?'Show routines on timeline':'Hide routines on timeline'}
        aria-pressed={tweaks.showRoutinesOnTimeline!==false}><I.Recur/>Routines</button>}
      <button className="tb-btn" onClick={()=>setTweak('inboxCollapsed',!tweaks.inboxCollapsed)} title="Toggle inbox panel"><I.Inbox/>Inbox</button>
      <button className="tb-btn" onClick={()=>setPalette(true)}><I.Search/>⌘K</button>
      <div className="tb-sep"/>
      {undoStack.length > 0 && (
        <button className="tb-icon-btn" onClick={undo} title={`Undo (${undoStack.length})`} aria-label="Undo">
          <I.Undo/>
        </button>
      )}
      <button className="tb-icon-btn" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} title="Toggle theme (L)">
        {theme==='dark'?<I.Sun/>:<I.Moon/>}
      </button>
      <button className="tb-icon-btn" onClick={openSettings} title="Settings" aria-pressed={settingsOpen}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
      </div>{/* /tb-secondary-right */}
      <div className="filter-dd-wrap tb-overflow-wrap" onClick={e=>e.stopPropagation()}>
        <button className={`tb-overflow-btn${filtersActive||showWaitingOn||showStaleOnly?' has-active':''}`} onClick={()=>setTbOverflowOpen(o=>!o)} aria-label="More actions" title="More">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
        </button>
        {tbOverflowOpen && (
          <div className="filter-dd tb-overflow-menu">
            <div className="fdd-section">
              <div className="fdd-label">View</div>
              {[{v:'week',l:'Cards / Timeline'},{v:'list',l:'List'},{v:'stack',l:'Stack'}].map(o=>(
                <div key={o.v} className={`fdd-item${view===o.v?' active':''}`}
                  onClick={()=>{setView(o.v);setTbOverflowOpen(false);}}>{o.l}</div>
              ))}
            </div>
            <div className="fdd-sep"/>
            <div className="fdd-section">
              <div className="fdd-label">Search</div>
              <div style={{padding:'4px 12px 8px'}}>
                <input className="dr-inp" style={{width:'100%'}} placeholder="Search tasks…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} autoFocus/>
              </div>
            </div>
            <div className="fdd-sep"/>
            <div className="fdd-section">
              <div className="fdd-label">Timeline filters</div>
              <div className="fdd-item" onClick={()=>setTweak('showDelegationsOnTimeline', !tweaks.showDelegationsOnTimeline)}
                title="When off, delegated cards live only in the Delegations view">
                <input type="checkbox" readOnly checked={!!tweaks.showDelegationsOnTimeline}/>Show delegations on timeline
              </div>
              <div className="fdd-item" onClick={()=>setTweak('showCheckInsOnTimeline', !tweaks.showCheckInsOnTimeline)}
                title="When off, synthetic 'Check in with X' reminders stay hidden until their day">
                <input type="checkbox" readOnly checked={!!tweaks.showCheckInsOnTimeline}/>Show check-in reminders on timeline
              </div>
              <div className="fdd-item" onClick={()=>setTweak('showRoutinesOnTimeline', !tweaks.showRoutinesOnTimeline)}
                title="Hide or show the routines strip at the top of each day column">
                <input type="checkbox" readOnly checked={tweaks.showRoutinesOnTimeline !== false}/>Show routines on timeline
              </div>
              <div className="fdd-item" onClick={()=>{setShowStaleOnly(v=>!v);setTbOverflowOpen(false);}}>
                <input type="checkbox" readOnly checked={showStaleOnly}/>Stale only
              </div>
              <div className="fdd-item" onClick={()=>{setView('delegations');setTbOverflowOpen(false);}}>👥 Delegations</div>
              <div className="fdd-item" onClick={()=>{setTweak('inboxCollapsed',!tweaks.inboxCollapsed);setTbOverflowOpen(false);}}>📥 Inbox panel</div>
            </div>
            <div className="fdd-sep"/>
            <div className="fdd-section">
              <div className="fdd-item" onClick={()=>{openSettings();setTbOverflowOpen(false);}}>⚙ Settings</div>
              <div className="fdd-item" onClick={()=>{setPalette(true);setTbOverflowOpen(false);}}>⌘K Command palette</div>
              <div className="fdd-item" onClick={()=>{setTheme(t=>t==='dark'?'light':'dark');setTbOverflowOpen(false);}}>{theme==='dark'?'☀ Light theme':'🌙 Dark theme'}</div>
            </div>
          </div>
        )}
      </div>
      <button className="tb-btn primary" onClick={()=>addTask('today',D.today(),'Untitled')}><I.Plus/><span className="tb-hide-mobile">New task</span></button>
    </div>

    {/* BODY */}
    <div className="app-shell">
    <div className={`app-body${isNarrowScreen?' is-mobile':''}${filtersActive?' chk-mode':''}${selectedIds.size?' chk-mode':''}`}
      onMouseDown={e=>{ bodyClickGuard.current = { x: e.clientX, y: e.clientY }; }}
      onClick={e=>{
        setFilterOpen(false); setGroupOpen(false); setTbOverflowOpen(false);
        // Only treat as a "close-the-drawer click" if the pointer didn't
        // drift significantly between mousedown and mouseup. Pans on the
        // timeline canvas register as drags (>4px move) and should not
        // close the drawer/focus/selection.
        const a = bodyClickGuard.current;
        bodyClickGuard.current = null;
        if (a && (Math.abs(e.clientX - a.x) > 4 || Math.abs(e.clientY - a.y) > 4)) return;
        if(!e.target.closest('.card,.scard,.list-item,.side-panel,.lnav,.drawer,.bulk-bar,.dvv,.rt-view')) { setFocusedId(null); setRenamingId(null); setDrawerId(null); setSettingsOpen(false); if (!tweaks.calendarPinned) setTweak('calendarOpen',false); }
      }}>
      <LeftNav tasks={tasks} view={view} onSettings={openSettings} onView={v=>{setView(v);setSettingsOpen(false);setFilterOpen(false); if (isNarrowScreen) setNavCollapsed(true);}} collapsed={navCollapsed} theme={theme} width={Number(tweaks.navWidth)||196} onResizeStart={resizeNav}/>
      {isNarrowScreen && !navCollapsed && (
        <div className="lnav-scrim" onClick={()=>setNavCollapsed(true)}/>
      )}
      {view==='week' ? (
        <div className="board-area" ref={boardShellRef} style={{'--col-w':`${COL_W}px`}}>
          <InboxCol tasks={sidePanelCurrentTasks} theme={theme} tweaks={tweaks} focusedCardId={focusedId} spawning={spawning}
            selectedIds={selectedIds}
            renamingId={renamingId}
            width={Number(tweaks.inboxWidth)||340}
            collapsed={!!tweaks.inboxCollapsed}
            panelView={sidePanelView}
            onPanelView={v=>{setSidePanelView(v);setSettingsOpen(false);setFilterOpen(false);}}
            onCollapse={()=>setTweak('inboxCollapsed',!tweaks.inboxCollapsed)}
            onResizeStart={resizeSidePanel}
            onAdd={(colKey,date,arg3,arg4)=>{const isPos=arg3&&typeof arg3==='object';addTask(isPos?(colKey||'inbox'):'inbox',isPos?date:null,isPos?'Untitled':(arg3||'Untitled'),isPos?arg3:arg4);}}
            onOpen={openTask}
            onToggle={(id)=>completeTask(id,'inbox')}
            onDelete={deleteTask}
            onFocus={setFocusedId}
            onSelect={toggleSelected}
            onRename={updateTask}
            onRenameDone={()=>setRenamingId(null)}
            childrenOf={childrenOf} projectStats={projectStats}
            collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
            forceOpenProjects={forceOpenProjects}
            inboxFilters={inboxFilters} onCycleInboxFilter={cycleInboxFilter} onClearInboxFilters={clearInboxFilters} inboxFilterCount={inboxFilterCount}
            inboxGroupBy={inboxGroupBy} onInboxGroupBy={setInboxGroupBy}
            collapsedGrps={collapsedGrps}
            onToggleGrp={gk=>setCollapsedGrps(s=>{const ns=new Set(s);ns.has(gk)?ns.delete(gk):ns.add(gk);return ns;})}
            onWakeNow={(id)=>updateTask(id,{snoozedUntil:null,snoozedAt:null,snoozeMode:null,snoozeOffsetDays:null})}
            cardExtras={cardExtras}/>
          {tweaks.showProjectPanel && <ProjectSidePanel tasks={activeTasks}
            activeProjects={filters.projects}
            width={Number(tweaks.projectPanelWidth)||190}
            collapsed={!!tweaks.projectPanelCollapsed}
            stickyLeft={tweaks.inboxCollapsed?34:(Number(tweaks.inboxWidth)||340)}
            onCollapse={()=>setTweak('projectPanelCollapsed',!tweaks.projectPanelCollapsed)}
            onResizeStart={resizeSidePanel}
            onProjectToggle={id=>toggleFilter('projects',id)}/>}
          <div className="timeline-scroll" ref={boardRef} onMouseDown={onBoardMouseDown} onScroll={onBoardScroll}
            onWheel={()=>{userScrolledRef.current=true;}}
            onTouchStart={()=>{userScrolledRef.current=true;}}>
          {beforeTimelineSpacerWidth>0 && <div className="col-spacer" style={{width:beforeTimelineSpacerWidth}}/>}
          {renderTodayBefore && renderTimelineColumn(D.today(), 'sticky-')}
          {betweenTodayAndRenderWidth>0 && <div className="col-spacer" style={{width:betweenTodayAndRenderWidth}}/>}
          {renderDates.map(date=>renderTimelineColumn(date))}
          {betweenRenderAndTodayWidth>0 && <div className="col-spacer" style={{width:betweenRenderAndTodayWidth}}/>}
          {renderTodayAfter && renderTimelineColumn(D.today(), 'sticky-')}
          {afterTimelineSpacerWidth>0 && <div className="col-spacer" style={{width:afterTimelineSpacerWidth}}/>}
          </div>
        </div>
      ) : view==='routines' ? (
        <div className="board-area" style={{padding:0}}>
          <RoutinesView
            tasks={tasks}
            tweaks={tweaks}
            setTweak={(k,v)=>setTweak({[k]:v})}
            onJumpTo={(id)=>{ setView('week'); setDrawerId(id); setFocusedId(id); }}
          />
        </div>
      ) : view==='delegations' ? (
        <div className="board-area" style={{padding:'18px 24px'}}>
          <DelegationsView
            tasks={tasks}
            onJumpTo={(id, focus='delegation')=>{ setDrawerInitialFocus(focus); setDrawerId(id); setFocusedId(id); }}
            onUpdate={updateTask}
            onDelete={deleteTask}
            onCheckIn={(id, mode)=>{ const t=taskById(id); if(t && !t.done) completeTask(id, t.date||'inbox', mode); }}
            onChase={(id, text)=>{
              const t = taskById(id);
              if (!t) return;
              // Push to undo so a misfire is recoverable from the toast.
              setUndoStack(s=>[...s.slice(-9),{id,before:t}]);
              const now = new Date().toISOString();
              const activity = [...(t.activity||[]), { type:'chased', text: (text||'').trim() || undefined, at: now }];
              updateTask(id, { lastContactAt: now, activity });
            }}
            onTakeBack={(id)=>{
              // applyDelegationChanges fires when delegatedTo flips to null and
              // handles cleanup + date=today. Already pushes to undo stack.
              updateTask(id, { delegatedTo: null });
            }}
            onAddNote={(id, text)=>{
              const t = taskById(id);
              if (!t || !text || !text.trim()) return;
              setUndoStack(s=>[...s.slice(-9),{id,before:t}]);
              const activity = [...(t.activity||[]), { type:'note', text: text.trim(), at: new Date().toISOString() }];
              updateTask(id, { activity });
            }}
            onShowOnTimeline={()=>{
              setTweak('showDelegationsOnTimeline', true);
            }}
            showToast={showToast}
            onAddDelegation={()=>{
              // Legacy entry point — kept for right-click "Delegate to…" which
              // still uses the drawer. The Delegations view's inline composer
              // calls onCreateDelegation instead.
              const nt = makeTask({ title: '', date: D.str(D.today()) });
              setTasks(prev => [nt, ...prev]);
              setDrawerInitialFocus('delegation');
              setDrawerId(nt.id);
              setFocusedId(nt.id);
              setRenamingId(nt.id);
            }}
            onCreateDelegation={({ title, delegatedTo })=>{
              // Inline composer flow — create the task and run the delegation
              // transition in the SAME setTasks closure so applyDelegationChanges
              // sees the new task in `prev` (calling updateTask afterwards would
              // read stale closure tasks and bail).
              const nt = makeTask({ title: (title || '').trim(), date: D.str(D.today()) });
              const delName = (delegatedTo || '').trim();
              setTasks(prev => {
                const withNew = [nt, ...prev];
                const out = applyDelegationChanges(withNew, nt, { delegatedTo: delName });
                const base = out.tasks || withNew;
                return base.map(t => t.id === nt.id ? applyTaskPatch(t, out.mergedChanges) : t);
              });
              setUndoStack(s=>[...s.slice(-9),{id:nt.id, before:nt, isCreate:true}]);
              setFocusedId(nt.id);
              showToast(`Delegated to ${delName}`, { undoable: true, timeout: 4500 });
            }}
            showConfirm={(opts)=>setConfirmDialog(opts)}
            statusFilter={tweaks.delegationsStatusFilter}
            onStatusFilterChange={(v)=>setTweak('delegationsStatusFilter', v)}
            personFilter={tweaks.delegationsPersonFilter}
            onPersonFilterChange={(v)=>setTweak('delegationsPersonFilter', v)}
            dayFilter={tweaks.delegationsDayFilter}
            onDayFilterChange={(v)=>setTweak('delegationsDayFilter', v)}
            selectedId={tweaks.delegationsSelectedId}
            onSelectId={(v)=>setTweak('delegationsSelectedId', v)}/>
        </div>
      ) : view==='buckets' ? (
        <div className="board-area" style={{padding:0}}>
          <BucketsView
            tasks={activeTasks}
            buckets={tweaks.customGroups || []}
            applyFilters={applyFilters}
            tweaks={tweaks}
            theme={theme}
            selectedIds={selectedIds}
            onSelect={toggleSelected}
            onMarqueeStart={(e, root) => startMarquee(e, root)}
            focusedId={focusedId}
            setFocusedId={setFocusedId}
            renamingId={renamingId}
            setRenamingId={setRenamingId}
            spawningSet={spawning}
            recents={recents}
            onRecentTag={(v)=>pushRecent('tags', v)}
            onRecentProj={(v)=>pushRecent('projects', v)}
            onUpdateTask={updateTask}
            onAddTask={({ title, groupId }) => addTask('inbox', null, title || 'Untitled', { groupId })}
            onOpenCard={openTask}
            onContextMenu={onCardContextMenu}
            onComplete={(id)=>completeTask(id, taskById(id)?.date||'inbox')}
            onDelete={deleteTask}
            onBulkUpdate={bulkUpdateTasks}
            activeDrag={activeDrag}
            bucketColumnsMissing={bucketColumnsMissing()}
            noBucketPinned={tweaks.noBucketPinned !== false}
            noBucketCollapsed={!!tweaks.noBucketCollapsed}
            noBucketWidth={Number(tweaks.noBucketWidth) || 260}
            onNoBucketPin={() => setTweak('noBucketPinned', !tweaks.noBucketPinned)}
            onNoBucketCollapse={() => setTweak('noBucketCollapsed', !tweaks.noBucketCollapsed)}
            onNoBucketResizeStart={(e) => resizeSidePanel(e, 'nobucket')}
            onReorderBuckets={(orderIds) => {
              const byId = new Map((tweaks.customGroups || []).map(g => [g.id, g]));
              const next = orderIds.map(id => byId.get(id)).filter(Boolean);
              // Append any buckets not in the new order (defensive).
              for (const g of (tweaks.customGroups || [])) {
                if (!orderIds.includes(g.id)) next.push(g);
              }
              setTweak('customGroups', next);
            }}
            onRenameBucket={(id, name) => {
              setTweak('customGroups', (tweaks.customGroups || []).map(g => g.id === id ? { ...g, name } : g));
            }}
            onChangeBucketColor={(id, color) => {
              setTweak('customGroups', (tweaks.customGroups || []).map(g => g.id === id ? { ...g, color } : g));
            }}
            onDeleteBucket={(id) => {
              const bucket = (tweaks.customGroups || []).find(g => g.id === id);
              const affected = tasks.filter(t => t.groupId === id).map(t => ({ id: t.id, groupId: t.groupId, bucketPosition: t.bucketPosition }));
              setTweak('customGroups', (tweaks.customGroups || []).filter(g => g.id !== id));
              setTasks(prev => prev.map(t => t.groupId === id ? { ...t, groupId: null, bucketPosition: null } : t));
              setUndoStack(s => [...s.slice(-9), { bulk: true, kind: 'bucket-delete', bucket, affected }]);
              showToast(`Bucket "${bucket?.name || ''}" deleted`, { undoable: true, timeout: 5000 });
            }}
            onCreateBucket={(bucket) => {
              setTweak('customGroups', (tweaks.customGroups || []).concat(bucket));
            }}
          />
        </div>
      ) : view==='tags' ? (
        <div className="board-area" style={{padding:0}}>
          <TagsView
            tasks={activeTasks}
            tagTree={tweaks.tagTree || []}
            buckets={tweaks.customGroups || []}
            onUpdateTagTree={(updater) => {
              const prev = tweaks.tagTree || [];
              const next = typeof updater === 'function' ? updater(prev) : updater;
              setTweak('tagTree', Array.isArray(next) ? next : []);
            }}
            onOpenCard={openTask}
          />
        </div>
      ) : view==='stack' ? (
        <StackView
          tasks={stackOpenTopLevel}
          allTasks={activeTasks}
          tweaks={tweaks}
          setTweak={setTweak}
          onUpdate={updateTask}
          onComplete={(id)=>{ completeTask(id, taskById(id)?.date||'inbox'); showToast('Completed', {undoable:true, timeout:4500}); }}
          onDelete={deleteTask}
          onOpen={openTask}
          theme={theme}
          taxonomy={taxonomy}
          focusedId={focusedId}
          setFocusedId={setFocusedId}
          renamingId={renamingId}
          setRenamingId={setRenamingId}
          onContextMenu={onCardContextMenu}
          onAddNew={(opts)=>addTask('inbox', null, 'Untitled', opts || {})}
          navCollapsed={navCollapsed}
          onToggleNav={()=>setNavCollapsed(c=>!c)}
          selectedIds={selectedIds}
          onSelect={toggleSelected}
          onMarqueeStart={onStackMarqueeStart}
          renamingGroupId={renamingGroupId}
          onStartGroupRename={(id)=>setRenamingGroupId(id)}
          onGroupRenameDone={()=>setRenamingGroupId(null)}
          onRenameGroup={renameGroup}/>
      ) : view==='list' ? (
        <ListView title="List" tasks={allOpenTopLevel} tweaks={tweaks} onOpen={openTask} onFocus={setFocusedId}
          onSelect={toggleSelected} selectedIds={selectedIds}
          focusedCardId={focusedId} renamingId={renamingId} onRename={updateTask} onRenameDone={()=>setRenamingId(null)}
          onContextMenu={onCardContextMenu}/>
      ) : (
        <ListView title={viewTitle} tasks={listTasks()} tweaks={tweaks} onOpen={openTask} onFocus={setFocusedId}
          onSelect={toggleSelected} selectedIds={selectedIds}
          focusedCardId={focusedId} renamingId={renamingId} onRename={updateTask} onRenameDone={()=>setRenamingId(null)}
          onContextMenu={onCardContextMenu}/>
      )}
    </div>
    {selectedTasks.length>0 && (
      <div className="bulk-bar" onClick={e=>e.stopPropagation()}>
        <div className="bulk-count">
          {selectedTasks.length} selected
          <button className="bulk-count-x" onClick={clearSelection}
                  title="Clear selection (Esc)" aria-label="Clear selection">×</button>
        </div>
        <button className="tb-btn" onClick={selectBulkScope} disabled={!bulkScopeIds.length || allBulkScopeSelected}>
          {allBulkScopeSelected ? `All in ${bulkScopeLabel}` : `Select all in ${bulkScopeLabel}`}
        </button>
        <select className="bulk-select" defaultValue="" onChange={e=>{if(e.target.value){bulkSet({project:e.target.value},'Location updated');e.target.value='';}}}>
          <option value="">Location</option>
          {PROJ.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {/* Bucket bulk selector (replaces Life Area).
            Sets task.groupId. '__clear__' sets to null. */}
        <select className="bulk-select" defaultValue="" onChange={e=>{
          if(e.target.value){
            bulkSet({groupId:e.target.value==='__clear__'?null:e.target.value}, e.target.value==='__clear__'?'Bucket cleared':'Bucket updated');
            e.target.value='';
          }
        }}>
          <option value="">Bucket</option>
          {(tweaks.customGroups || []).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          <option value="__clear__">Clear</option>
        </select>
        <select className="bulk-select" defaultValue="" onChange={e=>{if(e.target.value){bulkSet({priority:e.target.value,pri:e.target.value},'Priority updated');e.target.value='';}}}>
          <option value="">Priority</option>
          <option value="p1">P1</option>
          <option value="p2">P2</option>
          <option value="p3">P3</option>
        </select>
        <select className="bulk-select" defaultValue="" onChange={e=>{bulkAddTag(e.target.value);e.target.value='';}}>
          <option value="">Add tag</option>
          {ALL_TAGS.map(t=><option key={t} value={t}>{TAG_NAMES[t]||t}</option>)}
        </select>
        <input className="bulk-input" type="date" aria-label="Start Date" title="Set Start Date" onChange={e=>{bulkSet({date:e.target.value||null}, e.target.value?'Start Date updated':'Moved to inbox'); e.target.value='';}}/>
        <button className="tb-btn" onClick={bulkGroupIntoProject} disabled={selectedTasks.length<2}>Group into project</button>
        <button className="tb-btn" onClick={groupSelected} disabled={selectedTasks.length<2}>Group</button>
        <button className="tb-btn" onClick={ungroupSelected} disabled={!selectedTasks.some(t=>t.groupId)}>Ungroup</button>
        <button className="tb-btn" onClick={()=>{
          const ts = new Date().toISOString();
          bulkUpdate(t=>({...t, done:true, completedAt:ts,
            ...((!t.date && !t.parentId) ? {date: todayKey} : {}),
            blocked:false, blockedReason:'', blockedBy:[], blockedSince:null, followUpAt:null,
            tags:(t.tags||[]).filter(x=>x!=='blocked')}), 'Marked done');
        }}>Done</button>
        <button className="tb-btn" onClick={()=>bulkSet({done:false,completedAt:null},'Reopened')}>Reopen</button>
        <button className="tb-btn" onClick={()=>{
          pushSnapshotUndo();
          selectedTasks.forEach(t => t.blocked ? clearBlocked(t.id,{noUndo:true}) : setBlocked(t.id,{noUndo:true}));
          setToast('Block toggled'); setTimeout(()=>setToast(null),1400);
        }}>Block / Unblock</button>
        <button className="tb-btn" onClick={()=>{bulkSet({archived:true,archivedAt:new Date().toISOString()},'Archived'); clearSelection();}}>Archive</button>
        <button className="tb-btn bulk-danger" onClick={bulkDelete}>Delete</button>
        <button className="tb-btn" onClick={clearSelection}>Clear all selected</button>
      </div>
    )}
    {marquee && (
      <div className="marquee-rect" style={{
        left:   Math.min(marquee.x0, marquee.x1),
        top:    Math.min(marquee.y0, marquee.y1),
        width:  Math.abs(marquee.x1 - marquee.x0),
        height: Math.abs(marquee.y1 - marquee.y0),
      }}/>
    )}
    </div>

    {/* STATUS BAR */}
    <div className="sbar">
      <div className="sbar-left">
        <span>{todayCount} remaining today · {allCount} total</span>
        <div className="sbar-sep"/>
        <span style={{color:'var(--accent)',fontFamily:'var(--mono)',fontSize:11.5,fontWeight:600}}>{activeTasks.filter(t=>!t.done&&!t.blocked&&(t.tags||[]).includes('focus')).length} focus blocks</span>
        {(() => {
          const n = activeTasks.filter(t=>t.blocked&&!t.done).length;
          if (!n) return null;
          return <><div className="sbar-sep"/><span className="sbar-blocked">{n} blocked</span></>;
        })()}
      </div>
      <div className="sbar-right">
        <span><kbd>J/K</kbd>nav</span><span><kbd>X</kbd>done</span><span><kbd>E</kbd>rename</span>
        <span><kbd>C</kbd>archive</span><span><kbd>B</kbd>block</span><span><kbd>[/]</kbd>move</span><span><kbd>⌘K</kbd>cmd</span><span><kbd>?</kbd>shortcuts</span>
      </div>
    </div>

    {/* DRAWER */}
    {drawerTask && <TaskDrawer task={drawerTask} theme={theme} tasks={tasks}
      secs={tweaks.drawerSecs || TM_DEFAULTS.drawerSecs}
      onSecsChange={(updater)=>setTweakState(prev=>{
        const cur = prev.drawerSecs || TM_DEFAULTS.drawerSecs;
        const next = typeof updater === 'function' ? updater(cur) : updater;
        return { ...prev, drawerSecs: next };
      })}
      buckets={tweaks.customGroups || []}
      onCreateBucket={(name)=>{
        const trimmed = (name || '').trim();
        if (!trimmed) return null;
        const id = `bk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        const swatch = taxonomyAutoSwatch((tweaks.customGroups || []).length, `bucket-${trimmed}`, 'Pastel');
        const bucket = { id, name: trimmed, color: swatch?.color || '#94a3b8' };
        setTweak('customGroups', (tweaks.customGroups || []).concat(bucket));
        return id;
      }}
      tagTree={tweaks.tagTree || []}
      onCreateTag={(name, parentId = null) => {
        const trimmed = (name || '').trim();
        if (!trimmed) return null;
        // mkTagId-style: slugify; collide-suffix on dupes. Inline here to
        // avoid importing the util into the App callsite for one use.
        const existing = new Set((tweaks.tagTree || []).map(n => n?.id).filter(Boolean));
        const base = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tag';
        const id = existing.has(base) ? `${base}-${Math.random().toString(36).slice(2, 6)}` : base;
        const swatch = taxonomyAutoSwatch((tweaks.tagTree || []).length, `tag-${trimmed}`, 'Pastel');
        const node = { id, name: trimmed, color: swatch?.color || null, parentId };
        setTweak('tagTree', (tweaks.tagTree || []).concat(node));
        return id;
      }}
      onUpdate={updateTask}
      onAddTaxonomy={(kind,label)=>taxonomyActions.add(kind,label)}
      onClose={()=>setDrawerId(null)}
      onDelete={deleteTask}
      onDuplicate={duplicateTask}
      onMoveToInbox={id=>updateTask(id,{date:null,someday:false,...clearSnoozePatch})}
      onSetBlocked={setBlocked}
      onClearBlocked={clearBlocked}
      recentBlockReasons={recentBlockReasons}
      blockingCountFor={blockingCountFor}
      onJumpTo={jumpToTaskHighlighted}
      onCheckIn={(id, mode)=>{ const t=taskById(id); if(t && !t.done) completeTask(id, t.date||'inbox', mode); }}
      onGoToCard={(id)=>{
        const t = taskById(id);
        if (!t) return;
        let top = t;
        const seen = new Set();
        while (top.parentId && !seen.has(top.id)) {
          seen.add(top.id);
          const p = taskById(top.parentId);
          if (!p) break;
          top = p;
        }
        let nextView;
        if (top.archived) nextView = 'archived';
        else if (top.someday) nextView = 'someday';
        else if (top.snoozedUntil) nextView = 'snoozed';
        else if (top.done) nextView = 'completed';
        else if (top.blocked) nextView = 'blocked';
        else if (top.date) nextView = 'week';
        else nextView = 'inbox';
        setView(nextView);
        setFocusedId(id);
        triggerGlow(id);
        if (nextView === 'week' && top.date) {
          const target = D.parse(top.date);
          const diffDays = Math.round((target - D.today()) / 86400000);
          if (diffDays < weekOff + 7) {
            const newWeekOff = Math.max(-TIMELINE_MAX_DAYS, diffDays - 30);
            const newDays = Math.min(TIMELINE_MAX_DAYS * 2, Math.max(timelineDays, weekOff + timelineDays - newWeekOff));
            setWeekOff(newWeekOff);
            setTimelineDays(newDays);
          } else if (diffDays > weekOff + timelineDays - 7) {
            setTimelineDays(Math.min(TIMELINE_MAX_DAYS * 2, Math.max(timelineDays, diffDays - weekOff + 30)));
          }
          pendingGoToDate.current = top.date;
          setGoToSeq(n => n + 1);
        }
      }}
      initialFocus={drawerInitialFocus}
      onInitialFocusConsumed={()=>setDrawerInitialFocus(null)}
      showToast={showToast}
      showConfirm={(opts)=>setConfirmDialog(opts)}
      fromLeft={drawerFromLeft}/>}
    {!drawerTask && !settingsOpen && <div className="drawer"/>}
    <SettingsDrawer open={settingsOpen} tweaks={tweaks} setTweak={setTweak} taxonomy={taxonomy} taxonomyActions={taxonomyActions} onClose={()=>setSettingsOpen(false)}/>

    {/* CALENDAR DRAWER — toggleable right-edge overlay */}
    {tweaks.calendarOpen && (
      <CalendarDrawer
        dateStr={calendarDateStr}
        events={visibleEvents}
        setEvents={setVisibleEvents}
        tasks={tasks}
        projectColor={calProjectColor}
        pxh={pxh} setPxh={setPxh}
        snapOn={snapOn} setSnapOn={setSnapOn}
        externalDrag={extDrag}
        onConsumeExternal={()=>{ extDragRef.current = null; }}
        onCancelExternal={()=>{ extDragRef.current = null; }}
        onAutoPlan={autoPlan}
        onPrev={()=>setCalendarDateStr(D.str(D.add(D.parse(calendarDateStr) || D.today(), -1)))}
        onNext={()=>setCalendarDateStr(D.str(D.add(D.parse(calendarDateStr) || D.today(), 1)))}
        onToday={()=>setCalendarDateStr(D.str(D.today()))}
        onClose={()=>setTweak('calendarOpen', false)}
        calendarWidth={Number(tweaks.calendarWidth)||460}
        onWidthChange={w=>setTweak('calendarWidth',w)}
        pinned={!!tweaks.calendarPinned}
        onTogglePin={()=>setTweak('calendarPinned', !tweaks.calendarPinned)}
        differentiateAutoBlocks={tweaks.differentiateAutoBlocks !== false}
        hideCompletedOnCalendar={!!tweaks.hideCompletedOnCalendar}
      />
    )}
    {extDrag && extDragRef.current && (
      <div
        className="drag-ghost"
        style={{ left: extDrag.clientX + 14, top: extDrag.clientY + 8 }}
      >
        <span
          className="drag-ghost-dot"
          style={{ background: calProjectColor(taskById(extDragRef.current.taskId)) }}
        />
        <span className="drag-ghost-title">{extDragRef.current.title}</span>
        <span className="drag-ghost-est">{fmtTimeEst(extDragRef.current.est)}</span>
      </div>
    )}

    {/* MODALS */}
    {palette && <CommandPalette onClose={()=>setPalette(false)} onCmd={onPaletteCmd}/>}
    {shortcuts && <ShortcutsOverlay onClose={()=>setShortcuts(false)}/>}
    <QuickEntry
      open={quickEntry}
      onClose={()=>setQuickEntry(false)}
      onSubmit={({date, title}) => {
        const colKey = date ? D.str(date) : 'inbox';
        addTask(colKey, date, title);
      }}
    />

    {confirmDialog && (
      <div className="overlay-bg" onClick={e=>{ if(e.target===e.currentTarget) confirmDialog.onCancel?.(); }}>
        <div className="confirm-dialog">
          <div className="confirm-msg">{confirmDialog.message}</div>
          <div className="confirm-acts">
            <button className="tb-btn" onClick={confirmDialog.onCancel}>Cancel</button>
            {confirmDialog.hold ? (
              <HoldButton onCommit={confirmDialog.onConfirm} ms={900}>
                {confirmDialog.confirmLabel || 'Hold to confirm'}
              </HoldButton>
            ) : (
              <button className="tb-btn primary" onClick={confirmDialog.onConfirm}>
                {confirmDialog.confirmLabel || 'Confirm'}
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    {toast && (
      <div className={`spawn-toast${toastUndoable?' undo-toast':''}`}>
        <span>{toast}</span>
        {toastUndoable && undoStack.length>0 && (
          <button onClick={()=>{ undo(); setToast(null); setToastUndoable(false); setToastAction(null); }}>Undo</button>
        )}
        {toastAction && (
          <button onClick={()=>{ toastAction.onClick?.(); setToast(null); setToastAction(null); }}>{toastAction.label}</button>
        )}
      </div>
    )}
    {contextMenu && (
      <ContextMenu x={contextMenu.x} y={contextMenu.y} items={ctxItems} onClose={()=>setContextMenu(null)}/>
    )}
    {cardColorPickerFor && (() => {
      const tk = tasks.find(t => t.id === cardColorPickerFor.id);
      return (
        <CardColorPopover
          x={cardColorPickerFor.x} y={cardColorPickerFor.y}
          value={tk?.cardColor}
          palette={tweaks.cardColorPalette || 'Sunset'}
          onChange={hex => updateTask(cardColorPickerFor.id, { cardColor: hex })}
          onClear={() => updateTask(cardColorPickerFor.id, { cardColor: null })}
          onClose={() => setCardColorPickerFor(null)}/>
      );
    })()}
    {stackPicker && (() => {
      const tk = tasks.find(t => t.id === stackPicker.id);
      if (!tk) return null;
      const close = () => setStackPicker(null);
      const change = (patch, recentVal) => {
        updateTask(stackPicker.id, patch);
        if (recentVal) {
          if ('tags' in patch) pushRecent('tags', recentVal);
          if ('project' in patch) pushRecent('projects', recentVal);
        } else if (patch.project) {
          pushRecent('projects', patch.project);
        }
      };
      let inner = null;
      if (stackPicker.field === 'tag') {
        inner = <TagPicker task={tk} theme={theme} recents={recents.tags}
          onChange={change} onAddTaxonomy={(kind,label)=>taxonomyActions.add(kind,label)} onClose={close}/>;
      } else if (stackPicker.field === 'proj') {
        inner = <ProjPicker task={tk} recents={recents.projects}
          onChange={change} onAddTaxonomy={(kind,label)=>taxonomyActions.add(kind,label)} onClose={close}/>;
      } else if (stackPicker.field === 'time') {
        inner = <TimePicker task={tk} onChange={change} onClose={close}/>;
      } else if (stackPicker.field === 'date') {
        inner = <DatePicker task={tk} onChange={change} onClose={close}/>;
      } else if (stackPicker.field === 'pri') {
        inner = <PriPicker task={tk} onChange={change} onClose={close}/>;
      } else if (stackPicker.field === 'snooze') {
        inner = <SnoozePicker task={tk} onChange={change} onClose={close}/>;
      }
      return <StackPickerPopover x={stackPicker.x} y={stackPicker.y} onClose={close}>{inner}</StackPickerPopover>;
    })()}
    {/* DragOverlay renders the floating ghost that tracks the cursor. dnd-kit's
        sortable strategy keeps the source card in its grid slot (snapping
        between slot positions as you drag past midpoints) — the overlay is
        what gives the cursor something smooth to follow. Source-tracking-the-
        cursor (Trello-style smooth FLIP) is not what dnd-kit's strategies do;
        the standard pattern across Linear / Notion / etc is faded source +
        floating ghost, and that's what we ship here. */}
    {/* dropAnimation={null}: the source card's own FLIP transition (styles.css
        :2275, transform 280ms cubic-bezier) already animates the card sliding
        into its new slot on drop. Letting the DragOverlay also animate the
        ghost from cursor back to that slot in parallel produces a visible
        double-flight (ghost + real card moving at once) that reads as "the
        card flies from somewhere above into position". Killing the overlay
        animation leaves only the source's slide, which is the polished part. */}
    <DragOverlay zIndex={9999} dropAnimation={null}>
      {activeDrag?.routineGhost ? (
        <div className="dnd-overlay-routine">
          <div className="dnd-or-title">{activeDrag.routineGhost.title}</div>
          <div className="dnd-or-meta">↻ → one-off · drop on a day</div>
        </div>
      ) : activeDrag?.srcHTML ? (
        <div className="dnd-overlay-ghost-wrap">
          <div className="dnd-overlay-ghost" dangerouslySetInnerHTML={{ __html: activeDrag.srcHTML }} />
          {activeDrag.multiCount > 1 && (
            <span className="bk-multi-badge" aria-label={`${activeDrag.multiCount} cards`}>
              +{activeDrag.multiCount - 1}
            </span>
          )}
        </div>
      ) : null}
    </DragOverlay>
    </SnoozeTickProvider>
  </DndContext>;
}

export default App;
