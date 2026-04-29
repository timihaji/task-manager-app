// Task Manager — shared constants, helpers, data
// All exports available on window.*

const PROJ = [
  { id:'LIFE',  label:'Life',  color:'#86efac' },
  { id:'HOME',  label:'Home',  color:'#fcd34d' },
  { id:'WORK',  label:'Work',  color:'#a5b4fc' },
  { id:'ADMIN', label:'Admin', color:'#94a3b8' },
];

const ALL_TAGS = ['sunsama','work','focus','mtg','health','code','docs','comm','admin','learn','personal','blocked'];

const TAG_NAMES = {
  sunsama:'Sunsama', work:'Work', focus:'Deep Focus', mtg:'Meeting', health:'Health',
  code:'Code', docs:'Docs', comm:'Comms', admin:'Admin',
  learn:'Learning', personal:'Personal', blocked:'Blocked',
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
  personal:{bg:'rgba(244,63,94,.15)',fg:'#fda4af'},
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
  personal:{bg:'#fff1f2',fg:'#be123c'},
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
  str:   (d) => d.toISOString().slice(0,10),
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

const nextOccurrence = (task, fromDateStr) => {
  if (!task.recurrence) return null;
  const { freq, interval=1 } = task.recurrence;
  const from = D.parse(fromDateStr);
  if (freq==='daily') return D.str(D.add(from, interval));
  if (freq==='weekdays') { let n=D.add(from,1); while([0,6].includes(n.getDay())) n=D.add(n,1); return D.str(n); }
  if (freq==='weekly') return D.str(D.add(from, 7*interval));
  if (freq==='monthly') { const d=new Date(from); d.setMonth(d.getMonth()+interval); return D.str(d); }
  return null;
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

// People store — keyed by lowercase name. Lightweight memory of who you delegate
// to and what cadence you tend to use, so the next delegation pre-fills.
const PEOPLE_STORAGE_KEY = 'tm_delegation_people_v1';

const loadPeople = () => {
  try {
    const raw = localStorage.getItem(PEOPLE_STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return (p && typeof p === 'object') ? p : {};
  } catch { return {}; }
};

const savePeople = (people) => {
  try { localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people || {})); } catch {}
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
const peopleRollup = (tasks=[]) => {
  const todayStr = D.str(D.today());
  const byName = new Map();
  for (const t of tasks) {
    if (!t || !t.delegatedTo || t.done) continue;
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
      if (ct && !ct.done && ct.date && ct.date < todayStr) { entry.overdueCount += 1; break; }
    }
    if (t.lastContactAt && (!entry.lastContactAt || t.lastContactAt > entry.lastContactAt)) {
      entry.lastContactAt = t.lastContactAt;
    }
  }
  return Array.from(byName.values()).sort((a,b) => b.oldestDays - a.oldestDays);
};

const makeTask = (overrides={}) => ({
  id:mkid(), title:'Untitled task', description:'', subtasks:[],
  project:'LIFE', tags:['personal'], priority:'p3', date:null,
  lifeArea:null,
  timeEstimate:null, done:false, completedAt:null, snoozedUntil:null,
  recurrence:null, activity:[{type:'created',at:new Date().toISOString()}],
  createdAt:new Date().toISOString(),
  cardType:'task', parentId:null, childOrder:null,
  blocked:false, blockedReason:'', blockedBy:[], blockedSince:null, followUpAt:null,
  delegatedTo:null, delegatedAt:null, delegationStatus:null,
  checkInSchedule:null, checkInTaskIds:[], checkInOf:null, checkInDayOffset:null,
  expiryDate:null, expiryTaskId:null, expiryOf:null,
  lastContactAt:null, delegationHistory:[],
  ...overrides,
});

// Migration for tasks loaded from localStorage that pre-date newer fields.
// Idempotent: leaves already-migrated tasks alone.
const migrateTasks = (tasks=[]) => tasks.map(t => ({
  cardType: t.cardType || 'task',
  parentId: t.parentId === undefined ? null : t.parentId,
  childOrder: t.childOrder === undefined ? null : t.childOrder,
  lifeArea: t.lifeArea === undefined ? null : t.lifeArea,
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
  ...t,
}));

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
  makeTask,
  migrateTasks,
  parseTimeEst,
  fmtTimeEst,
  INIT_TASKS,
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
  PEOPLE_STORAGE_KEY,
  loadPeople,
  savePeople,
  recordDelegation,
  adjustOpenCount,
  getPreferredCadence,
  recordContact,
  peopleRollup,
  personKey,
};
