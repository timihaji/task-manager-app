import { TaskDrawer } from './drawer.jsx';
import { DelegationsView } from './delegations.jsx';
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
  syncTaskSnooze,
  rollTaskDateForward,
  rollIncompleteTasksToToday,
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
} from './lib/db.js';
// ── extracted utilities ──────────────────────────────────────────────────
import { I } from './utils/icons.jsx';
import { TIME_PRESETS, TIME_MORE, PRI_INFO, SNOOZE_OPTS } from './utils/constants.js';
import { parseNLDate } from './utils/parseNLDate.js';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useDndSensors, getInsertionIndex, compositeCollisionDetection } from './utils/dnd.js';
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
// ── extracted view components ────────────────────────────────────────────
import { ProjectSidePanel, LeftNav } from './components/sidebar.jsx';
import { CMDS, CommandPalette, SC_ROWS, ShortcutsOverlay } from './components/modals.jsx';
import { SwatchPicker, CardColorPopover, SettingsScrollPane, TaxonomyManager, PRESETS_DATA, SettingsView, SettingsDrawer } from './components/settings.jsx';
import { ListTaskItem, ListView } from './components/ListView.jsx';
import { StackView } from './components/StackView.jsx';
import { AddModal } from './components/AddModal.jsx';
import { QuickEntry } from './components/QuickEntry.jsx';
import { MigrateFromLocal } from './components/MigrateFromLocal.jsx';
import CalendarDrawer from './components/CalendarDrawer.jsx';
import { fetchAllEvents, upsertEvent, deleteEvent as deleteEventRow } from './lib/eventsDb.js';
import { currentMinOfDay } from './utils/timeOfDay.js';
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
  'snoozed', 'someday', 'blocked', 'completed', 'archived', 'delegations',
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
    calendarPxh:80, calendarSnap:true,
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
  const [tweaks, setTweakState] = useState(() => {
    let saved = null;
    try {
      const raw = localStorage.getItem('tm_tweaks_v1');
      if (raw) saved = JSON.parse(raw);
    } catch {}
    return { ...TM_DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
  });
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
  }, [workspaceId, userId]);

  // localStorage shadow of tweaks — mirrors the tasks/events pattern so a
  // refresh restores UI prefs (zoom, snap, drawer open state, etc.) even in
  // dev-bypass mode where there's no Supabase write.
  useEffect(() => {
    try { localStorage.setItem('tm_tweaks_v1', JSON.stringify(tweaks)); } catch {}
  }, [tweaks]);

  // Debounced cloud save of the settings blob.
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
          lastSyncedTasksRef.current = next;
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
          lastSyncedTasksRef.current = next;
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
        lastSyncedTasksRef.current = next;
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
  const [view,setView]       = useState(() => readSavedView() || 'week');
  const [sidePanelView,setSidePanelView] = useState('inbox');
  const [drawerId,setDrawerId]= useState(null);
  const [settingsOpen,setSettingsOpen]= useState(false);
  const [addModal,setAddModal]= useState(null); // {date,label}
  const [palette,setPalette] = useState(false);
  const [shortcuts,setShortcuts]=useState(false);
  const [quickEntry,setQuickEntry]=useState(false);
  const [filters,setFilters] = useState({projects:[],tags:[],lifeAreas:[],priorities:[]});
  // filterMode / globalGroupBy / inboxGroupBy live inside `tweaks` so they
  // ride the same cloud sync as the rest of the settings blob.
  const filterMode = tweaks.filterPrefs?.mode === 'or' ? 'or' : 'and';
  const setFilterMode = (m) => setTweak({ filterPrefs: { ...(tweaks.filterPrefs||{}), mode: m }});
  const [showWaitingOn,setShowWaitingOn] = useState(false);
  const [showStaleOnly,setShowStaleOnly] = useState(false);
  const [inboxFilters,setInboxFilters] = useState({projects:{},tags:{},lifeAreas:{},priorities:{}}); // val: 'inc' | 'exc'
  const [searchQuery,setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [filterOpen,setFilterOpen]=useState(false);
  const globalGroupBy = tweaks.groupPrefs?.global || 'project';
  const setGlobalGroupBy = (g) => setTweak({ groupPrefs: { ...(tweaks.groupPrefs||{}), global: g }});
  const [groupOpen,setGroupOpen] = useState(false);
  const inboxGroupBy = tweaks.groupPrefs?.inbox || 'none';
  const setInboxGroupBy = (g) => setTweak({ groupPrefs: { ...(tweaks.groupPrefs||{}), inbox: g }});
  const [collapsedGrps,setCollapsedGrps]=useState(new Set());
  const [completedOpen,setCompletedOpen]=useState(new Set()); // colKeys expanded
  const [blockedOpen,setBlockedOpen]=useState(()=>new Set()); // colKeys expanded for Blocked group
  const recentBlockReasons = Array.isArray(tweaks.recentBlockReasons) ? tweaks.recentBlockReasons : [];
  const setRecentBlockReasons = (updater) => {
    const prev = Array.isArray(tweaks.recentBlockReasons) ? tweaks.recentBlockReasons : [];
    const next = typeof updater === 'function' ? updater(prev) : updater;
    setTweak({ recentBlockReasons: next });
  };
  const [collapsedProjects,setCollapsedProjects]=useState(new Set());
  // dnd-kit drag state — single slot, replaces the five legacy HTML5 slots.
  const [activeDrag,setActiveDrag]=useState(null); // {id, kind, fromCol?}
  const [confirmDialog,setConfirmDialog]=useState(null); // {message, onConfirm}
  const [focusedId,setFocusedId]=useState(null);
  const [selectedIds,setSelectedIds]=useState(new Set());
  const [renamingId,setRenamingId]=useState(null);
  const [spawning,setSpawning]=useState(new Set());
  const [toast,setToast]     = useState(null);
  const [toastUndoable,setToastUndoable]=useState(false);
  const [undoStack,setUndoStack]=useState([]);
  const [navCollapsed,setNavCollapsed]=useState(() => window.innerWidth <= 640);
  const [isNarrowScreen,setIsNarrowScreen]=useState(() => window.innerWidth <= 640);
  const [tbOverflowOpen,setTbOverflowOpen]=useState(false);
  const [recents,setRecents] = useState({tags:[], projects:[]});
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

  useEffect(() => {
    const savedView = normalizeSavedView(view);
    if (!savedView) return;
    try {
      localStorage.setItem(LAST_VIEW_STORAGE_KEY, JSON.stringify(savedView));
    } catch {}
  }, [view]);

  const showToast = (msg, opts={}) => {
    setToast(msg);
    setToastUndoable(!!opts.undoable);
    if (opts.timeout !== 0) {
      const t = opts.timeout || 4500;
      setTimeout(() => { setToast(null); setToastUndoable(false); }, t);
    }
  };
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
      const merged = rollIncompleteTasksToToday(migrateTasks(seed));
      syncUidFromTasks(merged);
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
        const merged = rollIncompleteTasksToToday(migrateTasks(fetched));
        syncUidFromTasks(merged);
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

  // Auto-plan: greedy pack of unscheduled tasks into open slots between now
  // and 6pm. Mirrors the prototype's algorithm; only enabled when the
  // visible day is today.
  const autoPlan = useCallback(() => {
    const today = D.str(D.today());
    if (calendarDateStr !== today) return;
    const NOW = currentMinOfDay();
    const startFloor = Math.ceil(NOW / 15) * 15;
    const visible = events.filter(e => e.date === today);
    const scheduledIds = new Set(visible.map(e => e.taskId).filter(Boolean));
    const queue = tasks
      .filter(t => !t.done && !t.archived && t.cardType !== 'project'
        && !scheduledIds.has(t.id) && parseTimeEst(t.timeEstimate) > 0)
      .sort((a, b) => (a.priority || 'p3').localeCompare(b.priority || 'p3'));
    const busy = visible
      .map(e => [e.startMin, e.startMin + e.durationMin])
      .sort((a, b) => a[0] - b[0]);
    const fits = (s, len) => {
      if (s + len > 18 * 60) return false;
      return busy.every(([a, b]) => s + len <= a || s >= b);
    };
    let cursor = Math.max(startFloor, busy.length ? busy[busy.length - 1][1] : startFloor);
    const additions = [];
    for (const t of queue) {
      const len = parseTimeEst(t.timeEstimate);
      let s = cursor;
      while (!fits(s, len) && s < 18 * 60) s += 15;
      if (s + len > 18 * 60) break;
      const id = 'e' + Math.random().toString(36).slice(2, 8);
      additions.push({ id, taskId: t.id, date: today, startMin: s, durationMin: len });
      busy.push([s, s + len]);
      busy.sort((a, b) => a[0] - b[0]);
      cursor = s + len;
    }
    if (additions.length) setEvents(prev => [...prev, ...additions]);
  }, [calendarDateStr, events, tasks]);

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
    const next = rollIncompleteTasksToToday(tasks, todayKey);
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

  // localStorage shadow + debounced diff-sync of local mutations to Supabase.
  // Shadow runs in both dev-bypass and cloud modes so a refresh restores the
  // last task state (matches the events effect a few lines up). Cloud sync is
  // gated on userId/workspaceId — dev-bypass stops at the shadow.
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
      syncTaskDiff(prev, tasks, userId, workspaceId).catch((e) => {
        console.error('[tasks] sync failed', e);
      });
    }, 500);
    return () => clearTimeout(handle);
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
  const COL_W = Math.round(Math.max(220, Math.min(340, dayAreaWidth / dayWindowCount)));
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
  const renderTodaySeparately = !!todayPin && todayIdx >= 0 && (todayIdx < firstRenderCol || todayIdx >= lastRenderCol);
  const renderTodayBefore = renderTodaySeparately && todayIdx < firstRenderCol;
  const renderTodayAfter = renderTodaySeparately && todayIdx >= lastRenderCol;
  const beforeTimelineSpacerWidth = renderTodayBefore ? todayIdx * COL_W : beforeColsWidth;
  const betweenTodayAndRenderWidth = renderTodayBefore ? Math.max(0, (firstRenderCol - todayIdx - 1) * COL_W) : 0;
  const betweenRenderAndTodayWidth = renderTodayAfter ? Math.max(0, (todayIdx - lastRenderCol) * COL_W) : 0;
  const afterTimelineSpacerWidth = renderTodayAfter ? Math.max(0, (visibleDates.length - todayIdx - 1) * COL_W) : afterColsWidth;

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
    jumpToTodayAnchor(pendingTodayJumpBehavior.current);
    pendingTodayJump.current = false;
    pendingTodayJumpBehavior.current = 'auto';
    // Belt-and-suspenders: COL_W can shift on a follow-up render once the
    // board's width finishes settling, leaving scrollLeft pointing at the
    // wrong pixel offset (e.g. the user's "today" column ends up off-screen
    // on the right). Re-anchor on the next two animation frames using the
    // freshest COL_W via refs that update each render.
    const behavior = pendingTodayJumpBehavior.current === 'smooth' ? 'auto' : 'auto';
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
    if(filters.lifeAreas.length) {
      const lifeArea = getEffectiveLifeArea(t);
      activeAxes.push(filters.lifeAreas.some(id => id===UNASSIGNED_LIFE_AREA ? !lifeArea : lifeArea===id));
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
  const filtersActive = !!searchNeedle || filters.projects.length>0 || filters.tags.length>0 || filters.lifeAreas.length>0 || filters.priorities.length>0;

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
  // Disabled when `showWaitingOn` is on.
  const isAutoSnoozedDelegation = (t) => {
    if (showWaitingOn) return false;
    if (!t || !t.delegatedTo || t.done) return false;
    const ids = t.checkInTaskIds || [];
    if (!ids.length) return false;
    return ids.some(cid => {
      const ct = activeTasks.find(x => x.id === cid);
      return ct && !ct.done;
    });
  };
  const tasksByDate = useMemo(()=>{
    const map = new Map([['inbox', []]]);
    activeTasks.forEach(t=>{
      if(t.snoozedUntil) return;
      if(t.someday) return;
      if(t.parentId) return; // children render inside their project, not in a column
      if(isAutoSnoozedDelegation(t)) return;
      // Hide delegated tasks from the main board unless the user has explicitly
      // toggled the "Waiting on" filter to surface them. They live in the
      // Delegations view until undelegated.
      if(t.delegatedTo && !showWaitingOn) return;
      if(showWaitingOn && !t.delegatedTo && !t.checkInOf) return;
      if(showStaleOnly && !isStale(t)) return;
      const key = t.date || 'inbox';
      if(!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTasks, showWaitingOn, showStaleOnly]);
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
    const delegationOutcome = applyDelegationChanges(tasks, before, changes);
    if (delegationOutcome.tasks) {
      setUndoStack(s=>[...s.slice(-9),{id,before}]);
      setTasks(prev => delegationOutcome.tasks.map(t => t.id===id ? applyTaskPatch(t, delegationOutcome.mergedChanges) : t));
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
  const deleteTask = (id) => {
    const task = taskById(id); if(!task) return;
    // Project: promote children to the column instead of cascading delete.
    if(task.cardType === 'project') {
      const kids = tasks.filter(t=>t.parentId===id);
      pushSnapshotUndo();
      setTasks(prev => prev
        .filter(t=>t.id!==id)
        .map(t => t.parentId===id ? applyTaskPatch(t, { parentId:null, date: task.date || null }) : t));
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
    if(task.parentId) {
      pushSnapshotUndo();
      setTasks(prev => prev
        .filter(t=>t.id!==id)
        .map(t => t.id===task.parentId ? {...t, childOrder:(t.childOrder||[]).filter(cid=>cid!==id)} : t));
    } else {
      setUndoStack(s=>[...s.slice(-9),{id,before:task,deleted:true}]);
      setTasks(prev=>prev.filter(t=>t.id!==id));
    }
    setSelectedIds(prev=>{const next=new Set(prev);next.delete(id);return next;});
    if(drawerId===id) setDrawerId(null);
    if(focusedId===id) setFocusedId(null);
    showToast(`Deleted "${(task.title||'Task').slice(0,40)}"`, {undoable:true});
  };
  const archiveTask = (id) => {
    const task=taskById(id); if(!task) return;
    // Project: cascade archive to all children.
    if(task.cardType==='project') {
      const now = new Date().toISOString();
      pushSnapshotUndo();
      setTasks(prev=>prev.map(t=>{
        if(t.id===id || t.parentId===id) return {...t, archived:true, archivedAt:now};
        return t;
      }));
    } else {
      setUndoStack(s=>[...s.slice(-9),{id,before:task}]);
      setTasks(prev=>prev.map(t=>t.id===id?{...t,archived:true,archivedAt:new Date().toISOString()}:t));
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
      if (completedTask.expiryTaskId) {
        const exp = prev.find(x => x.id === completedTask.expiryTaskId);
        if (exp && !exp.done) pendingIds.add(completedTask.expiryTaskId);
      }
      if (pendingIds.size) {
        return {
          tasks: prev.filter(t => !pendingIds.has(t.id)),
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
        activity: [{type:'created',at:now}],
      }));
      kids.forEach(k => additions.push(syncTaskSnooze({
        ...k,
        id: idMap.get(k.id),
        parentId: newProjectId,
        done: false, completedAt: null,
        dueDate: shiftDueDateForRecurrence(k, k.date || nextDate),
        activity: [{type:'created',at:now}],
      })));
    } else {
      additions.push(syncTaskSnooze({
        ...task, id: mkid(),
        done:false, completedAt:null,
        date: nextDate,
        dueDate: shiftDueDateForRecurrence(task, nextDate),
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
      if(nowDone && task.parentId) {
        const siblings = next.filter(t=>t.parentId===task.parentId);
        const allDone = siblings.length > 0 && siblings.every(s=>s.done);
        if(allDone) {
          next = next.map(t => t.id===task.parentId && !t.done ? {...t, done:true, completedAt:ts} : t);
        }
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
    if(nowDone && task.recurrence && task.date) {
      const nextDate=nextOccurrence(task,task.date);
      if(nextDate) {
        setTasks(prev => {
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
    const key = panel==='inbox' ? 'inboxWidth' : 'projectPanelWidth';
    const startX = e.clientX;
    const startWidth = Number(tweaks[key]) || (panel==='inbox'?340:190);
    const min = panel==='inbox'?132:140;
    const max = panel==='inbox'?340:360;
    const onMove = ev => setTweak(key, Math.max(min, Math.min(max, startWidth + ev.clientX - startX)));
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
  const computePosition = (above, below) => {
    const A = above && Number.isFinite(above.position) ? above.position : null;
    const B = below && Number.isFinite(below.position) ? below.position : null;
    if (A == null && B == null) return 1;
    if (A == null) return B - 1;
    if (B == null) return A + 1;
    if (Math.abs(B - A) < 1e-9) return A + 0.5; // gap collapsed; rare
    return (A + B) / 2;
  };

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
      const step = (B - A) / (count + 1);
      for (let i = 0; i < count; i++) out.push(A + step * (i + 1));
    } else if (A != null) {
      for (let i = 0; i < count; i++) out.push(A + i + 1);
    } else if (B != null) {
      const start = B - count;
      for (let i = 0; i < count; i++) out.push(start + i + 1);
    } else {
      for (let i = 0; i < count; i++) out.push(i + 1);
    }
    return out;
  };

  const reorderManyInDate = (taskIds, dateKey, anchorId) => {
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
      const anchorIdxInCol = anchorTask ? inCol.indexOf(anchorTask) : inCol.length;
      const above = anchorIdxInCol > 0 ? inCol[anchorIdxInCol - 1] : null;
      const below = anchorTask;
      const positions = computeGroupPositions(above, below, movedOrdered.length);
      const patched = movedOrdered.map((t, i) => ({...t, date: dateKey, parentId: null, position: positions[i]}));
      const insertAt = anchorTask
        ? remaining.indexOf(anchorTask)
        : (inCol.length ? remaining.indexOf(inCol[inCol.length - 1]) + 1 : remaining.length);
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

  const reorderManyToInbox = (taskIds, anchorId) => {
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
      const anchorIdxInInbox = anchorTask ? inbox.indexOf(anchorTask) : inbox.length;
      const above = anchorIdxInInbox > 0 ? inbox[anchorIdxInInbox - 1] : null;
      const below = anchorTask;
      const positions = computeGroupPositions(above, below, movedOrdered.length);
      const patched = movedOrdered.map((t, i) => ({...t, date: null, parentId: null, position: positions[i]}));
      const insertAt = anchorTask
        ? remaining.indexOf(anchorTask)
        : (inbox.length ? remaining.indexOf(inbox[inbox.length - 1]) + 1 : remaining.length);
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
    try {
      const el = document.querySelector(`[data-card-id="${srcId}"]`);
      if (el) {
        // Measure the source card so the destination gap is exactly its height.
        document.body.style.setProperty('--drag-card-h', el.offsetHeight + 'px');
        const clone = el.cloneNode(true);
        clone.removeAttribute('style');
        clone.classList.remove('is-dragging','dragging','focused','selected','spawning','card-drop-target');
        srcHTML = clone.outerHTML;
      }
    } catch {}
    // fromCol mirrors the card's column for the §09 cross-column arming check.
    // null date → inbox; 'stack-task' source has no date so we fall back to inbox.
    const fromCol = data.date != null ? data.date : 'inbox';
    setActiveDrag({ id: srcId, kind: data.kind || 'task', fromCol, srcHTML });
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
      if (oData.kind === 'task' || oData.kind === 'stack-task') overCol = oData.date != null ? oData.date : 'inbox';
      else if (oData.kind === 'column') overCol = oData.date != null ? oData.date : 'inbox';
    }
    const fromCol = document.body.dataset.fromCol;
    // Clear all current armed wrappers first
    document.querySelectorAll('.col-armed').forEach(el => el.classList.remove('col-armed'));
    if (overCol && overCol !== fromCol) {
      document.body.dataset.armedCol = overCol;
      const sel = overCol === 'inbox'
        ? '.side-panel.inbox-col[data-col-key="inbox"]'
        : `.col[data-col-key="${CSS.escape(overCol)}"]`;
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
    if (oData.kind !== 'task' && oData.kind !== 'stack-task') return;

    let sameContext = false;
    if (aData.kind === 'stack-task' && oData.kind === 'stack-task') {
      sameContext = true; // single SortableContext for the entire Stack
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
        if (targetDate == null) {
          reorderManyToInbox(srcIds, anchorId);
        } else {
          // Detect drag-into-past BEFORE reorder so we read pre-move task state.
          // Skip projects with open kids — completeTask would pop a confirm modal mid-drag.
          const past = D.isPast(targetDate);
          reorderManyInDate(srcIds, targetDate, anchorId);
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
      if(e.key==='Escape'){ setRenamingId(null); setDrawerId(null); setSettingsOpen(false); setFocusedId(null); setPalette(false); setShortcuts(false); setQuickEntry(false); setAddModal(null); setFilterOpen(false); clearSelection(); return; }
      if(inInput) return;
      if(e.key==='?'){ setShortcuts(s=>!s); return; }
      const flatNav = view==='stack' || view==='list' || view==='inbox' || view==='upcoming' || view==='backlog' || view==='snoozed' || view==='someday' || view==='blocked' || view==='completed' || view==='archived' || view?.type==='project' || view?.type==='tag' || view?.type==='lifeArea';
      if(e.key==='j'||e.key==='J'){ flatNav ? moveFocusInFlat(1) : moveFocusInCol(1); }
      if(e.key==='k'||e.key==='K'){ flatNav ? moveFocusInFlat(-1) : moveFocusInCol(-1); }
      if(e.key==='ArrowRight'){ if(!flatNav) moveFocusToCol(1); else moveFocusInFlat(1); }
      if(e.key==='ArrowLeft'){ if(!flatNav) moveFocusToCol(-1); else moveFocusInFlat(-1); }
      if((e.key==='x'||e.key==='X')&&focusedId){ const t=taskById(focusedId); if(t) completeTask(t.id,t.date||'inbox'); }
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
    setFilters(f=>({ ...f, [key]: f[key].includes(val)?f[key].filter(x=>x!==val):[...f[key],val] }));
  };
  const activeFilterPills = [
    ...filters.projects.map(p=>({key:'projects',val:p,label:PROJ.find(x=>x.id===p)?.label||p})),
    ...filters.tags.map(t=>({key:'tags',val:t,label:TAG_NAMES[t]||t})),
    ...filters.lifeAreas.map(a=>({key:'lifeAreas',val:a,label:lifeAreaOptionLabel(a)})),
    ...filters.priorities.map(p=>({key:'priorities',val:p,label:{p1:'P1',p2:'P2',p3:'P3'}[p]||p})),
  ];

  // view title
  const timelineStartDate = visibleDates[0] || D.today();
  const timelineEndDate = visibleDates[visibleDates.length-1] || D.today();
  const timelineTitle = `Timeline ${MONTH_S[timelineStartDate.getMonth()]} ${timelineStartDate.getDate()} - ${timelineStartDate.getMonth()!==timelineEndDate.getMonth()?MONTH_S[timelineEndDate.getMonth()]+' ':''}${timelineEndDate.getDate()}, ${timelineEndDate.getFullYear()}`;
  const viewTitle = view==='week'?timelineTitle:view==='stack'?'Stack':view==='list'?'List':view==='inbox'?'Inbox':view==='upcoming'?'Upcoming':view==='backlog'?'Backlog':view==='snoozed'?'Snoozed':view==='someday'?'Someday':view==='blocked'?'Blocked':view==='completed'?'Completed':view==='archived'?'Archived':view==='delegations'?'Delegations':view?.type==='project'?PROJ.find(p=>p.id===view.id)?.label||'Location':view?.type==='tag'?TAG_NAMES[view.name]||view.name:view?.type==='lifeArea'?lifeAreaOptionLabel(view.id):'Tasks';

  // Stack/List task pool — all open top-level tasks, ignoring topbar pill filters by design.
  // Search still applies so users can find tasks in these views.
  const allOpenTopLevel = activeTasks.filter(t=>!t.done&&!t.parentId&&!t.snoozedUntil&&!t.delegatedTo&&!t.checkInOf&&taskMatchesSearch(t));
  const stackOpenTopLevel = allOpenTopLevel.filter(t=>!t.someday);

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
    const incA = Object.entries(inboxFilters.lifeAreas).filter(([,v])=>v==='inc').map(([k])=>k);
    const excA = Object.entries(inboxFilters.lifeAreas).filter(([,v])=>v==='exc').map(([k])=>k);
    const incPri = Object.entries(inboxFilters.priorities).filter(([,v])=>v==='inc').map(([k])=>k);
    const excPri = Object.entries(inboxFilters.priorities).filter(([,v])=>v==='exc').map(([k])=>k);
    if(!incP.length && !excP.length && !incT.length && !excT.length && !incA.length && !excA.length && !incPri.length && !excPri.length) return list;
    return list.filter(t => {
      const proj = t.project || '_none';
      const tags = t.tags || [];
      const lifeArea = getEffectiveLifeArea(t);
      const pri = t.pri || t.priority || 'p3';
      if(incP.length && !incP.includes(proj)) return false;
      if(excP.length && excP.includes(proj)) return false;
      if(incT.length && !tags.some(tg=>incT.includes(tg))) return false;
      if(excT.length && tags.some(tg=>excT.includes(tg))) return false;
      if(incA.length && !incA.some(id => id===UNASSIGNED_LIFE_AREA ? !lifeArea : lifeArea===id)) return false;
      if(excA.length && excA.some(id => id===UNASSIGNED_LIFE_AREA ? !lifeArea : lifeArea===id)) return false;
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
  const clearInboxFilters = () => setInboxFilters({projects:{},tags:{},lifeAreas:{},priorities:{}});
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
  const openSettings = () => { setDrawerId(null); setRenamingId(null); setSettingsOpen(s=>!s); };
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
    if (e.target.closest('.card,.col-add,.col-groupby,.col-groupby-wrap,.card-add-zone,.side-panel,.col-hdr,.grp-hdr,.done-grp-hdr,.tb-btn,.lnav-item,.drawer')) return;
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
      const dx = Math.abs(el.scrollLeft - boardMetrics.scrollLeft);
      const layoutChanged = newWidth !== boardMetrics.width || newBoardWidth !== boardMetrics.boardWidth;
      const COL_HALF = (typeof COL_W === 'number' ? COL_W : 240) / 2;
      if (!layoutChanged && dx < COL_HALF) return;
      setBoardMetrics({scrollLeft:el.scrollLeft, width:newWidth, boardWidth:newBoardWidth});
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
    const pinClass = colKey===todayStr && todayPin ? `today-pinned pin-${todayPin}` : '';
    return <Column key={`${keyPrefix}${colKey}`} className={pinClass} date={date} tasks={colTasks}
      focusedCardId={focusedId} selectedIds={selectedIds} spawning={spawning} theme={theme} tweaks={tweaks}
      renamingId={renamingId}
      groupBy={globalGroupBy}
      collapsedGrps={collapsedGrps}
      completedOpen={completedOpen.has(colKey)}
      blockedOpen={blockedOpen.has(colKey)}
      onToggleGrp={gk=>setCollapsedGrps(s=>{const ns=new Set(s);ns.has(gk)?ns.delete(gk):ns.add(gk);return ns;})}
      onToggleCompleted={ck=>setCompletedOpen(s=>{const ns=new Set(s);ns.has(ck)?ns.delete(ck):ns.add(ck);return ns;})}
      onToggleBlocked={ck=>setBlockedOpen(s=>{const ns=new Set(s);ns.has(ck)?ns.delete(ck):ns.add(ck);return ns;})}
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
          onClick={()=>setTweak('calendarOpen', !tweaks.calendarOpen)}
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
            Group: {{none:'None',project:'Location',lifeArea:'Life Area',tag:'Tag',priority:'Priority'}[globalGroupBy]||'Location'}
          </button>
          {groupOpen && (
            <div className="filter-dd" style={{minWidth:140}}>
              {[{v:'project',l:'Location'},{v:'lifeArea',l:'Life Area'},{v:'tag',l:'Tag'},{v:'priority',l:'Priority'},{v:'none',l:'None'}].map(o=>(
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
            <div className="fdd-section">
              <div className="fdd-label">Life Area</div>
              {taxonomy.lifeAreas.map(area=><div key={area.id} className="fdd-item" onClick={()=>toggleFilter('lifeAreas',area.id)}><input type="checkbox" readOnly checked={filters.lifeAreas.includes(area.id)}/>{area.label}</div>)}
              <div className="fdd-item" onClick={()=>toggleFilter('lifeAreas',UNASSIGNED_LIFE_AREA)}><input type="checkbox" readOnly checked={filters.lifeAreas.includes(UNASSIGNED_LIFE_AREA)}/>Unassigned</div>
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
        <button className="tb-btn" onClick={()=>setShowWaitingOn(v=>!v)}
          title="Show only delegated tasks"
          aria-pressed={showWaitingOn}
          aria-label="Show only delegated tasks (Waiting)"
          style={showWaitingOn?{color:'var(--accent)'}:undefined}><I.Clock/>Waiting</button>
        <button className="tb-btn" onClick={()=>setShowStaleOnly(v=>!v)}
          title="Show only stale delegations"
          aria-pressed={showStaleOnly}
          aria-label="Show only stale delegations"
          style={showStaleOnly?{color:'var(--danger)'}:undefined}><I.Warn/>Stale</button>
        <button className="tb-btn" onClick={()=>setView('delegations')}
          title="Delegations dashboard"
          aria-pressed={view==='delegations'}
          aria-label="Open delegations dashboard"
          style={view==='delegations'?{color:'var(--accent)'}:undefined}><I.Deleg/>Delegations</button>
      </div>
      <button className="tb-btn" onClick={()=>setTweak('inboxCollapsed',!tweaks.inboxCollapsed)} title="Toggle inbox panel"><I.Inbox/>Inbox</button>
      <button className="tb-btn" onClick={openSettings} title="Settings">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Settings
      </button>
      <button className="tb-btn" onClick={()=>setPalette(true)}><I.Search/>⌘K</button>
      <div className="tb-sep"/>
      <button className="tb-icon-btn" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} title="Toggle theme (L)">
        {theme==='dark'?<I.Sun/>:<I.Moon/>}
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
              <div className="fdd-item" onClick={()=>{setShowWaitingOn(v=>!v);setTbOverflowOpen(false);}}>
                <input type="checkbox" readOnly checked={showWaitingOn}/>Waiting on others
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
    <div className={`app-body${isNarrowScreen?' is-mobile':''}${filtersActive?' chk-mode':''}${selectedIds.size?' chk-mode':''}`} onClick={e=>{ setFilterOpen(false); setGroupOpen(false); setTbOverflowOpen(false); if(!e.target.closest('.card,.scard,.list-item,.side-panel,.lnav,.drawer,.bulk-bar')) { setFocusedId(null); setRenamingId(null); setDrawerId(null); setSettingsOpen(false); } }}>
      <LeftNav tasks={tasks} view={view} onSettings={openSettings} onView={v=>{setView(v);setSettingsOpen(false);setFilterOpen(false); if (isNarrowScreen) setNavCollapsed(true);}} collapsed={navCollapsed} theme={theme}
        activeLifeAreas={filters.lifeAreas}
        onLifeAreaToggle={id=>toggleFilter('lifeAreas',id)}/>
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
      ) : view==='delegations' ? (
        <div className="board-area" style={{padding:'18px 24px'}}>
          <DelegationsView
            tasks={tasks}
            onJumpTo={(id)=>{ setView('week'); setDrawerId(id); setFocusedId(id); }}
            onUpdate={updateTask}
            onDelete={deleteTask}
            onCheckIn={(id, mode)=>{ const t=taskById(id); if(t && !t.done) completeTask(id, t.date||'inbox', mode); }}/>
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
        <ListView title="List" tasks={allOpenTopLevel} onOpen={openTask} onFocus={setFocusedId}
          onSelect={toggleSelected} selectedIds={selectedIds}
          focusedCardId={focusedId} renamingId={renamingId} onRename={updateTask} onRenameDone={()=>setRenamingId(null)}
          onContextMenu={onCardContextMenu}/>
      ) : (
        <ListView title={viewTitle} tasks={listTasks()} onOpen={openTask} onFocus={setFocusedId}
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
        <select className="bulk-select" defaultValue="" onChange={e=>{
          if(e.target.value){
            bulkSet({lifeArea:e.target.value===UNASSIGNED_LIFE_AREA?null:e.target.value}, e.target.value===UNASSIGNED_LIFE_AREA?'Life Area cleared':'Life Area updated');
            e.target.value='';
          }
        }}>
          <option value="">Life Area</option>
          {taxonomy.lifeAreas.map(area=><option key={area.id} value={area.id}>{area.label}</option>)}
          <option value={UNASSIGNED_LIFE_AREA}>Clear</option>
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
      onJumpTo={(id)=>{ setDrawerId(id); setFocusedId(id); }}
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
        pxh={tweaks.calendarPxh}
        setPxh={(v) => setTweakState(prev => ({ ...prev, calendarPxh: typeof v === 'function' ? v(prev.calendarPxh) : v }))}
        snapOn={tweaks.calendarSnap}
        setSnapOn={(v) => setTweakState(prev => ({ ...prev, calendarSnap: typeof v === 'function' ? v(prev.calendarSnap) : v }))}
        externalDrag={extDrag}
        onConsumeExternal={()=>{ extDragRef.current = null; }}
        onCancelExternal={()=>{ extDragRef.current = null; }}
        onAutoPlan={autoPlan}
        onPrev={()=>setCalendarDateStr(D.str(D.add(D.parse(calendarDateStr) || D.today(), -1)))}
        onNext={()=>setCalendarDateStr(D.str(D.add(D.parse(calendarDateStr) || D.today(), 1)))}
        onToday={()=>setCalendarDateStr(D.str(D.today()))}
        onClose={()=>setTweak('calendarOpen', false)}
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
          <button onClick={()=>{ undo(); setToast(null); setToastUndoable(false); }}>Undo</button>
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
      {activeDrag?.srcHTML ? (
        <div className="dnd-overlay-ghost" dangerouslySetInnerHTML={{ __html: activeDrag.srcHTML }} />
      ) : null}
    </DragOverlay>
  </DndContext>;
}

export default App;
