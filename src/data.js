// Task Manager — shared constants, helpers, data
// All exports available on window.*

const PROJ = [
  { id:'LIFE',  label:'Life',  color:'#86efac' },
  { id:'HOME',  label:'Home',  color:'#fcd34d' },
  { id:'WORK',  label:'Work',  color:'#a5b4fc' },
  { id:'ADMIN', label:'Admin', color:'#94a3b8' },
];

const ALL_TAGS = ['sunsama','work','focus','mtg','health','code','docs','comm','admin','learn','blocked'];

const TAG_NAMES = {
  sunsama:'Sunsama', work:'Work', focus:'Deep Focus', mtg:'Meeting', health:'Health',
  code:'Code', docs:'Docs', comm:'Comms', admin:'Admin',
  learn:'Learning', blocked:'Blocked',
};

const TAG_DARK = {
  sunsama:{bg:'rgba(14,165,233,.15)',fg:'#7dd3fc'},
  work:{bg:'rgba(99,102,241,.15)',fg:'#a5b4fc'},
  health:{bg:'rgba(34,197,94,.15)',fg:'#86efac'},
  mtg:{bg:'rgba(168,85,247,.15)',fg:'#d8b4fe'},
  focus:{bg:'rgba(245,158,11,.15)',fg:'#fcd34d'},
  code:{bg:'rgba(236,72,153,.15)',fg:'#f9a8d4'},
  docs:{bg:'rgba(148,163,184,.15)',fg:'#cbd5e1'},
  comm:{bg:'rgba(239,68,68,.15)',fg:'#fca5a5'},
  admin:{bg:'rgba(100,116,139,.15)',fg:'#94a3b8'},
  learn:{bg:'rgba(20,184,166,.15)',fg:'#5eead4'},
  blocked:{bg:'rgba(245,158,11,.18)',fg:'#fcd34d'},
};

const TAG_LIGHT = {
  sunsama:{bg:'#e0f2fe',fg:'#0369a1'},
  work:{bg:'#eef2ff',fg:'#4f46e5'},
  health:{bg:'#f0fdf4',fg:'#15803d'},
  mtg:{bg:'#faf5ff',fg:'#7c3aed'},
  focus:{bg:'#fffbeb',fg:'#b45309'},
  code:{bg:'#fdf2f8',fg:'#9d174d'},
  docs:{bg:'#f1f5f9',fg:'#475569'},
  comm:{bg:'#fef2f2',fg:'#b91c1c'},
  admin:{bg:'#f8fafc',fg:'#64748b'},
  learn:{bg:'#f0fdfa',fg:'#0f766e'},
  blocked:{bg:'#fffbeb',fg:'#b45309'},
};

const LIFE_AREAS = ['health','family','career','finance','growth','relationships','hobbies','admin'];

const LIFE_AREA_NAMES = {
  health:'Health',
  family:'Family',
  career:'Career',
  finance:'Finance',
  growth:'Personal Growth',
  relationships:'Relationships',
  hobbies:'Hobbies',
  admin:'Admin',
};

const LIFE_AREA_DARK = {
  health:{bg:'rgba(34,197,94,.15)',fg:'#86efac'},
  family:{bg:'rgba(244,63,94,.15)',fg:'#fda4af'},
  career:{bg:'rgba(99,102,241,.15)',fg:'#a5b4fc'},
  finance:{bg:'rgba(245,158,11,.15)',fg:'#fcd34d'},
  growth:{bg:'rgba(20,184,166,.15)',fg:'#5eead4'},
  relationships:{bg:'rgba(168,85,247,.15)',fg:'#d8b4fe'},
  hobbies:{bg:'rgba(236,72,153,.15)',fg:'#f9a8d4'},
  admin:{bg:'rgba(100,116,139,.15)',fg:'#94a3b8'},
};

const LIFE_AREA_LIGHT = {
  health:{bg:'#f0fdf4',fg:'#15803d'},
  family:{bg:'#fff1f2',fg:'#be123c'},
  career:{bg:'#eef2ff',fg:'#4f46e5'},
  finance:{bg:'#fffbeb',fg:'#b45309'},
  growth:{bg:'#f0fdfa',fg:'#0f766e'},
  relationships:{bg:'#faf5ff',fg:'#7c3aed'},
  hobbies:{bg:'#fdf2f8',fg:'#9d174d'},
  admin:{bg:'#f8fafc',fg:'#64748b'},
};

const LIFE_AREA_KEYWORDS = {
  health:['gym','run','running','doctor','sleep','workout','protein','vet','medical','appointment','walk'],
  family:['mom','mum','dad','parent','parents','kids','child','family','dinner','birthday','school'],
  career:['meeting','deadline','client','proposal','review','workshop','launch','roadmap','project','career'],
  finance:['bill','bills','invoice','tax','rates','budget','budgeting','refund','payment','pay','bank'],
  growth:['course','study','learn','learning','read','practice','journal','reflect','therapy','coach'],
  relationships:['date','partner','wife','husband','girlfriend','boyfriend','friend','friends','call','message'],
  hobbies:['game','gaming','paint','music','guitar','car','rx7','photography','photo','cook','cooking'],
  admin:['admin','email','triage','forms','paperwork','renew','renewal','insurance','booking','book'],
};

const suggestLifeAreaFromTitle = (title='') => {
  const hay = String(title || '').toLowerCase();
  if (!hay.trim()) return null;
  for (const id of Object.keys(LIFE_AREA_KEYWORDS)) {
    const words = LIFE_AREA_KEYWORDS[id] || [];
    if (words.some(word => hay.includes(word.toLowerCase()))) return id;
  }
  return null;
};

const defaultLifeAreaForLocation = (projectId, taxonomy) => {
  const contexts = Array.isArray(taxonomy?.contexts) ? taxonomy.contexts : [];
  const match = contexts.find(ctx => ctx.id === projectId);
  return match?.defaultLifeArea || null;
};

let _uid = 500;
const mkid = () => `t${_uid++}`;
const syncUidFromTasks = (tasks=[]) => {
  const maxId = tasks.reduce((max, task) => {
    const n = Number(String(task?.id || '').replace(/^t/, ''));
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, _uid - 1);
  _uid = Math.max(_uid, maxId + 1);
};

const D = {
  today: () => { const d=new Date(); d.setHours(0,0,0,0); return d; },
  str:   (d) => { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; },
  add:   (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; },
  parse: (s) => new Date(s+'T00:00:00'),
  isPast:(s) => { if (!s) return false; const t=D.today(); return D.parse(s)<t; },
  isTdy: (s) => { if (!s) return false; return s===D.str(D.today()); },
  isFut: (s) => { if (!s) return false; const t=D.today(); return D.parse(s)>t; },
};

// offset is a day offset from today (not weeks)
const getWeekDays = (offset=0, length=7) => {
  const td=D.today();
  const start=D.add(td, offset);
  return Array.from({length},(_,i)=>D.add(start,i));
};

const MONTH_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_S   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_L   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const fmtWeek = (dates) => {
  const a=dates[0], b=dates[6];
  return `${MONTH_S[a.getMonth()]} ${a.getDate()} - ${a.getMonth()!==b.getMonth()?MONTH_S[b.getMonth()]+' ':''}${b.getDate()}, ${b.getFullYear()}`;
};

// Map of day-code -> JS getDay() index for byDay handling. Codes are stored
// lowercase 3-letter for stability across UI and JSON.
const DAY_INDEX = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
const DAY_CODES = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_CODE_S = { sun:'Sun', mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat' };

const lastDayOfMonth = (y, m) => new Date(y, m + 1, 0).getDate();

// Decide whether a recurrence pattern should default to routine treatment.
// Daily/weekdays/3+ days a week ≈ background practice (rolls forward silently);
// weekly/monthly+ ≈ a task that happens to repeat (stays overdue if missed).
// User can override via the drawer toggle.
const ROUTINE_AUTO_FREQ = new Set(['daily', 'weekdays']);
const deriveIsRoutine = (recurrence) => {
  if (!recurrence) return false;
  if (ROUTINE_AUTO_FREQ.has(recurrence.freq)) return true;
  if (Array.isArray(recurrence.byDay) && recurrence.byDay.length >= 3) return true;
  return false;
};

// Stable identifier shared across every instance of a recurring series.
// Used by streak math (filter by recurrenceId, count consecutive completions)
// and by the per-series dashboard.
const mkRecurrenceId = () => `r_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

// Fill in derived fields (isRoutine, recurrenceId) on a recurrence object.
// Pass the previous recurrenceId to preserve series identity when editing.
const ensureRecurrenceFields = (recurrence, existingRecurrenceId = null) => {
  if (!recurrence) return null;
  const isRoutine = recurrence.isRoutine === undefined
    ? deriveIsRoutine(recurrence)
    : !!recurrence.isRoutine;
  const recurrenceId = recurrence.recurrenceId || existingRecurrenceId || mkRecurrenceId();
  return { ...recurrence, isRoutine, recurrenceId };
};

const ORDINAL_SUFFIX = (n) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  const mod10 = n % 10;
  if (mod10 === 1) return 'st';
  if (mod10 === 2) return 'nd';
  if (mod10 === 3) return 'rd';
  return 'th';
};

// Compact human label for a recurrence — used in the ↻ pill across every card
// surface (Stack/.scard, Timeline/.card, List/.list-item) and in the dashboard.
const recurrenceLabel = (recurrence) => {
  if (!recurrence) return '';
  const r = recurrence;
  const i = r.interval || 1;
  if (r.freq === 'daily') return i > 1 ? `every ${i} days` : 'daily';
  if (r.freq === 'weekdays') return 'weekdays';
  if (r.freq === 'weekly') {
    if (Array.isArray(r.byDay) && r.byDay.length) {
      const days = r.byDay
        .filter(d => DAY_CODE_S[d])
        .sort((a, b) => DAY_INDEX[a] - DAY_INDEX[b])
        .map(d => DAY_CODE_S[d])
        .join('/');
      return i > 1 ? `every ${i} wks · ${days}` : days;
    }
    return i > 1 ? `every ${i} weeks` : 'weekly';
  }
  if (r.freq === 'monthly') {
    if (r.byMonthDay) {
      const ord = `${r.byMonthDay}${ORDINAL_SUFFIX(r.byMonthDay)}`;
      return i > 1 ? `every ${i} months · ${ord}` : `monthly · ${ord}`;
    }
    return i > 1 ? `every ${i} months` : 'monthly';
  }
  return '';
};

const nextOccurrence = (task, fromDateStr) => {
  if (!task.recurrence) return null;
  const { freq, interval=1, byDay, byMonthDay, until } = task.recurrence;
  const from = D.parse(fromDateStr);
  let next = null;

  if (freq === 'daily') {
    next = D.add(from, interval);
  } else if (freq === 'weekdays') {
    let n = D.add(from, 1);
    while ([0, 6].includes(n.getDay())) n = D.add(n, 1);
    next = n;
  } else if (freq === 'weekly') {
    if (Array.isArray(byDay) && byDay.length) {
      const days = byDay.map(d => DAY_INDEX[d]).filter(d => d !== undefined).sort();
      if (!days.length) return null;
      // Advance one day at a time within interval-week windows until we hit a
      // matching weekday. For interval > 1, ensure we skip into the right week.
      let n = D.add(from, 1);
      const step = interval > 1 ? interval : 1;
      const fromWeek = Math.floor(D.parse(fromDateStr).getTime() / (7 * 86400000));
      for (let safety = 0; safety < 366; safety += 1) {
        const weekDelta = Math.floor(n.getTime() / (7 * 86400000)) - fromWeek;
        if (days.includes(n.getDay()) && (step === 1 || weekDelta % step === 0)) {
          next = n;
          break;
        }
        n = D.add(n, 1);
      }
    } else {
      next = D.add(from, 7 * interval);
    }
  } else if (freq === 'monthly') {
    const d = new Date(from);
    d.setMonth(d.getMonth() + interval);
    if (byMonthDay) {
      const clamped = Math.min(byMonthDay, lastDayOfMonth(d.getFullYear(), d.getMonth()));
      d.setDate(clamped);
    }
    next = d;
  }

  if (!next) return null;
  const nextStr = D.str(next);
  if (until && nextStr > until) return null;
  return nextStr;
};

// Inverse of nextOccurrence — given a fire date, what was the previous fire
// date in the series? Returns null if cadence math can't produce one.
const prevOccurrence = (task, fromDateStr) => {
  if (!task.recurrence) return null;
  const { freq, interval=1, byDay, byMonthDay } = task.recurrence;
  const from = D.parse(fromDateStr);

  if (freq === 'daily') {
    return D.str(D.add(from, -interval));
  }
  if (freq === 'weekdays') {
    let n = D.add(from, -1);
    while ([0, 6].includes(n.getDay())) n = D.add(n, -1);
    return D.str(n);
  }
  if (freq === 'weekly') {
    if (Array.isArray(byDay) && byDay.length) {
      const days = byDay.map(d => DAY_INDEX[d]).filter(d => d !== undefined).sort();
      if (!days.length) return null;
      let n = D.add(from, -1);
      for (let safety = 0; safety < 366; safety += 1) {
        if (days.includes(n.getDay())) return D.str(n);
        n = D.add(n, -1);
      }
      return null;
    }
    return D.str(D.add(from, -7 * interval));
  }
  if (freq === 'monthly') {
    const d = new Date(from);
    d.setMonth(d.getMonth() - interval);
    if (byMonthDay) {
      const clamped = Math.min(byMonthDay, lastDayOfMonth(d.getFullYear(), d.getMonth()));
      d.setDate(clamped);
    }
    return D.str(d);
  }
  return null;
};

// Compute current streak for a series (consecutive completed instances ending
// at the most recent expected fire date). Walks backwards through the schedule
// using nextOccurrence; breaks the first time an instance is missing or
// uncompleted (or archived). Cheap because we only look at the slice of tasks
// matching `recurrenceId`. Returns 0 when the series has no completed history.
const computeStreak = (tasks, recurrenceId, todayStr = D.str(D.today())) => {
  if (!recurrenceId) return 0;
  const siblings = (tasks || []).filter(t => t.recurrence?.recurrenceId === recurrenceId);
  if (!siblings.length) return 0;
  // Map by date for O(1) lookup; same date can have multiple historical
  // instances (e.g. user re-spawned manually) — prefer the completed one.
  const byDate = new Map();
  for (const t of siblings) {
    if (!t.date) continue;
    const prev = byDate.get(t.date);
    if (!prev || (t.done && !prev.done)) byDate.set(t.date, t);
  }
  // Anchor on the latest completed-on-or-before-today instance.
  const completedDates = siblings
    .filter(t => t.done && t.date && t.date <= todayStr)
    .map(t => t.date)
    .sort();
  if (!completedDates.length) return 0;
  let anchor = completedDates[completedDates.length - 1];
  let streak = 0;
  // Pick a "template" task to drive nextOccurrence math — any sibling works
  // because recurrence shape is identical across the series.
  const template = siblings[0];
  // Walk backwards via the series' cadence: from anchor, what was the previous
  // fire date? If that fire date has a completed sibling, extend streak.
  let cur = anchor;
  let safety = 0;
  while (cur && safety < 1000) {
    const t = byDate.get(cur);
    if (!t || !t.done || t.archived) break;
    streak += 1;
    cur = prevOccurrence({ recurrence: template.recurrence }, cur);
    safety += 1;
  }
  return streak;
};

// Rollup of tasks → one entry per routine series. Used by the dashboard.
// Returns { recurrenceId, displayTitle, recurrence, streak, lastDone, nextFire,
//          completionRate30d, totalInstances, completedInstances }.
const routinesRollup = (tasks, todayStr = D.str(D.today())) => {
  const groups = new Map();
  for (const t of (tasks || [])) {
    if (!t?.recurrence?.recurrenceId || !t.recurrence.isRoutine) continue;
    // Archived routine instances DO count for streak / rate math (they represent
    // missed days that should have been done) — but a series is hidden from the
    // dashboard only when EVERY instance is archived (user stopped the routine).
    const id = t.recurrence.recurrenceId;
    if (!groups.has(id)) {
      groups.set(id, {
        recurrenceId: id,
        recurrence: t.recurrence,
        displayTitle: t.title,
        project: t.project,
        lifeArea: t.lifeArea,
        tasks: [],
        anyActive: false,
      });
    }
    const g = groups.get(id);
    g.tasks.push(t);
    if (!t.archived) g.anyActive = true;
  }
  const rows = [];
  for (const g of groups.values()) {
    // Skip series where every instance is archived — that's a stopped routine.
    if (!g.anyActive) continue;
    const siblings = g.tasks;
    // Title from the most recent instance (handles renames over time).
    const newest = siblings.reduce((a, b) => (a.createdAt > b.createdAt ? a : b), siblings[0]);
    // Series "current" recurrence: latest-dated open sibling if any, otherwise
    // fall back to newest. Picking from open siblings keeps the dashboard chip
    // honest when the user changes the cadence (past done/archived instances
    // keep their historical recurrence shape — see Q1 in the fix plan).
    const newestOpen = siblings.filter(t => !t.done && !t.archived && t.date)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const currentRecurrence = newestOpen?.recurrence || newest?.recurrence || g.recurrence;
    // Sort by task.date (the scheduled day), then completedAt as tiebreak.
    // task.date is the authoritative "this is the day it was done" for routines.
    const lastDoneTask = siblings.filter(t => t.done && t.date)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.completedAt || '').localeCompare(a.completedAt || ''))[0];
    const nextFireTask = siblings.filter(t => !t.done && t.date && t.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))[0];
    const thirtyAgo = D.str(D.add(D.parse(todayStr), -30));
    // 30-day rate = past 30 days (strictly before today). Today's pending
    // instance is excluded — the user can still complete it. Archived
    // (auto-missed) instances count toward the denominator so the rate honestly
    // reflects "did I do it when I should have".
    const last30 = siblings.filter(t => t.date && t.date >= thirtyAgo && t.date < todayStr);
    const last30Done = last30.filter(t => t.done).length;
    rows.push({
      recurrenceId: g.recurrenceId,
      recurrence: currentRecurrence,
      displayTitle: newest.title || g.displayTitle,
      project: newest.project || g.project,
      lifeArea: newest.lifeArea || g.lifeArea,
      streak: computeStreak(tasks, g.recurrenceId, todayStr),
      lastDone: lastDoneTask?.completedAt || null,
      lastDoneDate: lastDoneTask?.date || null,
      nextFireDate: nextFireTask?.date || null,
      completionRate30d: last30.length ? last30Done / last30.length : null,
      totalInstances: siblings.length,
      completedInstances: siblings.filter(t => t.done).length,
    });
  }
  return rows;
};

// One-time backfill for tasks that pre-date the isRoutine/recurrenceId fields.
// Idempotent: only touches recurring tasks that are missing either field.
// Returns the same array reference if no changes were needed (so React's
// equality check skips the re-render).
const migrateRecurrence = (tasks = []) => {
  let changed = false;
  const next = tasks.map(t => {
    if (!t?.recurrence) return t;
    if (t.recurrence.recurrenceId && t.recurrence.isRoutine !== undefined) return t;
    changed = true;
    return { ...t, recurrence: ensureRecurrenceFields(t.recurrence) };
  });
  return changed ? next : tasks;
};

const resolveRelativeSnoozeDate = (task) => {
  if (!task?.snoozeMode) return task?.snoozedUntil ?? null;
  if (task.snoozeMode === 'absolute') return task.snoozedUntil ?? null;
  const anchor = task.snoozeMode === 'before_due' ? task.dueDate : task.date;
  const offset = Number.isFinite(task.snoozeOffsetDays) ? task.snoozeOffsetDays : null;
  if (!anchor || offset == null) return null;
  return D.str(D.add(D.parse(anchor), -offset));
};

const syncTaskSnooze = (task) => {
  if (!task) return task;
  if (!task.snoozeMode) {
    if (task.snoozeOffsetDays == null) return task;
    return { ...task, snoozeOffsetDays: null };
  }
  if (task.snoozeMode === 'absolute') {
    return {
      ...task,
      snoozeOffsetDays: task.snoozeOffsetDays == null ? null : task.snoozeOffsetDays,
    };
  }
  const snoozedUntil = resolveRelativeSnoozeDate(task);
  if (!snoozedUntil) {
    return {
      ...task,
      snoozedUntil: null,
      snoozeMode: null,
      snoozeOffsetDays: null,
    };
  }
  return {
    ...task,
    snoozedUntil,
    snoozeOffsetDays: Number.isFinite(task.snoozeOffsetDays) ? task.snoozeOffsetDays : null,
  };
};

const rollTaskDateForward = (task, todayStr = D.str(D.today())) => {
  if (!task?.date) return task;
  if (task.done) return task;
  if (!D.isPast(task.date)) return task;
  // Routines never get rolled forward — a missed instance is a streak break,
  // not a debt. archiveStaleRoutines handles them separately (auto-archives so
  // the inbox doesn't pile up with 7 overdue dog walks after a holiday).
  if (task.recurrence?.isRoutine) return task;
  return { ...task, date: todayStr };
};

const rollIncompleteTasksToToday = (tasks = [], todayStr = D.str(D.today())) => {
  let changed = false;
  const next = tasks.map(task => {
    const rolled = rollTaskDateForward(task, todayStr);
    if (rolled !== task) changed = true;
    return rolled;
  });
  return changed ? next : tasks;
};

// Routines that fired in the past and weren't completed → archive them. The
// streak math will show the gap; the inbox stays clean. Idempotent.
const archiveStaleRoutines = (tasks = [], todayStr = D.str(D.today())) => {
  let changed = false;
  const next = tasks.map(t => {
    if (!t?.recurrence?.isRoutine) return t;
    if (t.archived || t.done) return t;
    if (!t.date || !D.isPast(t.date)) return t;
    changed = true;
    return {
      ...t,
      archived: true,
      activity: [...(t.activity || []), { type: 'auto-archived', reason: 'routine missed', at: new Date().toISOString() }],
    };
  });
  return changed ? next : tasks;
};

// For each routine series, ensure concrete instances exist for every fire date
// in [today, today + daysAhead]. Routines (unlike spawn-on-completion tasks)
// pre-generate so the user can see them on the Timeline and tick them off in
// the Stack strip. Idempotent — only creates a new task when one doesn't
// already exist for that date in the series.
const extendRoutineHorizon = (tasks = [], daysAhead = 14, todayStr = D.str(D.today())) => {
  const byRecurrence = new Map();
  for (const t of tasks) {
    if (!t?.recurrence?.isRoutine) continue;
    if (!t.recurrence.recurrenceId) continue;
    if (t.archived) continue;
    const id = t.recurrence.recurrenceId;
    if (!byRecurrence.has(id)) byRecurrence.set(id, []);
    byRecurrence.get(id).push(t);
  }

  if (byRecurrence.size === 0) return tasks;
  const horizonStr = D.str(D.add(D.parse(todayStr), daysAhead));
  const additions = [];

  for (const [, siblings] of byRecurrence) {
    // Existing dates for this series (so we don't double-create).
    const existingDates = new Set(siblings.map(t => t.date).filter(Boolean));
    // Template = the most-recent sibling (carries the latest title/project/tags).
    const dated = siblings.filter(t => t.date);
    if (!dated.length) continue;
    const template = dated.reduce((a, b) => (a.date > b.date ? a : b));
    // Walk forward from latest known fire date; stop at horizon.
    let cur = template.date;
    let safety = 0;
    while (cur && safety < 200) {
      const next = nextOccurrence(template, cur);
      if (!next) break;
      if (next > horizonStr) break;
      if (!existingDates.has(next)) {
        const now = new Date().toISOString();
        additions.push(syncTaskSnooze({
          ...template,
          id: mkid(),
          date: next,
          done: false,
          completedAt: null,
          archived: false,
          // Fresh checklist on each spawn — see App.jsx spawn path for the
          // matching choice on spawn-on-completion.
          subtasks: (template.subtasks || []).map(s => ({ ...s, done: false })),
          activity: [{ type: 'created', at: now, reason: 'horizon' }],
          createdAt: now,
          updatedAt: undefined,
        }));
        existingDates.add(next);
      }
      cur = next;
      safety += 1;
    }
  }

  return additions.length ? [...tasks, ...additions] : tasks;
};

// Strip dangling IDs out of delegation parents' checkInTaskIds / expiryTaskId.
// Heals tasks loaded from a store that lost the child rows but kept the
// references on the parent (e.g. the parent was completed → sync deleted the
// pending children, but the parent's array was never rewritten). Without this,
// every check-in lookup misses and reminders go silent. Idempotent.
const pruneOrphanCheckIns = (tasks = []) => {
  const validIds = new Set(tasks.map(t => t && t.id).filter(Boolean));
  let changed = false;
  const next = tasks.map(t => {
    if (!t) return t;
    const ids = Array.isArray(t.checkInTaskIds) ? t.checkInTaskIds : null;
    const hasStaleChild = ids ? ids.some(cid => !validIds.has(cid)) : false;
    const hasStaleExpiry = !!(t.expiryTaskId && !validIds.has(t.expiryTaskId));
    if (!hasStaleChild && !hasStaleExpiry) return t;
    changed = true;
    const patch = {};
    if (hasStaleChild) patch.checkInTaskIds = ids.filter(cid => validIds.has(cid));
    if (hasStaleExpiry) patch.expiryTaskId = null;
    return { ...t, ...patch };
  });
  return changed ? next : tasks;
};

// === Delegation: presets, spawn helpers, staleness, people store ===

const CHECKIN_PRESETS = {
  gentle:   [3, 7, 14],
  standard: [2, 5, 10],
  tight:    [1, 3, 5, 7],
  weekly4:  [7, 14, 21, 28],
};

const CHECKIN_PRESET_LABELS = {
  gentle:   'Gentle 3/7/14',
  standard: 'Standard 2/5/10',
  tight:    'Tight 1/3/5/7',
  weekly4:  'Weekly x4',
};

const matchPreset = (schedule) => {
  if (!Array.isArray(schedule) || !schedule.length) return null;
  const key = schedule.join(',');
  for (const k of Object.keys(CHECKIN_PRESETS)) {
    if (CHECKIN_PRESETS[k].join(',') === key) return k;
  }
  return null;
};

// Build the spawned check-in tasks for a delegation. fromDateISO is the
// delegation timestamp; offsets are days from that date. Returns an array of
// makeTask() results (callers append to the task list and capture .id).
const buildCheckInTasks = (parent, schedule, fromDateISO) => {
  if (!Array.isArray(schedule) || !schedule.length) return [];
  const fromDay = new Date(fromDateISO); fromDay.setHours(0,0,0,0);
  const name = parent.delegatedTo || 'them';
  return schedule.map(offset => makeTask({
    title: `Check in with ${name} re: ${parent.title}`,
    project: parent.project,
    tags: ['comm'],
    priority: parent.priority || 'p3',
    date: D.str(D.add(fromDay, offset)),
    timeEstimate: '5m',
    checkInOf: parent.id,
    checkInDayOffset: offset,
    delegationStatus: 'waiting',
  }));
};

const buildExpiryTask = (parent, expiryDateStr) => {
  if (!expiryDateStr) return null;
  const name = parent.delegatedTo || 'them';
  return makeTask({
    title: `Escalate: ${parent.title} (${name})`,
    project: parent.project,
    tags: ['comm'],
    priority: 'p1',
    date: expiryDateStr,
    timeEstimate: '15m',
    expiryOf: parent.id,
  });
};

// Adaptive cadence: stretch the *remaining* offsets (those > fromOffset) by 1.5x.
// Returns a new schedule array preserving offsets <= fromOffset unchanged.
const stretchSchedule = (schedule, fromOffset, factor=1.5) => {
  if (!Array.isArray(schedule)) return schedule;
  return schedule.map(o => o <= fromOffset ? o : Math.round(o * factor));
};

// A delegation is "stale" if there's been no contact within 2x the largest
// gap between scheduled check-ins. For the first cycle (no lastContactAt yet)
// the reference is delegatedAt.
const isStale = (task, now=Date.now()) => {
  if (!task || !task.delegatedTo) return false;
  const sched = Array.isArray(task.checkInSchedule) ? task.checkInSchedule : null;
  if (!sched || !sched.length) return false;
  let maxGap = sched[0];
  for (let i=1;i<sched.length;i++) maxGap = Math.max(maxGap, sched[i]-sched[i-1]);
  const refIso = task.lastContactAt || task.delegatedAt;
  if (!refIso) return false;
  const ref = new Date(refIso).getTime();
  if (!Number.isFinite(ref)) return false;
  const days = (now - ref) / (1000*60*60*24);
  return days > maxGap * 2;
};

// People store — keyed by lowercase name. Lightweight memory of who you
// delegate to and what cadence you tend to use, so the next delegation
// pre-fills.
//
// Backed by an in-memory cache that App hydrates from Supabase on workspace
// bootstrap, plus an injected persister that mirrors writes back to the
// cloud. The sync API (loadPeople / savePeople) is preserved so existing
// callers don't need to await anything.
let _peopleCache = {};
let _peoplePersister = null;

const loadPeople = () => _peopleCache;

const savePeople = (people) => {
  const next = (people && typeof people === 'object') ? people : {};
  const prev = _peopleCache;
  _peopleCache = next;
  if (!_peoplePersister) return;
  for (const [k, v] of Object.entries(next)) {
    if (prev[k] === v) continue;
    Promise.resolve(_peoplePersister(v)).catch((e) =>
      console.error('[people] sync failed', e)
    );
  }
};

// Replace the in-memory map. Called on sign-in after fetching from Supabase.
const setPeopleCache = (map) => {
  _peopleCache = (map && typeof map === 'object') ? { ...map } : {};
};

// Install the cloud persister. `fn(person)` is invoked for each entry that
// changed during a savePeople call. Pass null to clear (e.g. on sign-out).
const setPeoplePersister = (fn) => {
  _peoplePersister = typeof fn === 'function' ? fn : null;
};

const personKey = (name) => String(name||'').trim().toLowerCase();

const recordDelegation = (name, schedule) => {
  const k = personKey(name); if (!k) return;
  const people = loadPeople();
  const cur = people[k] || { displayName: String(name).trim(), totalDelegations: 0, openDelegations: 0 };
  cur.displayName = String(name).trim() || cur.displayName;
  cur.preferredCadence = Array.isArray(schedule) && schedule.length ? schedule.slice() : cur.preferredCadence;
  cur.totalDelegations = (cur.totalDelegations || 0) + 1;
  cur.openDelegations = (cur.openDelegations || 0) + 1;
  people[k] = cur;
  savePeople(people);
};

const adjustOpenCount = (name, delta) => {
  const k = personKey(name); if (!k) return;
  const people = loadPeople();
  if (!people[k]) return;
  people[k].openDelegations = Math.max(0, (people[k].openDelegations || 0) + delta);
  savePeople(people);
};

const getPreferredCadence = (name) => {
  const k = personKey(name); if (!k) return null;
  const p = loadPeople()[k];
  return (p && Array.isArray(p.preferredCadence) && p.preferredCadence.length) ? p.preferredCadence.slice() : null;
};

const recordContact = (name, atIso) => {
  const k = personKey(name); if (!k) return;
  const people = loadPeople();
  if (!people[k]) people[k] = { displayName: String(name).trim(), totalDelegations: 0, openDelegations: 0 };
  people[k].lastContactAt = atIso || new Date().toISOString();
  savePeople(people);
};

// Derive a per-person rollup from the current task list. Used by the dashboard
// and the per-person counts. Returns [{name, displayName, openCount,
// overdueCount, oldestDays, lastContactAt}] sorted by oldest-first.
// Archived tasks are skipped — once a delegation is archived, its parent
// disappears from the dashboard. Check-in lookups also skip archived followers
// so the overdue count doesn't trip on followers that were archived alongside.
const peopleRollup = (tasks=[]) => {
  const todayStr = D.str(D.today());
  const byName = new Map();
  for (const t of tasks) {
    if (!t || !t.delegatedTo || t.done || t.archived) continue;
    const k = personKey(t.delegatedTo);
    if (!k) continue;
    let entry = byName.get(k);
    if (!entry) {
      entry = { name: k, displayName: t.delegatedTo, openCount: 0, overdueCount: 0,
                oldestDays: 0, lastContactAt: null, tasks: [] };
      byName.set(k, entry);
    }
    entry.openCount += 1;
    entry.tasks.push(t);
    const ageDays = daysSince(t.delegatedAt);
    if (ageDays > entry.oldestDays) entry.oldestDays = ageDays;
    // Overdue = at least one pending check-in task with date < today
    const pendingIds = Array.isArray(t.checkInTaskIds) ? t.checkInTaskIds : [];
    for (const cid of pendingIds) {
      const ct = tasks.find(x => x.id === cid);
      if (ct && !ct.done && !ct.archived && ct.date && ct.date < todayStr) { entry.overdueCount += 1; break; }
    }
    if (t.lastContactAt && (!entry.lastContactAt || t.lastContactAt > entry.lastContactAt)) {
      entry.lastContactAt = t.lastContactAt;
    }
  }
  return Array.from(byName.values()).sort((a,b) => b.oldestDays - a.oldestDays);
};

const makeTask = (overrides={}) => syncTaskSnooze({
  id:mkid(), title:'Untitled task', description:'', subtasks:[],
  project:'LIFE', tags:[], priority:'p3', date:null,
  dueDate:null,
  lifeArea:null,
  timeEstimate:null, done:false, completedAt:null, snoozedUntil:null,
  snoozeMode:null, snoozeOffsetDays:null,
  recurrence:null, activity:[{type:'created',at:new Date().toISOString()}],
  createdAt:new Date().toISOString(),
  cardType:'task', parentId:null, childOrder:null,
  groupId:null, position:null,
  blocked:false, blockedReason:'', blockedBy:[], blockedSince:null, followUpAt:null,
  delegatedTo:null, delegatedAt:null, delegationStatus:null,
  checkInSchedule:null, checkInTaskIds:[], checkInOf:null, checkInDayOffset:null,
  expiryDate:null, expiryTaskId:null, expiryOf:null,
  lastContactAt:null, delegationHistory:[],
  // Personal follow-up reminder for the delegator. Surfaces the card in the
  // user's own inbox on this date even if the cadence is silent. Separate from
  // expiryDate (which is the delegate's deadline).
  personalReminderDate:null,
  cardColor:null,
  ...overrides,
});

// Migration for tasks loaded from localStorage that pre-date newer fields.
// Idempotent: leaves already-migrated tasks alone.
const migrateTasks = (tasks=[]) => tasks.map(t => ({
  cardType: t.cardType || 'task',
  parentId: t.parentId === undefined ? null : t.parentId,
  childOrder: t.childOrder === undefined ? null : t.childOrder,
  groupId: t.groupId === undefined ? null : t.groupId,
  lifeArea: t.lifeArea === undefined ? null : t.lifeArea,
  dueDate: t.dueDate === undefined ? null : t.dueDate,
  snoozeMode: t.snoozeMode === undefined ? null : t.snoozeMode,
  snoozeOffsetDays: t.snoozeOffsetDays === undefined ? null : t.snoozeOffsetDays,
  blocked: t.blocked === undefined ? false : t.blocked,
  blockedReason: t.blockedReason === undefined ? '' : t.blockedReason,
  blockedBy: t.blockedBy === undefined ? [] : t.blockedBy,
  blockedSince: t.blockedSince === undefined ? null : t.blockedSince,
  followUpAt: t.followUpAt === undefined ? null : t.followUpAt,
  delegatedTo: t.delegatedTo === undefined ? null : t.delegatedTo,
  delegatedAt: t.delegatedAt === undefined ? null : t.delegatedAt,
  delegationStatus: t.delegationStatus === undefined ? null : t.delegationStatus,
  checkInSchedule: t.checkInSchedule === undefined ? null : t.checkInSchedule,
  checkInTaskIds: t.checkInTaskIds === undefined ? [] : t.checkInTaskIds,
  checkInOf: t.checkInOf === undefined ? null : t.checkInOf,
  checkInDayOffset: t.checkInDayOffset === undefined ? null : t.checkInDayOffset,
  expiryDate: t.expiryDate === undefined ? null : t.expiryDate,
  expiryTaskId: t.expiryTaskId === undefined ? null : t.expiryTaskId,
  expiryOf: t.expiryOf === undefined ? null : t.expiryOf,
  lastContactAt: t.lastContactAt === undefined ? null : t.lastContactAt,
  delegationHistory: t.delegationHistory === undefined ? [] : t.delegationHistory,
  personalReminderDate: t.personalReminderDate === undefined ? null : t.personalReminderDate,
  ...t,
})).map(syncTaskSnooze);

// Whole-days elapsed since an ISO timestamp; 0 for null/today.
const daysSince = (iso) => {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  const ms = Date.now() - then;
  return Math.max(0, Math.floor(ms / (1000*60*60*24)));
};

// Parse "30m", "1h", "1h30m", "2h 15m" → minutes. Returns 0 on empty/invalid.
const parseTimeEst = (s) => {
  if (!s || typeof s !== 'string') return 0;
  let m = 0;
  const h = s.match(/(\d+)\s*h/i); if (h) m += parseInt(h[1],10)*60;
  const mn = s.match(/(\d+)\s*m/i); if (mn) m += parseInt(mn[1],10);
  if (!h && !mn) { const n = parseInt(s,10); if (Number.isFinite(n)) m = n; }
  return m;
};

// Format minutes back to a compact "1h 30m" / "45m" / "2h" string.
const fmtTimeEst = (mins) => {
  if (!mins || mins <= 0) return '';
  const h = Math.floor(mins/60), m = mins%60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

// Helper: ISO timestamp / date string offset from today. Used in the
// curated demo delegations so the seeded ages stay coherent regardless of
// when the dev-bypass page is opened (otherwise activity ages drift and the
// "stale 14d ago" entry becomes stale-2-months-ago after a while).
const __nowMs = Date.now();
const __today00 = (() => { const d = new Date(__nowMs); d.setHours(0,0,0,0); return d.getTime(); })();
const __agoIso  = (daysAgo, hour=9, minute=0) => {
  const d = new Date(__today00 - daysAgo * 86400000);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const __relDate = (daysFromToday) => {
  const d = new Date(__today00 + daysFromToday * 86400000);
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
};

// Curated demo dataset. Persona: solo founder running a small consulting
// practice. Showcases delegation + check-ins, projects + subtasks, blocked
// tasks, recurring tasks, and a busy weekly cadence. All names and clients
// are fictional.
const INIT_TASKS = [
  // === INBOX (no date) ===
  makeTask({id:'d1', title:'Outline Q3 marketing roadmap', project:'WORK', tags:['focus','docs'], priority:'p2', timeEstimate:'1h 30m', lifeArea:'career'}),
  makeTask({id:'d2', title:'Switch booking software — research options', project:'ADMIN', tags:['admin'], priority:'p3', timeEstimate:'45m'}),
  makeTask({id:'d3', title:'New running shoes', project:'LIFE', tags:['health'], priority:'p3', timeEstimate:'30m', lifeArea:'health'}),
  makeTask({id:'d4', title:'Read "Working in Public" (Eghbal)', project:'LIFE', tags:['learn'], priority:'p3', timeEstimate:'4h', lifeArea:'growth'}),

  // === 2026-04-22 (Wed last week) ===
  makeTask({id:'d10', title:'Weekly review', project:'ADMIN', tags:['focus','admin'], priority:'p2',
    date:'2026-04-22', done:true, completedAt:'2026-04-22T16:00:00.000Z', timeEstimate:'30m',
    recurrence:{freq:'weekly', interval:1}}),
  makeTask({id:'d11', title:'Send invoice — Northwind retainer (April)', project:'ADMIN', tags:['admin'], priority:'p2',
    date:'2026-04-22', done:true, completedAt:'2026-04-22T10:00:00.000Z', timeEstimate:'15m', lifeArea:'finance'}),
  makeTask({id:'d12', title:'Strength training', project:'LIFE', tags:['health'], priority:'p3',
    date:'2026-04-22', done:true, completedAt:'2026-04-22T07:00:00.000Z', timeEstimate:'45m', lifeArea:'health'}),

  // === 2026-04-23 (Thu) ===
  makeTask({id:'d20', title:'Acme launch — kickoff call', project:'WORK', tags:['mtg','focus'], priority:'p1',
    date:'2026-04-23', done:true, completedAt:'2026-04-23T14:00:00.000Z', timeEstimate:'1h', lifeArea:'career'}),
  makeTask({id:'d21', title:'Email triage', project:'ADMIN', tags:['comm','admin'], priority:'p2',
    date:'2026-04-23', done:true, completedAt:'2026-04-23T08:30:00.000Z', timeEstimate:'30m',
    recurrence:{freq:'weekdays', interval:1}}),

  // === 2026-04-24 (Fri) ===
  makeTask({id:'d30', title:'Pay studio rent', project:'ADMIN', tags:['admin'], priority:'p1',
    date:'2026-04-24', done:true, completedAt:'2026-04-24T09:00:00.000Z', timeEstimate:'10m', lifeArea:'finance',
    recurrence:{freq:'monthly', interval:1}}),
  makeTask({id:'d31', title:'Coffee with mentor', project:'LIFE', tags:['mtg'], priority:'p2',
    date:'2026-04-24', done:true, completedAt:'2026-04-24T15:00:00.000Z', timeEstimate:'1h', lifeArea:'growth'}),

  // === 2026-04-27 (Mon) ===
  makeTask({id:'d40', title:'Email triage', project:'ADMIN', tags:['comm','admin'], priority:'p2',
    date:'2026-04-27', done:true, completedAt:'2026-04-27T08:30:00.000Z', timeEstimate:'30m'}),
  makeTask({id:'d41', title:'Draft Acme launch blog post', project:'WORK', tags:['focus','docs'], priority:'p1',
    date:'2026-04-27', done:true, completedAt:'2026-04-27T13:00:00.000Z', timeEstimate:'2h', lifeArea:'career'}),

  // === 2026-04-28 (Tue) ===
  makeTask({id:'d50', title:'Email triage', project:'ADMIN', tags:['comm','admin'], priority:'p2',
    date:'2026-04-28', done:true, completedAt:'2026-04-28T08:30:00.000Z', timeEstimate:'30m'}),
  makeTask({id:'d51', title:'Strength training', project:'LIFE', tags:['health'], priority:'p3',
    date:'2026-04-28', done:true, completedAt:'2026-04-28T07:00:00.000Z', timeEstimate:'45m', lifeArea:'health'}),

  // === 2026-04-29 (Wed — today) ===
  makeTask({id:'d60', title:'Email triage', project:'ADMIN', tags:['comm','admin'], priority:'p2',
    date:'2026-04-29', done:true, completedAt:'2026-04-29T08:30:00.000Z', timeEstimate:'30m'}),
  makeTask({id:'d61', title:'Walk the dog', project:'LIFE', tags:['health'], priority:'p3',
    date:'2026-04-29', done:true, completedAt:'2026-04-29T07:30:00.000Z', timeEstimate:'30m', lifeArea:'health',
    recurrence:{freq:'daily', interval:1}}),
  makeTask({id:'d62', title:'Acme blog post — final review', project:'WORK', tags:['focus','docs'], priority:'p1',
    date:'2026-04-29', timeEstimate:'45m', lifeArea:'career'}),
  makeTask({id:'d63', title:'Hyperion — proposal call', project:'WORK', tags:['mtg'], priority:'p1',
    date:'2026-04-29', timeEstimate:'45m', lifeArea:'career',
    description:'Discovery call. Needs ballpark price + timeline before EOD Friday.'}),

  // === 2026-04-30 (Thu) ===
  makeTask({id:'d70', title:'Send Acme blog draft to client', project:'WORK', tags:['comm'], priority:'p1',
    date:'2026-04-30', timeEstimate:'15m', lifeArea:'career'}),
  makeTask({id:'d71', title:'Dentist checkup', project:'LIFE', tags:['health'], priority:'p2',
    date:'2026-04-30', timeEstimate:'1h', lifeArea:'health'}),

  // === 2026-05-01 (Fri) ===
  makeTask({id:'d80', title:'Weekly review', project:'ADMIN', tags:['focus','admin'], priority:'p2',
    date:'2026-05-01', timeEstimate:'30m', recurrence:{freq:'weekly', interval:1}}),
  makeTask({id:'d81', title:'Submit quarterly tax filing', project:'ADMIN', tags:['focus','admin'], priority:'p1',
    date:'2026-05-01', timeEstimate:'1h 30m', lifeArea:'finance',
    description:'Need books closed first — waiting on accountant.'}),

  // === 2026-05-04 (Mon) ===
  makeTask({id:'d90', title:'Tax documents — gather receipts', project:'ADMIN', tags:['focus','admin'], priority:'p2',
    date:'2026-05-04', timeEstimate:'2h', lifeArea:'finance'}),

  // === 2026-05-08 (Fri) ===
  makeTask({id:'d100', title:'Hyperion proposal — submit', project:'WORK', tags:['focus','docs'], priority:'p1',
    date:'2026-05-08', timeEstimate:'1h', lifeArea:'career'}),

  // === Project + subtasks: "Acme — Q2 product launch" ===
  makeTask({id:'p1', cardType:'project', title:'Acme — Q2 product launch', project:'WORK',
    tags:['focus'], priority:'p1', timeEstimate:'8h', lifeArea:'career',
    childOrder:['p1s1','p1s2','p1s3','p1s4'],
    description:"Multi-channel launch for Acme's new analytics dashboard. Owner: me. Target ship: 2026-05-15."}),
  makeTask({id:'p1s1', parentId:'p1', title:'Brief copywriter on voice + tone', project:'WORK',
    tags:['comm'], priority:'p2', timeEstimate:'30m', done:true, completedAt:'2026-04-27T11:00:00.000Z', date:'2026-04-27'}),
  makeTask({id:'p1s2', parentId:'p1', title:'Approve hero image direction', project:'WORK',
    tags:['comm'], priority:'p2', timeEstimate:'15m', date:'2026-04-30'}),
  makeTask({id:'p1s3', parentId:'p1', title:'Schedule social posts (10-post sequence)', project:'WORK',
    tags:['admin'], priority:'p3', timeEstimate:'45m', date:'2026-05-05'}),
  makeTask({id:'p1s4', parentId:'p1', title:'QA landing page on staging', project:'WORK',
    tags:['focus'], priority:'p2', timeEstimate:'30m', date:'2026-05-06'}),

  // === Delegations with check-ins (the differentiator) ===
  makeTask({id:'dl1', title:'Hyperion proposal — pricing slide', project:'WORK',
    tags:['focus'], priority:'p1', timeEstimate:'1h', lifeArea:'career',
    delegatedTo:'Sam', delegatedAt:'2026-04-27T09:00:00.000Z',
    delegationStatus:'waiting', checkInSchedule:[2,5,10],
    checkInTaskIds:['dl1c1','dl1c2','dl1c3'],
    description:'Sam to draft pricing slide options based on the Q2 retainer template. I review before submission.',
    activity:[
      {type:'created', at:'2026-04-27T09:00:00.000Z'},
      {type:'delegated', to:'Sam', at:'2026-04-27T09:00:00.000Z'},
      {type:'cadence-changed', schedule:[2,5,10], at:'2026-04-27T09:00:30.000Z'},
      {type:'nudge-sent', day:2, at:'2026-04-29T09:15:00.000Z'},
    ],
    lastContactAt:'2026-04-29T09:15:00.000Z'}),
  makeTask({id:'dl1c1', checkInOf:'dl1', checkInDayOffset:2, title:'Check in with Sam re: Hyperion proposal — pricing slide',
    project:'WORK', tags:['comm'], priority:'p1', date:'2026-04-29', timeEstimate:'5m',
    done:true, completedAt:'2026-04-29T09:15:00.000Z'}),
  makeTask({id:'dl1c2', checkInOf:'dl1', checkInDayOffset:5, title:'Check in with Sam re: Hyperion proposal — pricing slide',
    project:'WORK', tags:['comm'], priority:'p1', date:'2026-05-02', timeEstimate:'5m'}),
  makeTask({id:'dl1c3', checkInOf:'dl1', checkInDayOffset:10, title:'Check in with Sam re: Hyperion proposal — pricing slide',
    project:'WORK', tags:['comm'], priority:'p1', date:'2026-05-07', timeEstimate:'5m'}),

  makeTask({id:'dl2', title:'Q1 books closed — review', project:'ADMIN',
    tags:['admin'], priority:'p1', lifeArea:'finance', timeEstimate:'30m',
    delegatedTo:'Alex', delegatedAt:'2026-04-22T14:00:00.000Z',
    delegationStatus:'sent', checkInSchedule:[3,7,14],
    description:'Alex (accountant) to close out Q1 books before quarterly tax deadline.',
    activity:[
      {type:'created', at:'2026-04-22T14:00:00.000Z'},
      {type:'delegated', to:'Alex', at:'2026-04-22T14:00:00.000Z'},
      {type:'cadence-changed', schedule:[3,7,14], at:'2026-04-22T14:00:30.000Z'},
      {type:'nudge-sent', day:3, at:'2026-04-25T10:00:00.000Z'},
      {type:'heard-back', day:3, at:'2026-04-25T16:30:00.000Z'},
      {type:'nudge-sent', day:7, at:'2026-04-29T10:00:00.000Z'},
    ],
    lastContactAt:'2026-04-25T16:30:00.000Z'}),

  makeTask({id:'dl3', title:'Conference vendors — shortlist 3', project:'WORK',
    tags:['admin'], priority:'p3', timeEstimate:'2h', lifeArea:'career',
    delegatedTo:'Sam', delegatedAt:'2026-04-28T11:00:00.000Z',
    delegationStatus:'sent', checkInSchedule:[2,5,10],
    description:'Need: cost, capacity, AV included. Within 30 min of office. July dates.',
    activity:[
      {type:'created', at:'2026-04-28T11:00:00.000Z'},
      {type:'delegated', to:'Sam', at:'2026-04-28T11:00:00.000Z'},
      {type:'cadence-changed', schedule:[2,5,10], at:'2026-04-28T11:00:30.000Z'},
    ]}),

  // dl4 — Priya, vendor contract, 4d ago, waiting, promise next week.
  makeTask({id:'dl4', title:'Vendor contract — Northwind annual renewal review', project:'ADMIN',
    tags:['admin','focus'], priority:'p1', lifeArea:'finance', timeEstimate:'45m',
    delegatedTo:'Priya', delegatedAt:__agoIso(4),
    delegationStatus:'waiting', checkInSchedule:[3,7],
    expiryDate:__relDate(3),
    description:'Priya (legal) to flag any clause changes vs last year. Needs to be signed Friday.',
    activity:[
      {type:'created', at:__agoIso(4)},
      {type:'delegated', to:'Priya', at:__agoIso(4)},
      {type:'cadence-changed', schedule:[3,7], at:__agoIso(4, 9, 1)},
      {type:'note', text:'Priya agreed to review by Thursday — confirmed Slack', at:__agoIso(4, 13, 0)},
    ],
    lastContactAt:__agoIso(4, 13, 0)}),

  // dl5 — Marcus, design system audit, STALE (14d ago, no contact in ~12d).
  makeTask({id:'dl5', title:'Design system audit — color tokens + typography', project:'WORK',
    tags:['focus','docs'], priority:'p2', lifeArea:'career', timeEstimate:'3h',
    delegatedTo:'Marcus', delegatedAt:__agoIso(14),
    delegationStatus:'waiting', checkInSchedule:[3,7,14],
    description:'Audit the existing tokens, flag duplicates, propose consolidation. Worried this fell off his radar.',
    activity:[
      {type:'created', at:__agoIso(14)},
      {type:'delegated', to:'Marcus', at:__agoIso(14)},
      {type:'cadence-changed', schedule:[3,7,14], at:__agoIso(14, 9, 1)},
      {type:'nudge-sent', day:3, at:__agoIso(11, 9, 0)},
      {type:'note', text:'no reply since the chase last week', at:__agoIso(11, 9, 1)},
    ],
    lastContactAt:__agoIso(11, 9, 0)}),

  // dl6 — Jordan, onboarding flow, due TODAY (promise is today).
  makeTask({id:'dl6', title:'Customer onboarding flow — wireframes v2', project:'WORK',
    tags:['focus','docs'], priority:'p1', lifeArea:'career', timeEstimate:'2h',
    delegatedTo:'Jordan', delegatedAt:__agoIso(6),
    delegationStatus:'sent', checkInSchedule:[3,7],
    expiryDate:__relDate(0),
    description:'Updates from the user-research synthesis. Hand off to Sam for production after sign-off.',
    activity:[
      {type:'created', at:__agoIso(6)},
      {type:'delegated', to:'Jordan', at:__agoIso(6)},
      {type:'cadence-changed', schedule:[3,7], at:__agoIso(6, 9, 1)},
      {type:'nudge-sent', day:3, at:__agoIso(3, 9, 0)},
      {type:'note', text:'draft sent for review — said morning Tuesday', at:__agoIso(1, 18, 0)},
    ],
    lastContactAt:__agoIso(1, 18, 0)}),

  // dl7 — Riley, annual report, HEARD BACK recently.
  makeTask({id:'dl7', title:'Annual report PDF — pages 12-24 layout', project:'WORK',
    tags:['focus','docs'], priority:'p2', lifeArea:'career', timeEstimate:'2h',
    delegatedTo:'Riley', delegatedAt:__agoIso(2),
    delegationStatus:'heard-back', checkInSchedule:[5],
    expiryDate:__relDate(5),
    description:'Riley owns layout from page 12 onward. First pass back to me by Friday.',
    activity:[
      {type:'created', at:__agoIso(2)},
      {type:'delegated', to:'Riley', at:__agoIso(2)},
      {type:'cadence-changed', schedule:[5], at:__agoIso(2, 9, 1)},
      {type:'note', text:'first pass done, sending Friday morning', at:__agoIso(0, 8, 30)},
      {type:'heard-back', day:2, at:__agoIso(0, 8, 30)},
    ],
    lastContactAt:__agoIso(0, 8, 30)}),

  // dl8 — Devon, Slack export, HEARD BACK days ago (slow burn).
  makeTask({id:'dl8', title:'Slack export — Q1 archive', project:'ADMIN',
    tags:['admin'], priority:'p3', timeEstimate:'30m', lifeArea:'career',
    delegatedTo:'Devon', delegatedAt:__agoIso(5),
    delegationStatus:'heard-back', checkInSchedule:[3,10],
    description:"Devon's exporting the Q1 channels for archival. Low priority — no rush.",
    activity:[
      {type:'created', at:__agoIso(5)},
      {type:'delegated', to:'Devon', at:__agoIso(5)},
      {type:'cadence-changed', schedule:[3,10], at:__agoIso(5, 9, 1)},
      {type:'note', text:'will dump to Drive Friday', at:__agoIso(4, 14, 0)},
      {type:'heard-back', day:1, at:__agoIso(4, 14, 0)},
    ],
    lastContactAt:__agoIso(4, 14, 0)}),

  // dl9 — Priya again, just-delegated yesterday (no schedule, no notes yet).
  makeTask({id:'dl9', title:'Site privacy policy — update for CCPA changes', project:'ADMIN',
    tags:['admin','focus'], priority:'p2', lifeArea:'finance', timeEstimate:'1h',
    delegatedTo:'Priya', delegatedAt:__agoIso(1, 10, 0),
    delegationStatus:'waiting', checkInSchedule:[2,7],
    description:'Quick turn — Priya knows the previous version. Just needs the diff and a sign-off.',
    activity:[
      {type:'created', at:__agoIso(1, 10, 0)},
      {type:'delegated', to:'Priya', at:__agoIso(1, 10, 0)},
      {type:'cadence-changed', schedule:[2,7], at:__agoIso(1, 10, 1)},
    ]}),

  // dl10 — Sam, Q2 marketing budget, OVERDUE (promise was 2 days ago).
  makeTask({id:'dl10', title:'Q2 marketing budget breakdown — by channel', project:'WORK',
    tags:['focus','docs'], priority:'p1', lifeArea:'career', timeEstimate:'2h',
    delegatedTo:'Sam', delegatedAt:__agoIso(8),
    delegationStatus:'sent', checkInSchedule:[2,5,10],
    expiryDate:__relDate(-2),
    description:"Sam to pull the Q1 actuals from Stripe and project Q2 by channel. Was supposed to be done Monday.",
    activity:[
      {type:'created', at:__agoIso(8)},
      {type:'delegated', to:'Sam', at:__agoIso(8)},
      {type:'cadence-changed', schedule:[2,5,10], at:__agoIso(8, 9, 1)},
      {type:'nudge-sent', day:2, at:__agoIso(6, 9, 0)},
      {type:'note', text:'working on it, will send Friday', at:__agoIso(5, 15, 0)},
      {type:'nudge-sent', day:5, at:__agoIso(3, 10, 0)},
      {type:'chased', text:'pinged on Slack again — said next week', at:__agoIso(1, 11, 0)},
    ],
    lastContactAt:__agoIso(1, 11, 0)}),

  // dl11 — Re-delegated from Alex to Riley, with personal reminder set.
  makeTask({id:'dl11', title:'Weekly investor update — draft', project:'WORK',
    tags:['focus','docs'], priority:'p2', lifeArea:'career', timeEstimate:'1h',
    delegatedTo:'Riley', delegatedAt:__agoIso(6, 14, 0),
    delegationStatus:'waiting', checkInSchedule:[3,7],
    delegationHistory:[{to:'Alex', at:__agoIso(12, 9, 0)}],
    personalReminderDate:__relDate(4),
    description:'Originally with Alex — moved to Riley after Alex got pulled into Q1 close.',
    activity:[
      {type:'created', at:__agoIso(12, 9, 0)},
      {type:'delegated', to:'Alex', at:__agoIso(12, 9, 0)},
      {type:'re-delegated', from:'Alex', to:'Riley', at:__agoIso(6, 14, 0)},
      {type:'cadence-changed', schedule:[3,7], at:__agoIso(6, 14, 1)},
      {type:'note', text:'Riley confirmed Monday morning send', at:__agoIso(6, 15, 0)},
    ],
    lastContactAt:__agoIso(6, 15, 0)}),

  // dl12 — Fresh today, no activity yet. Tests the "Day 0 / Now" state.
  makeTask({id:'dl12', title:'Customer churn analysis — last 90 days', project:'WORK',
    tags:['focus','docs'], priority:'p2', lifeArea:'career', timeEstimate:'3h',
    delegatedTo:'Morgan', delegatedAt:__agoIso(0, 1, 0),
    delegationStatus:'waiting', checkInSchedule:[3,7,14],
    expiryDate:__relDate(7),
    description:'Pull from Mixpanel, segment by cohort, write the summary deck.',
    activity:[
      {type:'created', at:__agoIso(0, 1, 0)},
      {type:'delegated', to:'Morgan', at:__agoIso(0, 1, 0)},
    ]}),

  // dl13 — Heavy nudge history, overdue. Tests the timeline with multiple
  // real nudge events stacked at different days.
  makeTask({id:'dl13', title:'Hyperion proposal — pricing slide', project:'WORK',
    tags:['focus','docs'], priority:'p1', lifeArea:'career', timeEstimate:'1h',
    delegatedTo:'Sam', delegatedAt:__agoIso(14),
    delegationStatus:'sent', checkInSchedule:[2,5,10],
    expiryDate:__relDate(-3),
    description:'Three nudges in and still no draft. Pricing input for the Hyperion proposal — partner asks weekly.',
    activity:[
      {type:'created', at:__agoIso(14)},
      {type:'delegated', to:'Sam', at:__agoIso(14)},
      {type:'cadence-changed', schedule:[2,5,10], at:__agoIso(14, 9, 1)},
      {type:'nudge-sent', day:2, at:__agoIso(12, 10, 0)},
      {type:'chased', text:'asked again in Slack — "still working on it"', at:__agoIso(10, 14, 0)},
      {type:'nudge-sent', day:5, at:__agoIso(9, 10, 0)},
      {type:'note', text:'Sam moved this to next week — partner needs to know', at:__agoIso(7, 11, 0)},
      {type:'nudge-sent', day:10, at:__agoIso(4, 10, 0)},
      {type:'chased', text:'flagged to manager — escalating', at:__agoIso(2, 16, 0)},
    ],
    lastContactAt:__agoIso(2, 16, 0)}),

  // dl14 — Heard back today, cadence done. Tests the "fresh good news" state.
  makeTask({id:'dl14', title:'Q3 OKRs — draft for leadership review', project:'WORK',
    tags:['focus','docs'], priority:'p1', lifeArea:'career', timeEstimate:'2h',
    delegatedTo:'Riley', delegatedAt:__agoIso(7),
    delegationStatus:'heard-back', checkInSchedule:[3,7],
    description:'Riley confirmed the draft this morning. Will land in the leadership review Thursday.',
    activity:[
      {type:'created', at:__agoIso(7)},
      {type:'delegated', to:'Riley', at:__agoIso(7)},
      {type:'cadence-changed', schedule:[3,7], at:__agoIso(7, 9, 1)},
      {type:'nudge-sent', day:3, at:__agoIso(4, 10, 0)},
      {type:'note', text:'first pass landed, looks good', at:__agoIso(4, 16, 0)},
      {type:'heard-back', day:7, at:__agoIso(0, 9, 0)},
      {type:'note', text:'final draft confirmed — ready for review', at:__agoIso(0, 9, 5)},
    ],
    lastContactAt:__agoIso(0, 9, 5)}),

  // dl15 — Very stale, no contact in weeks. Tests the "stale" classifier.
  makeTask({id:'dl15', title:'Legacy CRM data export — pull to S3', project:'ADMIN',
    tags:['admin'], priority:'p3', lifeArea:'career', timeEstimate:'1h',
    delegatedTo:'Marcus', delegatedAt:__agoIso(28),
    delegationStatus:'waiting', checkInSchedule:[7,14,21],
    description:"Background job, no urgency. Marcus said he'd batch this with the Q1 archive work.",
    activity:[
      {type:'created', at:__agoIso(28)},
      {type:'delegated', to:'Marcus', at:__agoIso(28)},
      {type:'cadence-changed', schedule:[7,14,21], at:__agoIso(28, 9, 1)},
      {type:'nudge-sent', day:7, at:__agoIso(21, 10, 0)},
      {type:'note', text:'Marcus said "next week" — that was two weeks ago', at:__agoIso(15, 11, 0)},
    ],
    lastContactAt:__agoIso(15, 11, 0)}),

  // dl16 — Reminder coming up in 2 days. Tests the purple reminder dot on the week strip.
  makeTask({id:'dl16', title:'Vendor onboarding — Snyk security review', project:'WORK',
    tags:['admin','focus'], priority:'p2', lifeArea:'career', timeEstimate:'45m',
    delegatedTo:'Devon', delegatedAt:__agoIso(3),
    delegationStatus:'waiting', checkInSchedule:[3,7],
    personalReminderDate:__relDate(2),
    description:'Devon to fill the security questionnaire. Reminder set so I follow up Thursday regardless.',
    activity:[
      {type:'created', at:__agoIso(3)},
      {type:'delegated', to:'Devon', at:__agoIso(3)},
      {type:'cadence-changed', schedule:[3,7], at:__agoIso(3, 9, 1)},
    ]}),

  // dl17 — Re-delegated chain, due tomorrow. Tests both delegationHistory and the
  // "due tomorrow" relative-time label on the badge.
  makeTask({id:'dl17', title:'Internal handbook — engineering section refresh', project:'WORK',
    tags:['docs'], priority:'p2', lifeArea:'career', timeEstimate:'2h',
    delegatedTo:'Pat', delegatedAt:__agoIso(4),
    delegationStatus:'waiting', checkInSchedule:[2,5],
    expiryDate:__relDate(1),
    delegationHistory:[{to:'Casey', at:__agoIso(10, 9, 0)}],
    description:'Was with Casey, moved to Pat after Casey took parental leave. Due tomorrow for the all-hands.',
    activity:[
      {type:'created', at:__agoIso(10, 9, 0)},
      {type:'delegated', to:'Casey', at:__agoIso(10, 9, 0)},
      {type:'re-delegated', from:'Casey', to:'Pat', at:__agoIso(4)},
      {type:'cadence-changed', schedule:[2,5], at:__agoIso(4, 0, 1)},
      {type:'nudge-sent', day:2, at:__agoIso(2, 10, 0)},
      {type:'note', text:'Pat: drafting tonight, send tomorrow AM', at:__agoIso(1, 19, 0)},
    ],
    lastContactAt:__agoIso(1, 19, 0)}),

  // === Blocked task ===
  makeTask({id:'bl1', title:'Acme — flip launch page DNS to live', project:'WORK',
    tags:['focus','blocked'], priority:'p1', timeEstimate:'15m', lifeArea:'career',
    date:'2026-05-13',
    blocked:true, blockedReason:'Awaiting QA sign-off on staging', blockedBy:['p1s4'],
    blockedSince:'2026-04-29T09:00:00.000Z',
    activity:[
      {type:'created', at:'2026-04-25T10:00:00.000Z'},
      {type:'blocked', reason:'Awaiting QA sign-off on staging', blockedBy:['p1s4'], at:'2026-04-29T09:00:00.000Z'},
    ]}),
];

// Seed events for the calendar drawer in dev-bypass mode. Dates are applied
// at load time so today's drawer is always populated; event ids are stable
// so reloads don't keep stacking duplicates. Mix of task-linked blocks and a
// freeform "Lunch" time block to exercise both code paths.
const INIT_EVENTS = [
  { id:'ev1', taskId:'d3', startMin: 7*60 + 30, durationMin: 30 },
  { id:'ev2', taskId:'d1', startMin: 9*60,      durationMin: 90 },
  { id:'ev3', taskId:null, title:'Lunch & walk', color:'#5eead4', startMin: 12*60, durationMin: 45 },
  { id:'ev4', taskId:'d2', startMin: 14*60,     durationMin: 45 },
];



export {
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
  prevOccurrence,
  recurrenceLabel,
  deriveIsRoutine,
  ensureRecurrenceFields,
  migrateRecurrence,
  mkRecurrenceId,
  computeStreak,
  routinesRollup,
  DAY_INDEX,
  DAY_CODES,
  DAY_CODE_S,
  resolveRelativeSnoozeDate,
  rollTaskDateForward,
  rollIncompleteTasksToToday,
  archiveStaleRoutines,
  extendRoutineHorizon,
  pruneOrphanCheckIns,
  makeTask,
  migrateTasks,
  syncTaskSnooze,
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
};
