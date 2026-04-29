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
} from './data.js';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useDeferredValue  } from "react";
import ReactDOM from "react-dom/client";
// ── extracted utilities ──────────────────────────────────────────────────
import { I } from './utils/icons.jsx';
import { TIME_PRESETS, TIME_MORE, PRI_INFO, SNOOZE_OPTS } from './utils/constants.js';
import { parseNLDate } from './utils/parseNLDate.js';

// ── extracted leaf components ────────────────────────────────────────────
import { CardPopover } from './components/CardPopover.jsx';
import { MiniCalendar } from './components/MiniCalendar.jsx';
import { TagPicker, ProjPicker, TimePicker, DatePicker, PriPicker, SnoozePicker } from './components/pickers.jsx';
import { ContextMenu } from './components/ContextMenu.jsx';
import { PriBars } from './components/PriBars.jsx';

// ── TaskCard ─────────────────────────────────────────────────────────────
// ── extracted heavy components ───────────────────────────────────────────
import { TaskCard } from './components/TaskCard.jsx';
import { GroupByDropdown } from './components/GroupByDropdown.jsx';
import { Column, InboxCol } from './components/Column.jsx';
function ProjectSidePanel({ tasks, activeProjects, width, collapsed, stickyLeft, onCollapse, onResizeStart, onProjectToggle }) {
  const openTasks = tasks.filter(t=>!t.done&&!t.archived&&!t.blocked);
  return (
    <div className={`side-panel project-col${collapsed?' collapsed':''}`} style={{width, minWidth:collapsed?34:140, left:stickyLeft}}>
      <div className="project-hdr">
        <div className="side-panel-tools">
          <div className="project-title">Location</div>
          <button className="side-collapse" onClick={onCollapse} title={collapsed?'Expand location':'Collapse location'}><I.Chv d={collapsed?'r':'l'}/></button>
        </div>
        <div className="project-cnt">{openTasks.length}</div>
      </div>
      <div className="project-list">
        {PROJ.map(p=>{
          const cnt=openTasks.filter(t=>t.project===p.id).length;
          const active=activeProjects.includes(p.id);
          return (
            <button key={p.id} className={`project-pill${active?' active':''}`} onClick={()=>onProjectToggle(p.id)}>
              <span className="proj-dot" style={{background:p.color}}/>
              <span>{p.label}</span>
              <span className="project-pill-count">{cnt}</span>
            </button>
          );
        })}
      </div>
      {!collapsed && <div className="side-resizer" onMouseDown={e=>onResizeStart(e,'projects')}/>}
    </div>
  );
}

function LeftNav({ tasks, view, onView, collapsed, onSettings, activeLifeAreas, onLifeAreaToggle, theme }) {
  const all=tasks.filter(t=>!t.archived);
  const byId = new Map(all.map(t=>[t.id,t]));
  const getLifeAreaForTask = (task, seen=new Set()) => {
    if(!task) return null;
    if(task.lifeArea !== null && task.lifeArea !== undefined) return task.lifeArea;
    if(!task.parentId || seen.has(task.id)) return null;
    seen.add(task.id);
    return getLifeAreaForTask(byId.get(task.parentId), seen);
  };
  const counts = {
    inbox: all.filter(t=>!t.date&&!t.done&&!t.snoozedUntil&&!t.someday&&!t.blocked).length,
    today: all.filter(t=>D.isTdy(t.date)&&!t.done&&!t.blocked).length,
    upcoming: all.filter(t=>D.isFut(t.date)&&!t.done&&!t.blocked).length,
    snoozed: all.filter(t=>!!t.snoozedUntil&&!t.done).length,
    someday: all.filter(t=>!!t.someday&&!t.done).length,
    blocked: all.filter(t=>t.blocked&&!t.done).length,
    completed: all.filter(t=>t.done).length,
    archived: tasks.filter(t=>t.archived).length,
  };
  const viewIs = (v) => typeof view==='string'?view===v:(view?.type===v.type&&view?.id===v.id);
  const NavItem=({ico,label,v,cnt})=>{
    const Ico=ico;
    return <div className={`lnav-item${viewIs(v)?' active':''}`} onClick={()=>onView(v)}>
      <Ico/><span>{label}</span>{cnt>0&&<span className="lnav-cnt">{cnt}</span>}
    </div>;
  };
  return (
    <div className={`lnav${collapsed?' collapsed':''}`}>
      <div className="lnav-sec">
        <NavItem ico={I.Cal} label="Timeline" v="week" cnt={counts.today}/>
        <NavItem ico={I.Inbox} label="Inbox" v="inbox" cnt={counts.inbox}/>
        <NavItem ico={I.Star} label="Upcoming" v="upcoming" cnt={counts.upcoming}/>
        <NavItem ico={I.Archive} label="Backlog" v="backlog" cnt={all.filter(t=>!t.date&&!t.done).length}/>
        <NavItem ico={I.Snooze} label="Snoozed" v="snoozed" cnt={counts.snoozed}/>
        <NavItem ico={I.Someday} label="Someday" v="someday" cnt={counts.someday}/>
        <NavItem ico={I.Pause} label="Blocked" v="blocked" cnt={counts.blocked}/>
        <NavItem ico={I.Check} label="Completed" v="completed" cnt={counts.completed}/>
        <NavItem ico={I.Archive} label="Archived" v="archived" cnt={counts.archived}/>
      </div>
      <div className="lnav-sec">
        <div className="lnav-lbl">Location</div>
        {PROJ.map(p=>{
          const cnt=all.filter(t=>t.project===p.id&&!t.done).length;
          return <div key={p.id} className={`lnav-item${viewIs({type:'project',id:p.id})?' active':''}`}
            onClick={()=>onView({type:'project',id:p.id})}>
            <div className="proj-dot" style={{background:p.color}}/>
            <span>{p.label}</span>
            {cnt>0&&<span className="lnav-cnt">{cnt}</span>}
          </div>;
        })}
      </div>
      <div className="lnav-sec">
        <div className="lnav-lbl">Tags</div>
        {ALL_TAGS.filter(t=>all.some(task=>(task.tags||[]).includes(t)&&!task.done)).map(t=>{
          const c=(TAG_DARK)[t]||TAG_DARK.admin;
          return <div key={t} className={`lnav-item${viewIs({type:'tag',name:t})?' active':''}`}
            onClick={()=>onView({type:'tag',name:t})}>
            <span style={{width:6,height:6,borderRadius:1,background:c.fg,flexShrink:0,display:'inline-block'}}/>
            <span>{TAG_NAMES[t]}</span>
            <span className="lnav-cnt">{all.filter(task=>(task.tags||[]).includes(t)&&!task.done).length}</span>
          </div>;
        })}
      </div>
      <div className="lnav-sec">
        <div className="lnav-lbl">Life Areas</div>
        {LIFE_AREAS.filter(id=>all.some(task=>getLifeAreaForTask(task)===id&&!task.done)).map(id=>{
          const c = lifeAreaPalette(id, theme);
          const cnt = all.filter(task=>getLifeAreaForTask(task)===id&&!task.done).length;
          return <div key={id} className={`lnav-item${activeLifeAreas?.includes(id)?' active':''}`}
            onClick={()=>onLifeAreaToggle?.(id)}>
            <span style={{width:6,height:6,borderRadius:1,background:c.fg,flexShrink:0,display:'inline-block'}}/>
            <span>{LIFE_AREA_NAMES[id]||id}</span>
            <span className="lnav-cnt">{cnt}</span>
          </div>;
        })}
        <div className={`lnav-item${activeLifeAreas?.includes(UNASSIGNED_LIFE_AREA)?' active':''}`}
          onClick={()=>onLifeAreaToggle?.(UNASSIGNED_LIFE_AREA)}>
          <span style={{width:6,height:6,borderRadius:1,background:'var(--t4)',flexShrink:0,display:'inline-block'}}/>
          <span>Unassigned</span>
          <span className="lnav-cnt">{all.filter(task=>!getLifeAreaForTask(task)&&!task.done).length}</span>
        </div>
      </div>
      <div className="lnav-sync"><div className="sync-dot"/><span>Synced · just now</span></div>
      <div style={{padding:'4px 8px 8px'}}>
        <div className="lnav-item" onClick={onSettings}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Settings</span>
        </div>
      </div>
    </div>
  );
}

// ── CommandPalette ───────────────────────────────────────────────────────
const CMDS=[
  {i:'Plus',l:'New task',k:'N'},{i:'Archive',l:'Archive focused task',k:'C'},{i:'Cal',l:'Jump to today',k:'T'},
  {i:'Moon',l:'Toggle theme',k:'L'},{i:'Filter',l:'Toggle weekends',k:'W'},
  {i:'Star',l:'Priorities view'},{i:'Inbox',l:'Go to inbox'},
];
function CommandPalette({ onClose, onCmd }) {
  const [q,setQ]=useState(''); const [sel,setSel]=useState(0);
  const ref=useRef(null);
  useEffect(()=>ref.current?.focus(),[]);
  const items=CMDS.filter(c=>c.l.toLowerCase().includes(q.toLowerCase()));
  const onKey=e=>{ if(e.key==='Escape')onClose(); if(e.key==='ArrowDown'){e.preventDefault();setSel(s=>Math.min(s+1,items.length-1));} if(e.key==='ArrowUp'){e.preventDefault();setSel(s=>Math.max(s-1,0));} if(e.key==='Enter'){onCmd(items[sel]);onClose();} };
  return <div className="overlay-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="palette" onKeyDown={onKey}>
      <div className="pal-input-row"><I.Search/><input ref={ref} className="pal-input" placeholder="Search or run a command…" value={q} onChange={e=>{setQ(e.target.value);setSel(0);}}/><span className="pal-esc">esc</span></div>
      <div className="pal-sec-lbl">Commands</div>
      {items.map((c,i)=>{const Ico=I[c.i]||I.Star; return <div key={i} className={`pal-item${i===sel?' sel':''}`} onClick={()=>{onCmd(c);onClose();}}><Ico/><span className="pal-item-lbl">{c.l}</span>{c.k&&<span className="pal-item-kbd">{c.k}</span>}</div>;})}
      <div className="pal-footer"><span><kbd>↑↓</kbd>navigate</span><span><kbd>↵</kbd>run</span><span><kbd>esc</kbd>close</span></div>
    </div>
  </div>;
}

// ── ShortcutsOverlay ─────────────────────────────────────────────────────
const SC_ROWS=[['J / K','Next / prev card'],['← →','Prev / next column'],['X','Toggle complete'],['E','Rename hovered card'],['N','New task'],['A','New task at cursor'],['C','Archive hovered card'],['T','Jump to today'],['1 2 3','Set priority P1/P2/P3'],['[ ]','Move card ←/→ day'],['D','Duplicate card'],['⌫','Delete card'],['Z','Toggle Someday'],['⌘Z','Undo'],['S','Snooze (open drawer)'],['L','Toggle theme'],['W','Toggle weekends'],['⌘K','Command palette'],['⌘\\','Toggle sidebar'],['?','This overlay'],['Esc','Close / clear focus']];
function ShortcutsOverlay({ onClose }) {
  return <div className="overlay-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="sc-panel">
      <div className="sc-title">Keyboard Shortcuts</div>
      <div className="sc-grid">{SC_ROWS.map(([k,d])=><div key={k} className="sc-row"><kbd>{k}</kbd><span className="sc-row-desc">{d}</span></div>)}</div>
    </div>
  </div>;
}

// Color/taxonomy helpers extracted to ./utils/colors.js
import { slugId, tagColors, lifeAreaPalette, UNASSIGNED_LIFE_AREA } from './utils/colors.js';

function syncTaxonomyGlobals(taxonomy) {
  const contexts = taxonomy?.contexts?.length ? taxonomy.contexts : PROJ;
  const tags = taxonomy?.tags?.length ? taxonomy.tags : ALL_TAGS.map(id=>({id,label:TAG_NAMES[id]||id,...tagColors(id)}));
  const lifeAreas = taxonomy?.lifeAreas?.length ? taxonomy.lifeAreas : LIFE_AREAS.map(id=>({
    id,
    label:LIFE_AREA_NAMES[id]||id,
    color:(LIFE_AREA_LIGHT[id]||tagColors(id).light).fg,
    dark:LIFE_AREA_DARK[id]||tagColors(id).dark,
    light:LIFE_AREA_LIGHT[id]||tagColors(id).light,
  }));
  PROJ.splice(0, PROJ.length, ...contexts.map(c=>({id:c.id,label:c.label,color:c.color})));
  ALL_TAGS.splice(0, ALL_TAGS.length, ...tags.map(t=>t.id));
  LIFE_AREAS.splice(0, LIFE_AREAS.length, ...lifeAreas.map(a=>a.id));
  Object.keys(TAG_NAMES).forEach(k=>delete TAG_NAMES[k]);
  Object.keys(LIFE_AREA_NAMES).forEach(k=>delete LIFE_AREA_NAMES[k]);
  tags.forEach(t=>{ TAG_NAMES[t.id]=t.label; });
  lifeAreas.forEach(a=>{ LIFE_AREA_NAMES[a.id]=a.label; });
  tags.forEach(t=>{
    const fallback = tagColors(t.id);
    TAG_DARK[t.id] = t.dark || fallback.dark;
    TAG_LIGHT[t.id] = t.light || fallback.light;
  });
  lifeAreas.forEach(a=>{
    const fallback = tagColors(a.id);
    LIFE_AREA_DARK[a.id] = a.dark || fallback.dark;
    LIFE_AREA_LIGHT[a.id] = a.light || fallback.light;
  });
}

const NICE_SWATCH_GROUPS = [
  {name:'Pastel', colors:[
    ['Blush','#fce7f3','#9d174d'],['Petal','#ffe4e6','#9f1239'],['Shell','#ffe4dc','#9f2d14'],
    ['Peach','#ffedd5','#9a3412'],['Apricot','#ffead0','#a0440e'],['Cream','#fef3c7','#92400e'],
    ['Butter','#fef9c3','#854d0e'],['Lemon','#fef08a','#713f12'],['Pear','#ecfccb','#3f6212'],
    ['Pistachio','#dcfce7','#166534'],['Mint','#d1fae5','#065f46'],['Seafoam','#ccfbf1','#115e59'],
    ['Aqua Wash','#cffafe','#155e75'],['Sky','#e0f2fe','#075985'],['Powder','#dbeafe','#1e40af'],
    ['Periwinkle','#e0e7ff','#3730a3'],['Lavender','#ede9fe','#5b21b6'],['Wisteria','#f3e8ff','#6b21a8'],
    ['Lilac','#fae8ff','#86198f'],['Candy','#fce7f3','#be185d'],['Oat','#f5efe6','#6f4e37'],
    ['Linen','#faf3e8','#7c4a1d'],['Fog','#f3f4f6','#4b5563'],['Mist','#f1f5f9','#475569'],
  ]},
  {name:'Soft', colors:[
    ['Rose','#fda4af','#be123c'],['Salmon','#fca5a5','#b91c1c'],['Coral','#fdba74','#c2410c'],
    ['Tangerine','#fed7aa','#c2410c'],['Honey','#fde68a','#a16207'],['Marigold','#fcd34d','#92400e'],
    ['Chartreuse','#d9f99d','#4d7c0f'],['Sage','#bef264','#4d7c0f'],['Meadow','#86efac','#15803d'],
    ['Clover','#6ee7b7','#047857'],['Teal','#5eead4','#0f766e'],['Lagoon','#99f6e4','#0f766e'],
    ['Aqua','#67e8f9','#0e7490'],['Ice','#a5f3fc','#155e75'],['Blue','#93c5fd','#1d4ed8'],
    ['Cornflower','#bfdbfe','#1d4ed8'],['Violet','#c4b5fd','#6d28d9'],['Iris','#ddd6fe','#6d28d9'],
    ['Orchid','#f0abfc','#a21caf'],['Pink','#f9a8d4','#be185d'],['Raspberry','#f9a8d4','#9d174d'],
    ['Blue Grey','#cbd5e1','#475569'],['Warm Grey','#d6d3d1','#57534e'],['Slate','#b6c2d1','#334155'],
  ]},
  {name:'Earthy', colors:[
    ['Clay','#d6a17a','#7c2d12'],['Adobe','#c98b68','#7c2d12'],['Terracotta','#f2a37b','#9a3412'],
    ['Rust','#d8895f','#7c2d12'],['Canyon','#e1b07e','#854d0e'],['Sand','#e7d8ad','#765d16'],
    ['Straw','#ddd093','#5f520e'],['Olive','#b7c58b','#4d5f12'],['Moss','#a8b879','#3f6212'],
    ['Fern','#9cc7a4','#166534'],['Pine Wash','#8fbca0','#14532d'],['Eucalyptus','#9ac7bd','#115e59'],
    ['Juniper','#86b6ad','#134e4a'],['Rain','#9dbfca','#164e63'],['Denim','#9bb8d8','#1e3a8a'],
    ['Dusk','#afa7cf','#4c1d95'],['Heather','#c4a7c9','#6b216f'],['Mauve','#d8a9c5','#831843'],
    ['Cocoa','#b89b86','#5b3425'],['Mocha','#a78b7a','#4b2e22'],['Walnut','#917567','#3f2a20'],
    ['Stone','#b8b4aa','#57534e'],['Smoke','#a8a29e','#44403c'],['Ink','#94a3b8','#334155'],
  ]},
  {name:'Vivid', colors:[
    ['Red','#ef4444','#991b1b'],['Cherry','#dc2626','#7f1d1d'],['Orange','#f97316','#9a3412'],
    ['Tangerine','#fb923c','#9a3412'],['Amber','#f59e0b','#92400e'],['Gold','#eab308','#854d0e'],
    ['Lime','#84cc16','#3f6212'],['Grass','#65a30d','#365314'],['Green','#22c55e','#166534'],
    ['Emerald','#10b981','#047857'],['Jade','#14b8a6','#0f766e'],['Teal','#0d9488','#115e59'],
    ['Cyan','#06b6d4','#0e7490'],['Azure','#0ea5e9','#0369a1'],['Sky','#38bdf8','#075985'],
    ['Blue','#3b82f6','#1d4ed8'],['Royal','#2563eb','#1e3a8a'],['Indigo','#6366f1','#4338ca'],
    ['Violet','#8b5cf6','#6d28d9'],['Purple','#a855f7','#7e22ce'],['Fuchsia','#d946ef','#a21caf'],
    ['Magenta','#ec4899','#be185d'],['Pink','#f43f5e','#be123c'],['Crimson','#e11d48','#9f1239'],
  ]},
  {name:'Neutral', colors:[
    ['White','#fafafa','#404040'],['Pearl','#f5f5f4','#44403c'],['Cloud','#e5e7eb','#4b5563'],
    ['Ash','#e7e5e4','#57534e'],['Silver','#d4d4d8','#52525b'],['Pewter','#c7c7c7','#404040'],
    ['Slate','#94a3b8','#334155'],['Blue Slate','#9ca3af','#374151'],['Taupe','#a8a29e','#57534e'],
    ['Greige','#bbb2a6','#57534e'],['Graphite','#737373','#404040'],['Charcoal','#525252','#262626'],
    ['Night','#334155','#e2e8f0'],['Ink','#1f2937','#f3f4f6'],['Black','#111827','#f9fafb'],
  ]},
  {name:'Candy Pastel', colors:[
    ['Cotton Candy','#ffd6e8','#9d174d'],['Bubblegum','#ffc9de','#9f1239'],['Sorbet','#ffd0c2','#9a3412'],
    ['Creamsicle','#ffd8a8','#9a3412'],['Vanilla','#fff0b8','#854d0e'],['Banana Milk','#fff7a8','#713f12'],
    ['Key Lime','#dff7a8','#3f6212'],['Melon','#c8f7c5','#166534'],['Mint Cream','#bdf7df','#065f46'],
    ['Blue Taffy','#bdf2ff','#155e75'],['Cloud Blue','#cfe6ff','#1e40af'],['Grape Soda','#dbcfff','#5b21b6'],
    ['Marshmallow','#f3dbff','#86198f'],['Sugar Plum','#ffd6f4','#9d174d'],['Macaron','#f7e7d4','#6f4e37'],
    ['Frosting','#f7f1ff','#6b21a8'],['Powder Puff','#f0f7ff','#1e3a8a'],['Confetti','#f8fafc','#475569'],
  ]},
  {name:'Botanical', colors:[
    ['Moss Milk','#dbe8bd','#4d5f12'],['Olive Leaf','#c9d79a','#4d5f12'],['Sagebrush','#c9d7bf','#3f6212'],
    ['Fern Mist','#b8d7b9','#166534'],['Clover Soft','#a9dfbf','#15803d'],['Mint Leaf','#a6e3cf','#047857'],
    ['Eucalyptus','#a7d4ca','#115e59'],['Spruce Wash','#91beb3','#134e4a'],['Lichen','#d2d2a1','#5f520e'],
    ['Bamboo','#e0d99b','#765d16'],['Pollen','#f0d980','#92400e'],['Terrarium','#b6cc8f','#3f6212'],
    ['Aloe','#95d5b2','#166534'],['Sea Grass','#8ed6c4','#0f766e'],['Canopy','#78b88a','#14532d'],
    ['Pine','#5f9672','#f0fdf4'],['Forest','#47755a','#ecfdf5'],['Mushroom','#c9b7a2','#5b3425'],
  ]},
  {name:'Coastal', colors:[
    ['Foam','#d9fbf4','#115e59'],['Sea Glass','#b7efe5','#0f766e'],['Tide Pool','#9ee6df','#0f766e'],
    ['Lagoon','#8bdde8','#0e7490'],['Aqua Haze','#b5edf7','#155e75'],['Shallow','#c6e8ff','#075985'],
    ['Skyline','#afd7ff','#1d4ed8'],['Harbor Blue','#94bde6','#1e3a8a'],['Denim Tide','#7ea5d8','#1e3a8a'],
    ['Shell Pink','#ffd8d2','#9f1239'],['Coral Reef','#f5a992','#9a3412'],['Sand Dollar','#eadfbd','#765d16'],
    ['Driftwood','#c8b7a0','#57534e'],['Pebble','#b9c0bd','#475569'],['Storm','#8197a8','#334155'],
    ['Deep Sea','#3f7284','#e0f2fe'],['Navy Pier','#31506f','#dbeafe'],['Kelp','#6a8f79','#ecfdf5'],
  ]},
  {name:'Sunset', colors:[
    ['Afterglow','#ffe1cc','#9a3412'],['Peach Sky','#ffc9a8','#9a3412'],['Coral Sun','#ffad99','#991b1b'],
    ['Flamingo','#ff9eb5','#9f1239'],['Rose Glow','#f6a2c8','#9d174d'],['Orchid Sky','#d7a6e8','#6b21a8'],
    ['Lavender Hour','#b9a7e8','#4c1d95'],['Blue Hour','#93acd8','#1e3a8a'],['Dusk Blue','#7389bf','#eef2ff'],
    ['Amber Light','#f8c76d','#92400e'],['Honey Gold','#eeb85c','#854d0e'],['Persimmon','#e8875c','#7c2d12'],
    ['Burnt Rose','#d96f7f','#7f1d1d'],['Plum Dust','#aa6d95','#fdf2f8'],['Twilight','#705f95','#ede9fe'],
    ['Cinder','#7b6b73','#f5f5f4'],['Warm Stone','#b59c85','#4b2e22'],['Nightfall','#384260','#e0e7ff'],
  ]},
  {name:'Jewel', colors:[
    ['Ruby','#dc2626','#fee2e2'],['Garnet','#b91c1c','#fee2e2'],['Topaz','#d97706','#fff7ed'],
    ['Citrine','#ca8a04','#fef9c3'],['Peridot','#65a30d','#ecfccb'],['Emerald','#059669','#d1fae5'],
    ['Jade','#0d9488','#ccfbf1'],['Turquoise','#0891b2','#cffafe'],['Sapphire','#2563eb','#dbeafe'],
    ['Cobalt','#1d4ed8','#dbeafe'],['Amethyst','#7c3aed','#ede9fe'],['Violet Gem','#9333ea','#f3e8ff'],
    ['Pink Tourmaline','#db2777','#fce7f3'],['Spinel','#e11d48','#ffe4e6'],['Onyx','#1f2937','#f9fafb'],
    ['Moonstone','#cbd5e1','#334155'],['Opal','#bae6fd','#075985'],['Pearl','#f5f5f4','#44403c'],
  ]},
  {name:'Vintage', colors:[
    ['Faded Rose','#d8a2a8','#7f1d1d'],['Dusty Pink','#d6a3bd','#831843'],['Tea Rose','#e7b7a6','#7c2d12'],
    ['Apricot Jam','#e6b17e','#854d0e'],['Mustard','#d4b45f','#713f12'],['Old Gold','#c7aa57','#5f520e'],
    ['Avocado','#a8a968','#3f6212'],['Sage','#a8b89a','#3f6212'],['Patina','#8fb8aa','#115e59'],
    ['Powder Blue','#9eb8d4','#1e3a8a'],['Faded Denim','#819bc2','#1e3a8a'],['Dusty Violet','#a69ac2','#4c1d95'],
    ['Mauve','#b98cab','#831843'],['Sepia','#9f8068','#4b2e22'],['Parchment','#e8d9ba','#765d16'],
    ['Smoke','#9f9a91','#44403c'],['Charcoal Blue','#5e6a7d','#e0e7ff'],['Library Green','#58735e','#ecfdf5'],
  ]},
  {name:'Cafe', colors:[
    ['Milk','#fbf4e8','#6f4e37'],['Cream','#f4e2c6','#765d16'],['Biscuit','#e8cfa7','#765d16'],
    ['Latte','#d7b996','#5b3425'],['Caramel','#c8955e','#4b2e22'],['Toffee','#b57a48','#fff7ed'],
    ['Mocha','#8f6a56','#fff7ed'],['Cocoa','#72513f','#fef3c7'],['Espresso','#4a3328','#f5efe6'],
    ['Pistachio Gelato','#c8d9a3','#4d5f12'],['Matcha','#9fbf7a','#3f6212'],['Rose Milk','#f0c7c9','#9f1239'],
    ['Blueberry Cream','#b8c6e2','#1e3a8a'],['Lavender Latte','#d1c2e8','#5b21b6'],['Honey Foam','#f6d98f','#854d0e'],
    ['Ceramic','#d8d5cc','#57534e'],['Napkin','#f5f0e8','#57534e'],['Ink Menu','#334155','#f8fafc'],
  ]},
  {name:'High Contrast', colors:[
    ['Signal Red','#ef4444','#ffffff'],['Safety Orange','#f97316','#111827'],['Bright Amber','#facc15','#111827'],
    ['Electric Lime','#a3e635','#111827'],['Action Green','#22c55e','#052e16'],['Mint Pop','#2dd4bf','#042f2e'],
    ['Cyan Pop','#22d3ee','#083344'],['Sky Pop','#38bdf8','#082f49'],['Blue Pop','#3b82f6','#eff6ff'],
    ['Indigo Pop','#6366f1','#eef2ff'],['Violet Pop','#8b5cf6','#f5f3ff'],['Purple Pop','#a855f7','#faf5ff'],
    ['Fuchsia Pop','#d946ef','#fdf4ff'],['Pink Pop','#ec4899','#fdf2f8'],['Rose Pop','#f43f5e','#fff1f2'],
    ['White Hot','#ffffff','#111827'],['Black Hot','#000000','#ffffff'],['Slate Hot','#475569','#f8fafc'],
  ]},
  {name:'Nordic Frost', colors:[
    ['Snowdrift','#eef6fb','#164e63'],['Glacier','#d9edf7','#075985'],['Ice Blue','#c5e4f3','#075985'],
    ['Fjord','#a9cfe3','#1e3a8a'],['Arctic Sky','#b9d7f4','#1d4ed8'],['Blue Mist','#ced9ed','#3730a3'],
    ['Aurora Green','#b7e3d0','#047857'],['Frozen Mint','#c9f1e3','#065f46'],['Pine Frost','#a8c8bb','#14532d'],
    ['Lichen Frost','#d4ddb8','#4d5f12'],['Cold Stone','#c9ced6','#475569'],['Granite','#aeb7c2','#334155'],
    ['Polar Night','#52637b','#f8fafc'],['Deep Fjord','#3c5870','#e0f2fe'],['Aurora Violet','#c9c5ee','#5b21b6'],
    ['Ice Rose','#ead0dd','#9d174d'],['Birch','#e8e0d0','#57534e'],['Graphite Ice','#7f8a99','#f1f5f9'],
  ]},
  {name:'Desert Bloom', colors:[
    ['Dune','#ead7ad','#765d16'],['Sandstone','#dfbd8a','#854d0e'],['Sunbaked','#d89a64','#7c2d12'],
    ['Terracotta Bloom','#c9775e','#fff7ed'],['Cactus Flower','#e59ab1','#9f1239'],['Prickly Pear','#d67eb2','#831843'],
    ['Saguaro','#8fbf87','#166534'],['Agave','#8bb6a5','#115e59'],['Yucca','#c7d5a8','#4d7c0f'],
    ['Desert Sage','#b7b99a','#57534e'],['Adobe Pink','#e9b5a5','#9a3412'],['Clay Path','#b9856b','#5b3425'],
    ['Copper Sky','#e7a66f','#7c2d12'],['Mesa Purple','#a98bb6','#581c87'],['Twilight Sand','#c9a9a0','#7f1d1d'],
    ['Oasis','#75b8ad','#0f766e'],['Mirage Blue','#9cc6df','#075985'],['Night Sand','#7b6c61','#f5efe6'],
  ]},
  {name:'Neon Pastel', colors:[
    ['Neon Blush','#ffb3d1','#9d174d'],['Laser Pink','#ff8fc7','#831843'],['Hot Peach','#ffb08a','#9a3412'],
    ['Glow Orange','#ffc56b','#854d0e'],['Acid Cream','#f7ff8a','#4d7c0f'],['Electric Pear','#d7ff73','#3f6212'],
    ['Lime Glow','#a7f970','#166534'],['Mint Beam','#7af5c9','#047857'],['Aqua Beam','#70f1ed','#0e7490'],
    ['Cyber Sky','#74d9ff','#075985'],['Hyper Blue','#8db8ff','#1d4ed8'],['Pixel Periwinkle','#aaa2ff','#4338ca'],
    ['Ultra Violet','#c792ff','#6d28d9'],['Neon Lilac','#ec9cff','#86198f'],['Synth Pink','#ff8fdf','#9d174d'],
    ['Soft Blacklight','#6266a3','#f5f3ff'],['Chrome Glow','#c9d4e5','#334155'],['White Neon','#fbfbff','#111827'],
  ]},
  {name:'Autumn Orchard', colors:[
    ['Apple Skin','#d65252','#7f1d1d'],['Cranberry','#b8455d','#fff1f2'],['Pumpkin','#d9783d','#7c2d12'],
    ['Persimmon','#e08c52','#854d0e'],['Cider','#d9a44f','#713f12'],['Golden Pear','#ccb84a','#5f520e'],
    ['Olive Grove','#9fa65a','#3f6212'],['Sage Leaf','#9db07d','#365314'],['Fallen Leaf','#b87945','#4b2e22'],
    ['Maple','#bf5f3a','#fff7ed'],['Chestnut','#8d5a3f','#f5efe6'],['Bark','#6e5040','#f5efe6'],
    ['Plum Jam','#895071','#fdf2f8'],['Fig','#756081','#ede9fe'],['Foggy Morning','#b8aca0','#57534e'],
    ['Mushroom','#c2ae98','#57534e'],['Harvest Sky','#98abc9','#1e3a8a'],['Evergreen','#56765d','#ecfdf5'],
  ]},
  {name:'Spring Garden', colors:[
    ['Cherry Blossom','#ffd7e2','#9f1239'],['Tulip Pink','#f8a7bd','#9d174d'],['Peony','#efb4d7','#831843'],
    ['Daffodil','#f7dc6f','#713f12'],['Buttercup','#fff08a','#854d0e'],['New Leaf','#bde77f','#3f6212'],
    ['Fresh Grass','#8ee68e','#166534'],['Garden Mint','#a5f3d0','#047857'],['Bluebell','#b9c9ff','#3730a3'],
    ['Hyacinth','#cdb7ff','#5b21b6'],['Iris','#c6a4e3','#6b21a8'],['Lilac Mist','#ecd5ff','#86198f'],
    ['Pansy','#9a8fd8','#f5f3ff'],['Rain Cloud','#cdd8e4','#475569'],['Morning Sky','#c2e5ff','#075985'],
    ['Seedling','#cde5b0','#4d7c0f'],['Clay Pot','#c98a72','#7c2d12'],['Garden Soil','#7a5b46','#f5efe6'],
  ]},
  {name:'Deep Ocean', colors:[
    ['Abyss','#16324f','#e0f2fe'],['Deep Navy','#1e3a5f','#dbeafe'],['Blue Whale','#28567a','#e0f2fe'],
    ['Pacific','#2d7796','#cffafe'],['Reef Blue','#3aa6b9','#083344'],['Tropical Teal','#42b8ad','#042f2e'],
    ['Kelp Green','#5f9672','#ecfdf5'],['Sea Turtle','#79a889','#14532d'],['Foam Line','#c6f2e7','#115e59'],
    ['Pearl Shell','#eee5d7','#57534e'],['Coral Pink','#f2a0a0','#991b1b'],['Anemone','#e983b5','#831843'],
    ['Urchin Purple','#9278bd','#f5f3ff'],['Storm Wave','#6f8799','#f8fafc'],['Wet Stone','#87939b','#334155'],
    ['Sargasso','#b7b269','#4d5f12'],['Sunlit Water','#8bd3ea','#075985'],['Midnight Tide','#24384c','#f8fafc'],
  ]},
  {name:'Studio Ghibli-ish', colors:[
    ['Meadow Path','#b9d48c','#3f6212'],['Soft Moss','#9fc393','#166534'],['River Mint','#9fd8c5','#115e59'],
    ['Washed Sky','#b8dcf5','#075985'],['Dusty Blue','#93aacd','#1e3a8a'],['Cloud Shadow','#c9d1d8','#475569'],
    ['Totoro Grey','#9da3a0','#44403c'],['Warm Hay','#e8d08b','#765d16'],['Bread Crust','#c99462','#5b3425'],
    ['Tomato Red','#d86d5f','#7f1d1d'],['Radish Pink','#f0a9b6','#9f1239'],['Flower Purple','#b59bd6','#5b21b6'],
    ['Evening Violet','#8f83b7','#f5f3ff'],['Tea Green','#c8d6a0','#4d7c0f'],['Forest Shade','#5f8068','#ecfdf5'],
    ['Clay Roof','#bd745d','#fff7ed'],['Paper Lantern','#f4d596','#854d0e'],['Ink Wash','#5c6873','#f8fafc'],
  ]},
  {name:'Muted Professional', colors:[
    ['Executive Blue','#6f8fb4','#1e3a8a'],['Steel','#7f96aa','#f8fafc'],['Slate Desk','#64748b','#f8fafc'],
    ['Calm Teal','#6aa99f','#0f766e'],['Sage Office','#93aa82','#3f6212'],['Olive Note','#a3a16f','#4d5f12'],
    ['Document Tan','#d8c39e','#765d16'],['Muted Gold','#c6a75d','#713f12'],['Copper Note','#b98568','#5b3425'],
    ['Brick Soft','#b66a63','#7f1d1d'],['Wine Accent','#9a5b73','#fdf2f8'],['Plum Grey','#8b789a','#f5f3ff'],
    ['Soft Purple','#a99bc4','#4c1d95'],['Neutral Grey','#a3a3a3','#404040'],['Warm Grey','#aaa19a','#44403c'],
    ['Charcoal','#475569','#f8fafc'],['Paper','#f3f0e8','#57534e'],['Ink','#1f2937','#f9fafb'],
  ]},
  {name:'Retro Arcade', colors:[
    ['CRT Red','#ff5c5c','#7f1d1d'],['Pixel Orange','#ff9f43','#111827'],['Coin Gold','#ffd166','#111827'],
    ['1-Up Green','#7bd88f','#052e16'],['Toxic Lime','#b8f75a','#111827'],['Terminal Green','#38d97a','#052e16'],
    ['Laser Cyan','#45e0ff','#083344'],['Arcade Blue','#4d96ff','#eff6ff'],['Cabinet Blue','#3566d8','#dbeafe'],
    ['Joystick Purple','#8f63ff','#f5f3ff'],['Vapor Violet','#b15cff','#faf5ff'],['Hot Magenta','#ff4fd8','#831843'],
    ['Bubble Pink','#ff75a8','#831843'],['Screen Glow','#d6fff6','#115e59'],['Plastic Grey','#b9c0c9','#334155'],
    ['Cabinet Black','#171923','#f9fafb'],['Button White','#f8fafc','#111827'],['Score Yellow','#fff36d','#111827'],
  ]},
  {name:'Dreamcore', colors:[
    ['Hazy Pink','#ffd6f0','#9d174d'],['Sleepy Rose','#f6c2d6','#9f1239'],['Peach Cloud','#ffd9c7','#9a3412'],
    ['Moon Cream','#fff1bd','#854d0e'],['Soft Lime','#e7ffc2','#3f6212'],['Dream Mint','#ccffe4','#065f46'],
    ['Pool Light','#c4fbff','#155e75'],['Cloud Blue','#d3e8ff','#1e40af'],['Memory Blue','#bac8ff','#3730a3'],
    ['Lavender Fog','#e2d5ff','#5b21b6'],['Purple Haze','#f1ccff','#86198f'],['Static Pink','#ffd0fb','#9d174d'],
    ['Mirror','#edf2f7','#475569'],['Old Wallpaper','#eee4d2','#6f4e37'],['Faded Carpet','#d4b7c4','#831843'],
    ['Night Lamp','#f7d783','#854d0e'],['Hallway Shadow','#777f93','#f8fafc'],['Soft Void','#3b4258','#f8fafc'],
  ]},
  {name:'Material-ish', colors:[
    ['Red 400','#f87171','#7f1d1d'],['Orange 400','#fb923c','#7c2d12'],['Amber 400','#fbbf24','#78350f'],
    ['Yellow 300','#fde047','#713f12'],['Lime 400','#a3e635','#365314'],['Green 400','#4ade80','#14532d'],
    ['Emerald 400','#34d399','#064e3b'],['Teal 400','#2dd4bf','#134e4a'],['Cyan 400','#22d3ee','#164e63'],
    ['Sky 400','#38bdf8','#075985'],['Blue 400','#60a5fa','#1e3a8a'],['Indigo 400','#818cf8','#312e81'],
    ['Violet 400','#a78bfa','#4c1d95'],['Purple 400','#c084fc','#581c87'],['Fuchsia 400','#e879f9','#701a75'],
    ['Pink 400','#f472b6','#831843'],['Rose 400','#fb7185','#881337'],['Slate 400','#94a3b8','#334155'],
  ]},
];
function taxonomySwatch(color, fg=readableInkFor(color)) {
  return {
    color,
    light: {bg: color, fg},
    dark: {bg: hexToRgba(color, .24), fg: readableGlowFor(color)},
  };
}
function taxonomySchemeSwatches(scheme='Pastel') {
  const groups = scheme === 'All Schemes'
    ? NICE_SWATCH_GROUPS
    : NICE_SWATCH_GROUPS.filter(g => g.name === scheme);
  const source = groups.length ? groups : NICE_SWATCH_GROUPS;
  return source.flatMap(g => g.colors.map(([name,color,fg]) => ({scheme:g.name,name,color,...taxonomySwatch(color,fg)})));
}
function taxonomyAutoSwatches(count=1, seed='', scheme='Pastel') {
  const swatches = taxonomySchemeSwatches(scheme);
  if(!swatches.length) return [];
  const seedValue = hashString(`${scheme}-${seed}-${Date.now()}`);
  const candidates = [...swatches].sort((a,b)=>hashString(`${seedValue}-${a.scheme}-${a.name}`)-hashString(`${seedValue}-${b.scheme}-${b.name}`));
  const selected = [];
  const used = new Set();
  const bucketCounts = new Map();
  const start = seedValue % candidates.length;
  const pick = (idx) => {
    const item = candidates[idx % candidates.length];
    selected.push(item);
    used.add(item.color);
    const bucket = colorBucket(item.color);
    bucketCounts.set(bucket, (bucketCounts.get(bucket)||0) + 1);
  };
  pick(start);
  while(selected.length < count && used.size < candidates.length) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for(let i=0;i<candidates.length;i++) {
      const c = candidates[i];
      if(used.has(c.color)) continue;
      const bucket = colorBucket(c.color);
      const bucketPenalty = (bucketCounts.get(bucket)||0) * .45;
      const nearest = Math.min(...selected.map(s => colorDistance(c.color, s.color)));
      const jitter = (hashString(`${seedValue}-${selected.length}-${c.color}`) % 1000) / 100000;
      const score = nearest - bucketPenalty + jitter;
      if(score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if(bestIdx < 0) break;
    pick(bestIdx);
  }
  while(selected.length < count) selected.push(swatches[(selected.length + seedValue) % swatches.length]);
  return selected.slice(0, count);
}
function taxonomyAutoSwatch(index=0, seed='', scheme='Pastel') {
  return taxonomyAutoSwatches(index + 1, seed, scheme)[index] || taxonomySchemeSwatches(scheme)[0];
}
function hashString(value='') {
  let h = 2166136261;
  for(const ch of String(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function colorBucket(hex) {
  const hsl = rgbToHsl(hexToRgb(hex));
  if(!hsl) return 'unknown';
  if(hsl.s < .12) return `neutral-${Math.round(hsl.l * 4)}`;
  return `hue-${Math.floor(((hsl.h + 15) % 360) / 30)}`;
}
function colorDistance(a, b) {
  const ah = rgbToHsl(hexToRgb(a));
  const bh = rgbToHsl(hexToRgb(b));
  if(!ah || !bh) return 0;
  if(ah.s < .12 && bh.s < .12) return Math.abs(ah.l - bh.l) * .9;
  if(ah.s < .12 || bh.s < .12) return .55 + Math.abs(ah.l - bh.l) * .25 + Math.abs(ah.s - bh.s) * .2;
  const hue = Math.min(Math.abs(ah.h - bh.h), 360 - Math.abs(ah.h - bh.h)) / 180;
  const sat = Math.abs(ah.s - bh.s);
  const light = Math.abs(ah.l - bh.l);
  return hue * .72 + sat * .12 + light * .16;
}
function rgbToHsl(rgb) {
  if(!rgb) return null;
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if(d) {
    s = l > .5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0)
      : max === g ? (b - r) / d + 2
      : (r - g) / d + 4;
    h *= 60;
  }
  return {h,s,l};
}
function readableInkFor(hex) {
  const rgb = hexToRgb(hex);
  if(!rgb) return '#334155';
  const lum = ((rgb.r/255)*.299 + (rgb.g/255)*.587 + (rgb.b/255)*.114);
  return lum > .72 ? '#334155' : '#ffffff';
}
function readableGlowFor(hex) {
  const rgb = hexToRgb(hex);
  if(!rgb) return '#cbd5e1';
  const lum = ((rgb.r/255)*.299 + (rgb.g/255)*.587 + (rgb.b/255)*.114);
  return lum < .28 ? '#e2e8f0' : hex;
}
function hexToRgb(hex) {
  const raw = String(hex||'').replace('#','');
  if(raw.length !== 6) return null;
  return {r:parseInt(raw.slice(0,2),16),g:parseInt(raw.slice(2,4),16),b:parseInt(raw.slice(4,6),16)};
}
function hexToRgba(hex, alpha=.2) {
  const rgb = hexToRgb(hex);
  if(!rgb) return `rgba(148,163,184,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}
function SwatchPicker({ value, onChange, size=24, rich=false }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);
  const updatePos = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    const width = 292;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const maxHeight = Math.min(360, Math.max(180, Math.max(spaceBelow, spaceAbove)));
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    let left = r.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    left = Math.max(margin, left);
    let top = openUp ? r.top - maxHeight - gap : r.bottom + gap;
    top = Math.max(margin, top);
    setPos({
      left,
      top,
      width,
      maxHeight: Math.max(160, Math.min(maxHeight, window.innerHeight - top - margin)),
    });
  }, []);
  useEffect(() => {
    if (!open) return;
    updatePos();
    const raf = requestAnimationFrame(updatePos);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);
  useEffect(()=>{
    if(!open) return;
    const fn = e => {
      if (btnRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);
  const norm = (c) => (c||'').toLowerCase();
  const swatches = NICE_SWATCH_GROUPS.flatMap(g => g.colors.map(([name,color,fg]) => ({name,color,...taxonomySwatch(color,fg)})));
  const popover = open ? ReactDOM.createPortal(
    <div ref={popRef}
      style={{
        position:'fixed',
        top:pos?.top ?? 0,
        left:pos?.left ?? -9999,
        zIndex:1000,
        background:'var(--surface)',
        border:'1px solid var(--border-s)',
        borderRadius:6,
        boxShadow:'var(--shadow-lg)',
        padding:10,
        width:pos?.width ?? 292,
        maxHeight:pos?.maxHeight ?? 360,
        overflowY:'auto',
        visibility:pos?'visible':'hidden'
      }}
      onClick={e=>e.stopPropagation()}
      onMouseDown={e=>e.stopPropagation()}>
      {NICE_SWATCH_GROUPS.map(group=>(
        <div key={group.name} style={{marginBottom:10}}>
          <div style={{fontSize:9.5,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',margin:'0 0 6px'}}>{group.name}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(6, 34px)',gap:6}}>
            {group.colors.map(([name,color,fg])=>{
              const picked = taxonomySwatch(color,fg);
              return (
                <button key={`${group.name}-${name}`} type="button" title={`${name} ${color}`} onClick={()=>{onChange(rich ? picked : color);setOpen(false);}}
                  style={{width:34,height:24,border:norm(value)===norm(color)?'2px solid var(--accent)':'1px solid var(--border-s)',borderRadius:5,background:color,cursor:'pointer',padding:0,boxShadow:'inset 0 0 0 1px rgba(255,255,255,.25)'}}/>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{display:'flex',alignItems:'center',gap:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
        <input type="color" value={swatches.find(s=>norm(s.color)===norm(value)) ? '#737373' : (value || '#737373')} onChange={e=>{onChange(e.target.value);setOpen(false);}}
          style={{width:28,height:24,border:'1px solid var(--border-s)',borderRadius:4,cursor:'pointer',padding:1,background:'var(--surface-2)'}}/>
        <span style={{fontSize:10.5,color:'var(--t4)'}}>Custom color</span>
      </div>
    </div>,
    document.body
  ) : null;
  return (
    <div style={{display:'inline-block'}} onClick={e=>e.stopPropagation()}>
      <button ref={btnRef} type="button" onClick={()=>setOpen(o=>!o)}
        style={{width:size,height:size,border:'1px solid var(--border-s)',borderRadius:3,background:value||'#737373',cursor:'pointer',padding:0,display:'block'}}/>
      {popover}
    </div>
  );
}

function SettingsScrollPane({ children }) {
  const ref = useRef(null);
  const [bar, setBar] = useState({show:false, top:8, height:36});
  const updateBar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollHeight - el.clientHeight;
    if (overflow <= 1) {
      setBar(b => b.show ? {...b, show:false} : b);
      return;
    }
    const pad = 8;
    const track = Math.max(1, el.clientHeight - pad * 2);
    const height = Math.max(36, track * el.clientHeight / el.scrollHeight);
    const top = pad + (track - height) * (el.scrollTop / overflow);
    setBar({show:true, top, height});
  }, []);
  useLayoutEffect(() => {
    updateBar();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateBar);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [children, updateBar]);
  useEffect(() => {
    window.addEventListener('resize', updateBar);
    return () => window.removeEventListener('resize', updateBar);
  }, [updateBar]);
  return (
    <div className="settings-scroll-shell">
      <div ref={ref} className="settings-scroll settings-main-pane" onScroll={updateBar}>
        <div className="settings-main-inner">{children}</div>
      </div>
      {bar.show && (
        <div className="settings-scrollbar">
          <div className="settings-scrollbar-thumb" style={{top:bar.top,height:bar.height}}/>
        </div>
      )}
    </div>
  );
}

function TaxonomyManager({ taxonomy, actions }) {
  const [newContext,setNewContext] = useState('');
  const [newTag,setNewTag] = useState('');
  const [newLifeArea,setNewLifeArea] = useState('');
  const [autoSchemes,setAutoSchemes] = useState({context:'Pastel',tag:'Pastel',lifeArea:'Pastel'});
  const [allAutoScheme,setAllAutoScheme] = useState('Use section schemes');
  const importRef = useRef(null);
  const Row = ({kind,item,index,total}) => {
    const isContext = kind==='context';
    return (
      <div className="tax-row" style={{alignItems:isContext?'flex-start':'center'}}>
        <SwatchPicker rich value={item.color || item.light?.bg || item.light?.fg || '#737373'}
          onChange={picked=>{
            const changes = typeof picked === 'object'
              ? {color:picked.color,dark:picked.dark,light:picked.light}
              : {color:picked,...taxonomySwatch(picked)};
            actions.update(kind,item.id,changes);
          }}/>
        <div style={{flex:1,minWidth:0}}>
          <input className="tax-input" value={item.label}
            onChange={e=>actions.update(kind,item.id,{label:e.target.value})}/>
          {isContext && (
            <select className="tax-input" style={{marginTop:6}}
              value={item.defaultLifeArea || ''}
              onChange={e=>actions.update(kind,item.id,{defaultLifeArea:e.target.value||null})}>
              <option value="">Default Life Area</option>
              {taxonomy.lifeAreas.map(area=><option key={area.id} value={area.id}>{area.label}</option>)}
            </select>
          )}
        </div>
        <button className="tax-btn" disabled={index===0} onClick={()=>actions.move(kind,item.id,-1)}>Up</button>
        <button className="tax-btn" disabled={index===total-1} onClick={()=>actions.move(kind,item.id,1)}>Down</button>
        <button className="tax-btn danger" onClick={()=>actions.remove(kind,item.id)}>Del</button>
      </div>
    );
  };
  const schemeOptions = ['All Schemes', ...NICE_SWATCH_GROUPS.map(g=>g.name)];
  const allSchemeOptions = ['Use section schemes', ...schemeOptions];
  const setSectionScheme = (kind, scheme) => setAutoSchemes(prev => ({...prev,[kind]:scheme}));
  const SectionTools = ({kind, label}) => (
    <>
      <select className="tax-input" value={autoSchemes[kind]} onChange={e=>setSectionScheme(kind,e.target.value)}
        title={`Scheme for ${label.toLowerCase()}`} style={{width:150}}>
        {schemeOptions.map(name=><option key={name} value={name}>{name}</option>)}
      </select>
      <AutoButton kind={kind} label={label}/>
    </>
  );
  const AutoButton = ({kind, label}) => (
    <button className="tb-btn" onClick={()=>actions.autoColor(kind, autoSchemes[kind])} title={`Apply ${autoSchemes[kind]} colors to every ${label.toLowerCase()}`}>
      Auto apply colors
    </button>
  );
  return (
    <>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,padding:'10px 12px',border:'1px solid var(--border-s)',borderRadius:4,background:'var(--surface)'}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:'var(--t1)',marginBottom:2}}>Auto color schemes</div>
          <div style={{fontSize:11.5,color:'var(--t4)',lineHeight:1.35}}>Choose one scheme for Apply everything, or let each subsection use its own scheme.</div>
        </div>
        <select className="tax-input" value={allAutoScheme} onChange={e=>setAllAutoScheme(e.target.value)}
          title="Scheme for Apply everything" style={{width:180}}>
          {allSchemeOptions.map(name=><option key={name} value={name}>{name}</option>)}
        </select>
        <button className="tb-btn primary" onClick={()=>actions.autoColor('all', allAutoScheme === 'Use section schemes' ? autoSchemes : allAutoScheme)}
          title={allAutoScheme === 'Use section schemes' ? 'Apply each subsection selected scheme' : `Apply ${allAutoScheme} to every section`}>
          Apply to everything
        </button>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',flex:1}}>Location</div>
        <SectionTools kind="context" label="Locations"/>
      </div>
      <div className="tax-list">
        {taxonomy.contexts.map((c,i)=><Row key={c.id} kind="context" item={c} index={i} total={taxonomy.contexts.length}/>)}
      </div>
      <div className="tax-add">
        <input className="tax-input" placeholder="New location" value={newContext} onChange={e=>setNewContext(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newContext.trim()){actions.add('context',newContext);setNewContext('');}}}/>
        <button className="tb-btn primary" onClick={()=>{if(newContext.trim()){actions.add('context',newContext);setNewContext('');}}}>Add</button>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,marginTop:26,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',flex:1}}>Tags</div>
        <SectionTools kind="tag" label="Tags"/>
      </div>
      <div className="tax-list">
        {taxonomy.tags.map((t,i)=><Row key={t.id} kind="tag" item={t} index={i} total={taxonomy.tags.length}/>)}
      </div>
      <div className="tax-add">
        <input className="tax-input" placeholder="New tag" value={newTag} onChange={e=>setNewTag(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newTag.trim()){actions.add('tag',newTag);setNewTag('');}}}/>
        <button className="tb-btn primary" onClick={()=>{if(newTag.trim()){actions.add('tag',newTag);setNewTag('');}}}>Add</button>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,marginTop:26,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',flex:1}}>Life Areas</div>
        <SectionTools kind="lifeArea" label="Life Areas"/>
      </div>
      <div className="tax-list">
        {taxonomy.lifeAreas.map((area,i)=><Row key={area.id} kind="lifeArea" item={area} index={i} total={taxonomy.lifeAreas.length}/>)}
      </div>
      <div className="tax-add">
        <input className="tax-input" placeholder="New life area" value={newLifeArea} onChange={e=>setNewLifeArea(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newLifeArea.trim()){actions.add('lifeArea',newLifeArea);setNewLifeArea('');}}}/>
        <button className="tb-btn primary" onClick={()=>{if(newLifeArea.trim()){actions.add('lifeArea',newLifeArea);setNewLifeArea('');}}}>Add</button>
      </div>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
        <button className="tb-btn" onClick={actions.exportTaxonomy}>Export taxonomy</button>
        <input ref={importRef} type="file" accept=".json,application/json" style={{display:'none'}}
          onChange={e=>actions.importTaxonomy(e.target.files?.[0])}/>
        <button className="tb-btn" onClick={()=>importRef.current?.click()}>Import taxonomy</button>
      </div>
    </>
  );
}

const PRESETS_DATA = [
  {n:'Harbor',  a:'#0f766e', db:'#071512',ds:'#10201d',dn:'#06110f',dbr:'#1d342f',dt:'#e6fffb', lb:'#f3f7f4',ls:'#fffdfa',ln:'#e7efe9',lbr:'#d5ded7',lt:'#17211d'},
  {n:'Indigo',  a:'#4f46e5', db:'#0d1020',ds:'#171a2f',dn:'#080b18',dbr:'#252a46',dt:'#eef2ff', lb:'#f4f6ff',ls:'#ffffff',ln:'#e8ecff',lbr:'#d7ddfa',lt:'#17172f'},
  {n:'Ember',   a:'#ea580c', db:'#190f0a',ds:'#261812',dn:'#110a06',dbr:'#3a2419',dt:'#fff1e7', lb:'#fff8f1',ls:'#fffdf9',ln:'#f8eadf',lbr:'#edcfbd',lt:'#24140e'},
  {n:'Moss',    a:'#65a30d', db:'#0d1408',ds:'#182312',dn:'#080f05',dbr:'#29361f',dt:'#f0fbea', lb:'#f6faef',ls:'#fffffb',ln:'#e9f2df',lbr:'#d5e2c5',lt:'#17220f'},
  {n:'Lagoon',  a:'#0284c7', db:'#07141c',ds:'#102331',dn:'#061019',dbr:'#1c3547',dt:'#e8f7ff', lb:'#f2f9fd',ls:'#ffffff',ln:'#e2f0f8',lbr:'#cbe0eb',lt:'#102532'},
  {n:'Marigold',a:'#d97706', db:'#171207',ds:'#241c0e',dn:'#100c04',dbr:'#362a16',dt:'#fff7db', lb:'#fff9ea',ls:'#fffefa',ln:'#f6edcf',lbr:'#e8d7aa',lt:'#241b08'},
  {n:'Rose',    a:'#e11d48', db:'#180b12',ds:'#25131a',dn:'#10070c',dbr:'#3a2028',dt:'#fff1f4', lb:'#fff5f7',ls:'#fffefe',ln:'#f8e2e8',lbr:'#eec6d0',lt:'#2a1118'},
  {n:'Aubergine',a:'#9333ea',db:'#140d1f',ds:'#20172d',dn:'#0d0816',dbr:'#312342',dt:'#f7efff', lb:'#faf7ff',ls:'#ffffff',ln:'#efe7fb',lbr:'#ddcff3',lt:'#20142f'},
  {n:'Clay',    a:'#b45309', db:'#17110d',ds:'#231a14',dn:'#0f0a07',dbr:'#35271d',dt:'#fff4e8', lb:'#faf4ed',ls:'#fffdf9',ln:'#eee3d7',lbr:'#ddcdbd',lt:'#211812'},
  {n:'Graphite',a:'#525252', db:'#0b0b0b',ds:'#181818',dn:'#050505',dbr:'#2a2a2a',dt:'#f5f5f5', lb:'#f7f7f5',ls:'#ffffff',ln:'#eeeeeb',lbr:'#ddddda',lt:'#181818'},
  {n:'Nordic',  a:'#2563eb', db:'#08111f',ds:'#111d2f',dn:'#050c17',dbr:'#21314a',dt:'#eaf2ff', lb:'#f5f7fb',ls:'#ffffff',ln:'#e8edf5',lbr:'#d5dce8',lt:'#111827'},
  {n:'Mono',    a:'#737373', db:'#0a0a0a',ds:'#171717',dn:'#000000',dbr:'#262626',dt:'#fafafa', lb:'#fafafa',ls:'#ffffff',ln:'#f5f5f5',lbr:'#e5e5e5',lt:'#0a0a0a'},
];
function SettingsView({ tweaks, setTweak, taxonomy, taxonomyActions }) {
  const [tab, setTab] = useState('appearance');
  const SRow = ({label,desc,children}) => (
    <div style={{display:'flex',alignItems:'center',gap:16,padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:500,color:'var(--t1)',marginBottom:2}}>{label}</div>
        {desc && <div style={{fontSize:11.5,color:'var(--t4)',lineHeight:1.4}}>{desc}</div>}
      </div>
      <div style={{flexShrink:0,display:'flex',alignItems:'center',gap:8}}>{children}</div>
    </div>
  );
  const Seg = ({id,opts}) => (
    <div style={{display:'flex',background:'var(--surface-3)',borderRadius:3,padding:2,gap:2}}>
      {opts.map(o=><button key={o} onClick={()=>setTweak(id,o)}
        style={{padding:'3px 10px',border:'none',borderRadius:2,cursor:'pointer',font:'12px var(--font)',
          background:tweaks[id]===o?'var(--surface)':'transparent',
          color:tweaks[id]===o?'var(--t1)':'var(--t3)',
          fontWeight:tweaks[id]===o?500:400,
          boxShadow:tweaks[id]===o?'0 1px 3px rgba(0,0,0,.1)':'none'}}>{o}</button>)}
    </div>
  );
  const Tog = ({id}) => (
    <button onClick={()=>setTweak(id,!tweaks[id])} style={{width:36,height:20,borderRadius:99,border:'none',cursor:'pointer',position:'relative',background:tweaks[id]?'var(--accent)':'var(--surface-3)',transition:'background .15s',flexShrink:0}}>
      <span style={{position:'absolute',top:3,left:tweaks[id]?19:3,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'left .15s',boxShadow:'0 1px 3px rgba(0,0,0,.2)',display:'block'}}/>
    </button>
  );
  const Card = ({children}) => <div style={{background:'var(--surface)',border:'1px solid var(--border-s)',borderRadius:4,overflow:'hidden',marginBottom:16}}>{children}</div>;
  const applyPreset = p => setTweak({accentColor:p.a,dark_bg:p.db,dark_surface:p.ds,dark_sidebar:p.dn,dark_border:p.dbr,dark_text:p.dt,light_bg:p.lb,light_surface:p.ls,light_sidebar:p.ln,light_border:p.lbr,light_text:p.lt});
  const tabs = [
    {id:'appearance',label:'Appearance'},
    {id:'colors',label:'Colors'},
    {id:'layout',label:'Layout'},
    {id:'taxonomy',label:'Taxonomy'},
    {id:'data',label:'Data'},
  ];
  const [exportMsg, setExportMsg] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const importInputRef = useRef(null);
  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const dump = parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
        if (!dump) throw new Error('File is missing a top-level "data" object — not a Task Manager export.');
        const keys = Object.keys(dump).filter(k => k.startsWith('tm_'));
        if (!keys.length) throw new Error('No tm_* keys found in the file.');
        const existing = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('tm_')) existing.push(k);
        }
        const msg = `Import ${keys.length} key${keys.length===1?'':'s'} from "${file.name}"?\n\n`
          + `This will OVERWRITE the following keys in localStorage:\n  ${keys.join('\n  ')}\n\n`
          + (existing.length ? `(You currently have ${existing.length} tm_* key${existing.length===1?'':'s'} stored. Keys not in the import will be left alone.)\n\n` : '')
          + `The page will reload after import so the app re-reads from storage.`;
        if (!window.confirm(msg)) { setImportMsg('Import cancelled.'); setTimeout(()=>setImportMsg(''), 4000); return; }
        for (const k of keys) {
          const v = dump[k];
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
        window.location.reload();
      } catch (err) {
        setImportMsg(`Import failed: ${err?.message || err}`);
        setTimeout(()=>setImportMsg(''), 6000);
      }
    };
    reader.onerror = () => {
      setImportMsg('Could not read the file.');
      setTimeout(()=>setImportMsg(''), 4000);
    };
    reader.readAsText(file);
  };
  const handleExport = () => {
    try {
      const dump = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('tm_')) continue;
        const raw = localStorage.getItem(key);
        try { dump[key] = JSON.parse(raw); } catch { dump[key] = raw; }
      }
      const payload = {
        exportedAt: new Date().toISOString(),
        schemaVersion: 1,
        source: 'Task Manager (localStorage)',
        data: dump,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `task-manager-export-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
      const n = Object.keys(dump).length;
      setExportMsg(`Exported ${n} key${n===1?'':'s'} from localStorage.`);
    } catch (e) {
      setExportMsg(`Export failed: ${e?.message || e}`);
    }
    setTimeout(()=>setExportMsg(''), 4000);
  };
  return (
    <div style={{flex:1,minHeight:0,height:'100%',display:'flex',overflow:'hidden',background:'var(--bg-side)'}}>
      <div className="settings-scroll" style={{width:180,minWidth:180,minHeight:0,borderRight:'1px solid var(--border)',padding:'12px 8px',display:'flex',flexDirection:'column',gap:2,background:'var(--bg-side)'}}>
        {tabs.map(t=><div key={t.id} onClick={()=>setTab(t.id)}
          style={{padding:'6px 10px',borderRadius:2,fontSize:13,cursor:'pointer',
            background:tab===t.id?'var(--surface-3)':'transparent',
            color:tab===t.id?'var(--t1)':'var(--t3)',fontWeight:tab===t.id?500:400}}>{t.label}</div>)}
      </div>
      <SettingsScrollPane>
          {tab==='appearance' && <>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Mode</div>
            <Card>
              <SRow label="Color mode" desc="Dark or light interface."><Seg id="theme" opts={['light','dark']}/></SRow>
              <SRow label="Style" desc="Border radius, shadows and surface treatment."><Seg id="look" opts={['minimal','soft','sharp','glass']}/></SRow>
              <SRow label="Font" desc="Interface typeface."><Seg id="font" opts={['geist','serif','mono']}/></SRow>
            </Card>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,marginTop:24,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Color presets</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(132px,1fr))',gap:8,marginBottom:20}}>
              {PRESETS_DATA.map(p=>(
                <div key={p.n} onClick={()=>applyPreset(p)}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',border:`1px solid ${tweaks.accentColor===p.a?'var(--accent)':'var(--border-s)'}`,borderRadius:4,background:'var(--surface)',cursor:'pointer',transition:'border-color .1s'}}>
                  <div style={{width:14,height:14,borderRadius:3,background:p.a,flexShrink:0}}/>
                  <span style={{fontSize:12.5,color:'var(--t1)',fontWeight:500}}>{p.n}</span>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Accent</div>
            <Card>
              <SRow label="Accent color" desc="Highlights, today badge, focus rings.">
                <SwatchPicker value={tweaks.accentColor} onChange={c=>setTweak('accentColor',c)} size={26}/>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--t4)'}}>{tweaks.accentColor}</span>
              </SRow>
            </Card>
          </>}
          {tab==='colors' && <>
            {[['Dark mode palette','dark'],['Light mode palette','light']].map(([title,mode])=>(
              <React.Fragment key={mode}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)',marginTop:mode==='light'?24:0}}>{title}</div>
                <Card>
                  <div style={{padding:'14px 16px',display:'flex',gap:20,flexWrap:'wrap'}}>
                    {[['Background',`${mode}_bg`],['Surface',`${mode}_surface`],['Sidebar',`${mode}_sidebar`],['Borders',`${mode}_border`],['Text',`${mode}_text`]].map(([lbl,key])=>(
                      <div key={key} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
                        <SwatchPicker value={tweaks[key]} onChange={c=>setTweak(key,c)} size={32}/>
                        <span style={{fontSize:10.5,color:'var(--t4)',whiteSpace:'nowrap'}}>{lbl}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </React.Fragment>
            ))}
          </>}
          {tab==='layout' && <>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Board</div>
            <Card>
              <SRow label="Show weekends" desc="Display Saturday and Sunday columns."><Tog id="showWeekend"/></SRow>
              <SRow label="Day window" desc="How many day columns fit on screen, including the pinned Today column. Auto picks by width; 4 is focused, 5 is workweek, 7 is full week."><Seg id="dayWindow" opts={['auto',4,5,7]}/></SRow>
              <SRow label="Location side panel" desc="Show a resizable location filter panel beside the inbox."><Tog id="showProjectPanel"/></SRow>
              <SRow label="Density" desc="Card padding and column spacing."><Seg id="density" opts={['compact','normal','airy']}/></SRow>
              <SRow label="Card radius" desc="Border radius on task cards.">
                <input type="range" min={0} max={16} step={1} value={tweaks.cardRadius}
                  onChange={e=>setTweak('cardRadius',Number(e.target.value))}
                  style={{width:120,accentColor:'var(--accent)'}}/>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--t4)',minWidth:28,textAlign:'right'}}>{tweaks.cardRadius}px</span>
              </SRow>
              <SRow label="Group radius" desc="Border radius on grouped task outlines.">
                <input type="range" min={0} max={18} step={1} value={tweaks.groupRadius}
                  onChange={e=>setTweak('groupRadius',Number(e.target.value))}
                  style={{width:120,accentColor:'var(--accent)'}}/>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--t4)',minWidth:28,textAlign:'right'}}>{tweaks.groupRadius}px</span>
              </SRow>
              <SRow label="Card spacing" desc="Vertical gap between cards in a column.">
                <input type="range" min={0} max={20} step={1} value={tweaks.cardGap ?? 3}
                  onChange={e=>setTweak('cardGap',Number(e.target.value))}
                  style={{width:120,accentColor:'var(--accent)'}}/>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--t4)',minWidth:28,textAlign:'right'}}>{tweaks.cardGap ?? 3}px</span>
              </SRow>
              <SRow label="Shadow" desc="Controls card and drawer shadow strength.">
                <input type="range" min={0} max={1} step={0.05} value={tweaks.shadowIntensity}
                  onChange={e=>setTweak('shadowIntensity',Number(e.target.value))}
                  style={{width:120,accentColor:'var(--accent)'}}/>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--t4)',minWidth:34,textAlign:'right'}}>{Math.round((tweaks.shadowIntensity ?? 0) * 100)}%</span>
              </SRow>
            </Card>
          </>}
          {tab==='taxonomy' && <TaxonomyManager taxonomy={taxonomy} actions={taxonomyActions}/>}
          {tab==='data' && <>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Export</div>
            <Card>
              <SRow label="Export all data" desc="Download a JSON file with every tm_* key in localStorage (tasks, settings, taxonomy, delegation people, group prefs, recent block reasons). Read-only — your data stays in localStorage.">
                <button onClick={handleExport}
                  style={{padding:'6px 14px',border:'1px solid var(--border-s)',borderRadius:3,background:'var(--accent)',color:'#fff',font:'500 12.5px var(--font)',cursor:'pointer'}}>
                  Export JSON
                </button>
              </SRow>
              {exportMsg && (
                <div style={{padding:'10px 16px',font:'12px var(--mono)',color:'var(--t3)'}}>{exportMsg}</div>
              )}
            </Card>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',marginBottom:12,marginTop:24,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>Import</div>
            <Card>
              <SRow label="Import from JSON" desc="Restore from a previously exported file. Overwrites matching keys in localStorage and reloads the app. Keys not present in the file are kept as-is. You'll be asked to confirm before anything is written.">
                <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{display:'none'}}/>
                <button onClick={()=>importInputRef.current && importInputRef.current.click()}
                  style={{padding:'6px 14px',border:'1px solid var(--border-s)',borderRadius:3,background:'var(--surface-2)',color:'var(--t1)',font:'500 12.5px var(--font)',cursor:'pointer'}}>
                  Choose file…
                </button>
              </SRow>
              {importMsg && (
                <div style={{padding:'10px 16px',font:'12px var(--mono)',color:'var(--t3)'}}>{importMsg}</div>
              )}
            </Card>
          </>}
      </SettingsScrollPane>
    </div>
  );
}

// ── ListView (non-week views) ────────────────────────────────────────────
function SettingsDrawer({ open, tweaks, setTweak, taxonomy, taxonomyActions, onClose }) {
  return (
    <div className={`drawer settings-drawer${open?' open':''}`}>
      <div className="dr-hdr">
        <div style={{flex:1}}>
          <div style={{font:'600 18px/1.3 var(--font)',color:'var(--t1)'}}>Settings</div>
          <div style={{fontSize:11,color:'var(--t4)',marginTop:3}}>Appearance and board layout</div>
        </div>
        <button className="dr-act-btn dr-close" onClick={onClose}>x</button>
      </div>
      <div style={{flex:1,minHeight:0,display:'flex',overflow:'hidden',background:'var(--bg)'}}>
        {open && <SettingsView tweaks={tweaks} setTweak={setTweak} taxonomy={taxonomy} taxonomyActions={taxonomyActions}/>}
      </div>
    </div>
  );
}

function ListTaskItem({ task, focused, selected, renaming, onOpen, onFocus, onSelect, onRename, onRenameDone }) {
  const [draft,setDraft] = useState(task.title || '');
  const ref = useRef(null);
  useEffect(()=>setDraft(task.title || ''),[task.id,task.title]);
  useEffect(()=>{ if(renaming) requestAnimationFrame(()=>{ ref.current?.focus(); ref.current?.select(); }); },[renaming]);
  const finish = (save=true) => {
    if(save && draft.trim() && draft.trim()!==task.title) onRename(task.id,{title:draft.trim()});
    else setDraft(task.title || '');
    onRenameDone();
  };
  return (
    <div className={`list-item${focused?' focused':''}${selected?' selected':''}`} data-list-id={task.id} onMouseEnter={()=>onFocus(task.id)} onMouseLeave={()=>onFocus(null)} onClick={()=>!renaming&&onOpen(task.id)}>
      <button className={`bulk-check${selected?' on':''}`} title={selected?'Deselect task':'Select task'}
        onClick={e=>{e.stopPropagation();onSelect(task.id);}}>{selected?'✓':''}</button>
      <div className={`card-chk${task.done?' done':''}`} style={{width:13,height:13,borderRadius:'50%',border:'1.5px solid var(--border-s)',flexShrink:0}}/>
      {renaming ? (
        <input ref={ref} className="card-title-input" value={draft}
          onClick={e=>e.stopPropagation()}
          onChange={e=>setDraft(e.target.value)}
          onBlur={()=>finish(true)}
          onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();finish(true);} if(e.key==='Escape'){e.preventDefault();finish(false);} }}/>
      ) : (
        <div className={`list-item-title${task.done?' done':''}`}>
          {task.blocked && <span style={{color:'#f59e0b',marginRight:4}}>⏸</span>}
          {task.title}
        </div>
      )}
      {task.blocked && task.blockedSince && (() => {
        const d = daysSince(task.blockedSince);
        const cls = d>=7?'crit':d>=3?'warn':'';
        return <span className={`card-aging ${cls}`} title={task.blockedReason||`Blocked ${d}d`}>{d}d</span>;
      })()}
      {task.date && <span className="list-item-date">{task.date}</span>}
    </div>
  );
}

function ListView({ title, tasks, onOpen, onFocus, onSelect, selectedIds, focusedCardId, renamingId, onRename, onRenameDone }) {
  const renderLimit = 500;
  const shownTasks = tasks.slice(0, renderLimit);
  return <div className="list-view">
    <div className="list-view-title">{title}</div>
    {tasks.length===0 && <div className="list-empty">Nothing here yet.</div>}
    {shownTasks.map(t=>(
      <ListTaskItem key={t.id} task={t} focused={focusedCardId===t.id} selected={selectedIds?.has(t.id)} renaming={renamingId===t.id}
        onOpen={onOpen} onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}/>
    ))}
    {tasks.length>renderLimit && <div className="list-note">Showing first {renderLimit} of {tasks.length}. Search or filter to narrow this list.</div>}
  </div>;
}

// ── AddTaskModal ─────────────────────────────────────────────────────────
function AddModal({ forDate, dayLabel, onAdd, onClose }) {
  const [title,setTitle]=useState(''); const ref=useRef(null);
  useEffect(()=>ref.current?.focus(),[]);
  const submit=()=>{ if(!title.trim())return; onAdd(makeTask({title:title.trim(),date:forDate||null})); onClose(); };
  return <div className="overlay-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:'var(--surface)',border:'1px solid var(--border-s)',borderRadius:2,padding:20,width:380,boxShadow:'var(--shadow-lg)',animation:'su .15s ease'}}>
      <div style={{fontSize:13,fontWeight:600,color:'var(--t1)',marginBottom:12}}>{dayLabel?`New task — ${dayLabel}`:'New task'}</div>
      <input ref={ref} style={{width:'100%',padding:'8px 10px',border:'1px solid var(--border-s)',borderRadius:2,background:'var(--surface-2)',color:'var(--t1)',font:'13px var(--font)',outline:'none',marginBottom:12}} placeholder="What needs to get done?" value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter')submit(); if(e.key==='Escape')onClose(); }}/>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'6px 12px',borderRadius:2,border:'1px solid var(--border-s)',background:'transparent',color:'var(--t3)',font:'12px var(--font)',cursor:'pointer'}}>Cancel</button>
        <button onClick={submit} style={{padding:'6px 14px',borderRadius:2,border:'none',background:'var(--accent)',color:'#fff',font:'12px/1 var(--font)',fontWeight:500,cursor:'pointer'}}>Add task</button>
      </div>
    </div>
  </div>;
}

// ── App ──────────────────────────────────────────────────────────────────
function App() {
  const TASK_STORAGE_KEY = 'tm_tasks_v2';
  const mergeImportedTasks = (base) => {
    const importKey = `tm_import_${window.SUNSAMA_IMPORT_ID || 'sunsama'}`;
    try { if (localStorage.getItem(importKey)==='done') return base; } catch {}
    const imported = Array.isArray(window.SUNSAMA_IMPORT_TASKS) ? window.SUNSAMA_IMPORT_TASKS : [];
    if (!imported.length) return base;
    const ids = new Set(base.map(t=>t.id));
    const sourceIds = new Set(base.filter(t=>t.source==='sunsama').map(t=>t.sourceId));
    const additions = imported.filter(t=>!ids.has(t.id)&&!sourceIds.has(t.sourceId));
    const merged = additions.length ? [...base, ...additions] : base;
    try { localStorage.setItem(importKey, 'done'); } catch {}
    return merged;
  };
  const loadTasks = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(TASK_STORAGE_KEY) || 'null');
      if (Array.isArray(saved)) {
        const merged = migrateTasks(mergeImportedTasks(saved));
        syncUidFromTasks(merged);
        return merged;
      }
      const merged = migrateTasks(mergeImportedTasks(INIT_TASKS));
      syncUidFromTasks(merged);
      return merged;
    } catch {
      const merged = migrateTasks(mergeImportedTasks(INIT_TASKS));
      syncUidFromTasks(merged);
      return merged;
    }
  };
  const TIMELINE_PAST_DAYS = 120;
  const TIMELINE_FUTURE_DAYS = 180;
  const TIMELINE_EXTEND_DAYS = 45;
  const TIMELINE_MAX_DAYS = 730;
  const INITIAL_TIMELINE_DAYS = TIMELINE_PAST_DAYS + TIMELINE_FUTURE_DAYS + 1;
  const [tasks,setTasks]     = useState(loadTasks);
  const [weekOff,setWeekOff] = useState(-TIMELINE_PAST_DAYS);
  const [timelineDays,setTimelineDays] = useState(INITIAL_TIMELINE_DAYS);
  const [boardMetrics,setBoardMetrics] = useState({scrollLeft:0,width:1200,boardWidth:1200});
  const boardRef = useRef(null);
  const boardShellRef = useRef(null);
  const panState = useRef({isPanning:false,startX:0,scrollLeft:0});
  const boardRaf = useRef(null);
  const pendingTodayJump = useRef(true);
  const pendingTodayJumpBehavior = useRef('auto');
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
    inboxWidth:178, projectPanelWidth:190, dayWindow:'auto', cardRadius:10, groupRadius:4, cardGap:3, shadowIntensity:.35,
    dark_bg:'#071512', dark_surface:'#10201d', dark_sidebar:'#06110f', dark_border:'#1d342f', dark_text:'#e6fffb',
    light_bg:'#f3f7f4', light_surface:'#fffdfa', light_sidebar:'#e7efe9', light_border:'#d5ded7', light_text:'#17211d',
  };
  const loadTM = () => {
    try {
      const stored = JSON.parse(localStorage.getItem('tm_settings')||'{}') || {};
      return {...TM_DEFAULTS,...stored};
    } catch { return {...TM_DEFAULTS}; }
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
  const loadTaxonomy = () => {
    try { return normalizeTaxonomy(JSON.parse(localStorage.getItem('tm_taxonomy')||'null')); }
    catch { return normalizeTaxonomy(null); }
  };
  const [tweaks, setTweakState] = useState(loadTM);
  const [taxonomy, setTaxonomyState] = useState(loadTaxonomy);
  syncTaxonomyGlobals(taxonomy);
  const setTweak = (key, val) => {
    setTweakState(prev => {
      const next = typeof key === 'object' ? {...prev,...key} : {...prev,[key]:val};
      try { localStorage.setItem('tm_settings', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const setTaxonomy = (updater) => {
    setTaxonomyState(prev => {
      const next = normalizeTaxonomy(typeof updater === 'function' ? updater(prev) : updater);
      try { localStorage.setItem('tm_taxonomy', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  useEffect(()=>{
    try { localStorage.setItem('tm_taxonomy', JSON.stringify(taxonomy)); } catch {}
  }, [taxonomy]);
  const theme = tweaks.theme;
  const setTheme = (fn) => setTweak('theme', typeof fn === 'function' ? fn(tweaks.theme) : fn);
  const showWknd = tweaks.showWeekend;
  const setShowWknd = (fn) => setTweak('showWeekend', typeof fn === 'function' ? fn(tweaks.showWeekend) : fn);
  const [view,setView]       = useState('week');
  const [sidePanelView,setSidePanelView] = useState('inbox');
  const [drawerId,setDrawerId]= useState(null);
  const [settingsOpen,setSettingsOpen]= useState(false);
  const [addModal,setAddModal]= useState(null); // {date,label}
  const [palette,setPalette] = useState(false);
  const [shortcuts,setShortcuts]=useState(false);
  const loadFilterPrefs = () => {
    try {
      return { mode:'and', ...(JSON.parse(localStorage.getItem('tm_filter_prefs')||'{}') || {}) };
    } catch {
      return { mode:'and' };
    }
  };
  const initialFilterPrefs = loadFilterPrefs();
  const [filters,setFilters] = useState({projects:[],tags:[],lifeAreas:[],priorities:[]});
  const [filterMode,setFilterMode] = useState(initialFilterPrefs.mode === 'or' ? 'or' : 'and');
  const [showWaitingOn,setShowWaitingOn] = useState(false);
  const [showStaleOnly,setShowStaleOnly] = useState(false);
  const [inboxFilters,setInboxFilters] = useState({projects:{},tags:{},lifeAreas:{},priorities:{}}); // val: 'inc' | 'exc'
  const [searchQuery,setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [filterOpen,setFilterOpen]=useState(false);
  const loadGroupPrefs = () => {
    try { return {global:'project', inbox:'none', ...JSON.parse(localStorage.getItem('tm_group_prefs')||'{}')}; }
    catch { return {global:'project', inbox:'none'}; }
  };
  const initialGroupPrefs = loadGroupPrefs();
  const [globalGroupBy,setGlobalGroupBy] = useState(initialGroupPrefs.global);
  const [groupOpen,setGroupOpen] = useState(false);
  const [inboxGroupBy,setInboxGroupBy] = useState(initialGroupPrefs.inbox);
  useEffect(()=>{
    try { localStorage.setItem('tm_group_prefs', JSON.stringify({global:globalGroupBy, inbox:inboxGroupBy})); } catch {}
  },[globalGroupBy,inboxGroupBy]);
  useEffect(()=>{
    try { localStorage.setItem('tm_filter_prefs', JSON.stringify({mode:filterMode})); } catch {}
  },[filterMode]);
  const [collapsedGrps,setCollapsedGrps]=useState(new Set());
  const [completedOpen,setCompletedOpen]=useState(new Set()); // colKeys expanded
  const [blockedOpen,setBlockedOpen]=useState(()=>new Set()); // colKeys expanded for Blocked group
  const [recentBlockReasons,setRecentBlockReasons]=useState(()=>{
    try { return JSON.parse(localStorage.getItem('tm_recent_block_reasons')||'[]'); } catch { return []; }
  });
  const [drag,setDrag]       = useState(null); // {taskId,fromCol}
  const [dragOver,setDragOver]= useState(null);
  const [colDropIndex,setColDropIndex]=useState(null); // {col, index}
  const [collapsedProjects,setCollapsedProjects]=useState(new Set());
  const [cardDragOver,setCardDragOver]=useState(null); // {targetId, index?}
  const [confirmDialog,setConfirmDialog]=useState(null); // {message, onConfirm}
  const [focusedId,setFocusedId]=useState(null);
  const [selectedIds,setSelectedIds]=useState(new Set());
  const [renamingId,setRenamingId]=useState(null);
  const [spawning,setSpawning]=useState(new Set());
  const [toast,setToast]     = useState(null);
  const [toastUndoable,setToastUndoable]=useState(false);
  const [undoStack,setUndoStack]=useState([]);
  const [navCollapsed,setNavCollapsed]=useState(false);
  const [recents,setRecents] = useState({tags:[], projects:[]});
  const [contextMenu,setContextMenu] = useState(null); // {task, x, y}
  const [popRequest,setPopRequest] = useState(null); // {id, field}
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

  useEffect(()=>{
    const id = setTimeout(()=>{
      try { localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks)); } catch {}
    }, 250);
    return ()=>clearTimeout(id);
  },[tasks]);

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
  },[tweaks]);

  const stickyW = (tweaks.inboxCollapsed?34:(Number(tweaks.inboxWidth)||178)) +
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
    return [t.title,t.description,projLabel,t.project,t.priority,t.pri,t.date,tags,lifeAreaLabel,lifeAreaId].filter(Boolean).join(' ').toLowerCase().includes(searchNeedle);
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

  // Persist recent block reasons (LRU, max 8).
  useEffect(()=>{
    try { localStorage.setItem('tm_recent_block_reasons', JSON.stringify(recentBlockReasons.slice(0,8))); } catch {}
  },[recentBlockReasons]);
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
      setTasks(prev => delegationOutcome.tasks.map(t => t.id===id ? {...t, ...delegationOutcome.mergedChanges} : t));
      return;
    }
    // Convert project → task: promote children up to parent's column.
    if(before.cardType==='project' && changes.cardType==='task') {
      const kids = tasks.filter(t=>t.parentId===id);
      pushSnapshotUndo();
      setTasks(prev=>prev.map(t=>{
        if(t.id===id) return {...t,...changes,childOrder:null};
        if(t.parentId===id) return {...t, parentId:null, date: before.date || null};
        return t;
      }));
      return;
    }
    // Convert task → project: ensure childOrder is initialized.
    if(before.cardType!=='project' && changes.cardType==='project') {
      setUndoStack(s=>[...s.slice(-9),{id,before}]);
      setTasks(prev=>prev.map(t=>t.id===id?{...t,...changes,childOrder:t.childOrder||[]}:t));
      return;
    }
    setUndoStack(s=>[...s.slice(-9),{id,before}]);
    setTasks(prev=>prev.map(t=>t.id===id?{...t,...changes}:t));
  };
  const bulkUpdateTasks = (ids, changes) => {
    if (!ids || !ids.length) return;
    pushSnapshotUndo();
    const idSet = new Set(ids);
    setTasks(prev => prev.map(t => idSet.has(t.id) ? {...t, ...changes} : t));
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
        .map(t => t.parentId===id ? {...t, parentId:null, date: task.date || null} : t));
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
      const newProject = {
        ...t,
        id: newProjectId,
        title: t.title + ' (copy)',
        createdAt: now,
        childOrder: (t.childOrder||[]).map(cid => idMap.get(cid)).filter(Boolean),
      };
      const newKids = kids.map(k => ({
        ...k,
        id: idMap.get(k.id),
        parentId: newProjectId,
        createdAt: now,
      }));
      pushSnapshotUndo();
      setTasks(prev => [...prev, newProject, ...newKids]);
      return;
    }
    const nt={...t,id:mkid(),title:t.title+' (copy)',createdAt:now};
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
    });
    setTasks(prev=>{
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
          } else {
            order.push(nt.id);
          }
          return {...t, childOrder: order};
        });
        return next;
      }
      const targetId = position.beforeId || position.afterId;
      if(!targetId) return next;
      const idx = prev.findIndex(t=>t.id===targetId);
      if(idx<0) return next;
      const insertAt = position.afterId ? idx + 1 : idx;
      return [...prev.slice(0,insertAt),nt,...prev.slice(insertAt)];
    });
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
      return {...t, done:true, completedAt: ts,
        blocked:false, blockedReason:'', blockedBy:[], blockedSince:null, followUpAt:null, tags};
    }
    return {...t, done:false, completedAt: null};
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

  // Spawn the next recurrence of a task (deep-copy children if it's a project).
  const spawnRecurrence = (task, nextDate, prevTasks) => {
    const now = new Date().toISOString();
    const additions = [];
    if(task.cardType === 'project') {
      const kids = prevTasks.filter(c=>c.parentId===task.id);
      const idMap = new Map();
      kids.forEach(k => idMap.set(k.id, mkid()));
      const newProjectId = mkid();
      additions.push({
        ...task,
        id: newProjectId,
        done: false, completedAt: null,
        date: nextDate,
        childOrder: (task.childOrder||[]).map(cid => idMap.get(cid)).filter(Boolean),
        activity: [{type:'created',at:now}],
      });
      kids.forEach(k => additions.push({
        ...k,
        id: idMap.get(k.id),
        parentId: newProjectId,
        done: false, completedAt: null,
        activity: [{type:'created',at:now}],
      }));
    } else {
      additions.push({
        ...task, id: mkid(),
        done:false, completedAt:null,
        date: nextDate,
        activity:[{type:'created',at:now}],
      });
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
          projectAfter = {...t, done:nowDone, completedAt: nowDone?ts:null, ...cleared};
          return projectAfter;
        }
        if(t.parentId===projectId) {
          if (nowDone) completedIds.push(t.id);
          const cleared = nowDone ? {blocked:false, blockedReason:'', blockedBy:[], blockedSince:null, followUpAt:null, tags:(t.tags||[]).filter(x=>x!=='blocked')} : {};
          return {...t, done:nowDone, completedAt: nowDone?ts:null, ...cleared};
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
    if(last.bulk) { setTasks(last.before); return; }
    if(last.deleted) { setTasks(prev=>[...prev,last.before]); return; }
    setTasks(prev=>prev.map(t=>t.id===last.id?last.before:t));
  };

  const resizeSidePanel = (e, panel) => {
    e.preventDefault();
    e.stopPropagation();
    const key = panel==='inbox' ? 'inboxWidth' : 'projectPanelWidth';
    const startX = e.clientX;
    const startWidth = Number(tweaks[key]) || (panel==='inbox'?178:190);
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

  // drag & drop
  const onDragStart=(e,id,col)=>{ setDrag({taskId:id,fromCol:col}); e.dataTransfer.effectAllowed='move'; };
  const onDragEnd=()=>{ setDrag(null); setDragOver(null); setCardDragOver(null); setColDropIndex(null); };
  const onDragOver=(e,col)=>{
    e.preventDefault();
    setDragOver(col);
    // Compute insertion index based on mouseY among direct cards in the col-body.
    const body = e.currentTarget.querySelector?.('.col-body');
    if(!body) return;
    const cards = [...body.querySelectorAll('.card')].filter(c => !c.parentElement.closest('.card'));
    let index = cards.length;
    for(let i=0;i<cards.length;i++){
      const r = cards[i].getBoundingClientRect();
      if(e.clientY < r.top + r.height/2) { index = i; break; }
    }
    setColDropIndex(prev => (prev?.col===col && prev?.index===index) ? prev : {col, index});
  };
  const onDragLeave=e=>{ if(!e.currentTarget.contains(e.relatedTarget)) { setDragOver(null); setColDropIndex(null); } };

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
      const newMoved = {...moved, date:null, parentId:null};
      // Compute insertion point: find the inbox task at `index` (post-removal) and insert before it.
      const inboxList = next.filter(t => !t.date && !t.done && !t.parentId && !t.archived);
      const targetTask = inboxList[index];
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

  const onDrop=(e,targetCol)=>{
    e.preventDefault();
    if(!drag){setDragOver(null);setColDropIndex(null);return;}
    if(cardDragOver){ setDragOver(null); setColDropIndex(null); return; } // a card-level drop will handle this
    const task=taskById(drag.taskId); if(!task){setDragOver(null);setColDropIndex(null);return;}
    // Inbox reorder: drop into inbox at a specific index.
    if(targetCol === 'inbox' && colDropIndex && colDropIndex.col === 'inbox') {
      pushSnapshotUndo();
      reorderToInbox(drag.taskId, colDropIndex.index);
      setDrag(null); setDragOver(null); setCardDragOver(null); setColDropIndex(null);
      return;
    }
    const newDate = targetCol==='inbox'?null:targetCol;
    // If dragging a child OUT of its project, clear parentId and remove from former parent's childOrder.
    if(task.parentId) {
      const parent = taskById(task.parentId);
      pushSnapshotUndo();
      setTasks(prev => prev.map(t => {
        if(t.id===task.id) return {...t, date:newDate, parentId:null};
        if(parent && t.id===parent.id) return {...t, childOrder:(t.childOrder||[]).filter(cid=>cid!==task.id)};
        return t;
      }));
    } else if(drag.fromCol !== targetCol) {
      updateTask(drag.taskId,{date:newDate});
    }
    setDrag(null); setDragOver(null); setCardDragOver(null); setColDropIndex(null);
  };

  // ── card-level drag (drop on a card to nest into a project) ──
  // Determine the source set: bulk-aware. If dragged card is in selection, use whole selection.
  const getDragSourceIds = () => {
    if(!drag) return [];
    if(selectedIds.has(drag.taskId) && selectedIds.size > 1) return [...selectedIds];
    return [drag.taskId];
  };
  const onCardDragOver = (e, target) => {
    if(!drag) return;
    // Only intercept for project nesting. Non-project cards let the event bubble
    // to the column so the reorder handler can compute insertion position.
    if(target.cardType !== 'project') {
      setCardDragOver(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    let index;
    // determine insertion index by mouse Y vs children
    const body = e.currentTarget.querySelector('.card-project-body');
    if(body) {
      const childEls = [...body.querySelectorAll(':scope > .card')];
      index = childEls.length;
      for(let i=0;i<childEls.length;i++) {
        const r = childEls[i].getBoundingClientRect();
        if(e.clientY < r.top + r.height/2) { index = i; break; }
      }
    } else {
      index = 0;
    }
    setCardDragOver(prev => (prev?.targetId===target.id && prev?.index===index) ? prev : {targetId:target.id, index});
  };
  const onCardDragLeave = (e, target) => {
    if(!e.currentTarget.contains(e.relatedTarget)) {
      setCardDragOver(prev => prev?.targetId===target.id ? null : prev);
    }
  };
  const onCardDrop = (e, target) => {
    if(target.cardType !== 'project') return; // let column handle reorder
    e.preventDefault();
    e.stopPropagation();
    if(!drag) return;
    const srcIds = getDragSourceIds();
    const dropIndex = cardDragOver?.targetId === target.id ? cardDragOver.index : undefined;
    handleCardDrop(srcIds, target.id, dropIndex);
    setDrag(null); setDragOver(null); setCardDragOver(null);
  };

  // Snapshot the entire tasks array for atomic undo of multi-task ops.
  const pushSnapshotUndo = () => setUndoStack(s => [...s.slice(-9), {bulk:true, before:tasks}]);

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
      if((e.metaKey||e.ctrlKey)&&e.key==='\\'){ e.preventDefault(); setNavCollapsed(n=>!n); return; }
      if((e.metaKey||e.ctrlKey)&&(e.key==='z'||e.key==='Z')){ e.preventDefault(); undo(); return; }
      if(e.key==='Escape'){ setRenamingId(null); setDrawerId(null); setSettingsOpen(false); setFocusedId(null); setPalette(false); setShortcuts(false); setAddModal(null); setFilterOpen(false); return; }
      if(inInput) return;
      if(e.key==='?'){ setShortcuts(s=>!s); return; }
      if(e.key==='j'||e.key==='J') moveFocusInCol(1);
      if(e.key==='k'||e.key==='K') moveFocusInCol(-1);
      if(e.key==='ArrowRight') moveFocusToCol(1);
      if(e.key==='ArrowLeft')  moveFocusToCol(-1);
      if((e.key==='x'||e.key==='X')&&focusedId){ const t=taskById(focusedId); if(t) completeTask(t.id,t.date||'inbox'); }
      if((e.key==='e'||e.key==='E')&&focusedId){ e.preventDefault(); setDrawerId(null); setSettingsOpen(false); setRenamingId(focusedId); }
      if(e.key==='Enter'&&focusedId&&!drawerId){ setSettingsOpen(false); setRenamingId(null); setDrawerId(focusedId); }
      if(e.key==='n'||e.key==='N'){ const ci=getFocusedColIdx(); const ck=visColKeys[ci<0?1:ci]||visColKeys[1]; const date=ck&&ck!=='inbox'?D.parse(ck):null; addTask(ck||'inbox',date,'Untitled'); }
      if(e.key==='a'||e.key==='A'){
        e.preventDefault();
        const t = focusedId ? taskById(focusedId) : null;
        if(t){
          if(t.parentId){
            addTask('inbox', null, 'Untitled', {parentId: t.parentId, afterId: t.id});
          } else {
            const ck = t.date || 'inbox';
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
  const viewTitle = view==='week'?timelineTitle:view==='inbox'?'Inbox':view==='upcoming'?'Upcoming':view==='backlog'?'Backlog':view==='snoozed'?'Snoozed':view==='someday'?'Someday':view==='blocked'?'Blocked':view==='completed'?'Completed':view==='archived'?'Archived':view==='delegations'?'Delegations':view?.type==='project'?PROJ.find(p=>p.id===view.id)?.label||'Location':view?.type==='tag'?TAG_NAMES[view.name]||view.name:view?.type==='lifeArea'?lifeAreaOptionLabel(view.id):'Tasks';

  // non-week view tasks
  const listTasks = ()=>{
    if(view==='inbox') return applyFilters(activeTasks.filter(t=>!t.date&&!t.done&&!t.parentId&&!t.snoozedUntil&&!t.someday&&!t.blocked));
    if(view==='upcoming') return applyFilters(activeTasks.filter(t=>D.isFut(t.date)&&!t.done&&!t.parentId&&!t.blocked));
    if(view==='backlog') return applyFilters(activeTasks.filter(t=>!t.date&&!t.done&&!t.parentId&&!t.someday&&!t.blocked));
    if(view==='snoozed') return applyFilters(activeTasks.filter(t=>!!t.snoozedUntil&&!t.parentId));
    if(view==='someday') return applyFilters(activeTasks.filter(t=>!!t.someday&&!t.parentId));
    if(view==='blocked') return applyFilters(activeTasks.filter(t=>t.blocked&&!t.done&&!t.parentId));
    if(view==='completed') return applyFilters(activeTasks.filter(t=>t.done&&!t.parentId));
    if(view==='archived') return applyFilters(tasks.filter(t=>t.archived&&!t.parentId));
    if(view?.type==='project') return applyFilters(activeTasks.filter(t=>t.project===view.id&&!t.parentId));
    if(view?.type==='tag') return applyFilters(activeTasks.filter(t=>(t.tags||[]).includes(view.name)&&!t.parentId));
    if(view?.type==='lifeArea') return applyFilters(activeTasks.filter(t=>{
      if(t.parentId) return false;
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
    else if(sidePanelView==='inbox') list = applyFilters(activeTasks.filter(t=>!t.date&&!t.done&&!t.parentId&&!t.snoozedUntil&&!t.someday&&!t.blocked));
    else if(sidePanelView==='upcoming') list = applyFilters(activeTasks.filter(t=>D.isFut(t.date)&&!t.done&&!t.parentId&&!t.blocked));
    else if(sidePanelView==='backlog') list = applyFilters(activeTasks.filter(t=>!t.date&&!t.done&&!t.parentId&&!t.someday&&!t.blocked));
    else if(sidePanelView==='snoozed') list = applyFilters(activeTasks.filter(t=>!!t.snoozedUntil&&!t.parentId));
    else if(sidePanelView==='someday') list = applyFilters(activeTasks.filter(t=>!!t.someday&&!t.parentId));
    else if(sidePanelView==='blocked') list = applyFilters(activeTasks.filter(t=>t.blocked&&!t.done&&!t.parentId));
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
  const bulkSet = (changes, label='Updated') => bulkUpdate(t=>({...t,...changes}), label);
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
      project: first.project,
      lifeArea: getEffectiveLifeArea(first),
      tags: [...(first.tags||[])],
      priority: first.priority,
    });
    pushSnapshotUndo();
    const ids = new Set(sel.map(s=>s.id));
    setTasks(prev => [...prev.map(t => ids.has(t.id) ? {...t, parentId:newProject.id, date:null} : t), newProject]);
    setSelectedIds(new Set());
    setRenamingId(null);
    setTimeout(()=>{ setDrawerId(newProject.id); setFocusedId(newProject.id); }, 60);
  };

  const bulkDelete = () => {
    if(!selectedIds.size) return;
    if(!window.confirm(`Delete ${selectedIds.size} selected task${selectedIds.size===1?'':'s'}?`)) return;
    const ids = new Set(selectedIds);
    setUndoStack(s=>[...s.slice(-9),{bulk:true,before:tasks}]);
    setTasks(prev=>prev.filter(t=>!ids.has(t.id)));
    setSelectedIds(new Set());
    setDrawerId(id=>ids.has(id)?null:id);
    setFocusedId(id=>ids.has(id)?null:id);
    setToast('Deleted');
    setTimeout(()=>setToast(null),1400);
  };

  const openTask = (id) => { setSettingsOpen(false); setRenamingId(null); setDrawerFromLeft(false); setDrawerId(id); setFocusedId(id); };
  const openSettings = () => { setDrawerId(null); setRenamingId(null); setSettingsOpen(s=>!s); };
  const drawerTask = drawerId ? taskById(drawerId) : null;

  // board pan-to-scroll — attach move/up to document so fast drags don't lose events
  const onBoardMouseDown = e => {
    if (e.button !== 0) return;
    if (e.target.closest('.card,.col-add,.col-groupby,.col-groupby-wrap,.card-add-zone,.side-panel,.col-hdr,.grp-hdr,.done-grp-hdr,.tb-btn,.lnav-item,.drawer')) return;
    const el = boardRef.current; if (!el) return;
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
      setBoardMetrics({scrollLeft:el.scrollLeft,width:el.clientWidth,boardWidth:shell?.clientWidth||el.clientWidth});
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
  };
  const renderTimelineColumn = (date, keyPrefix='') => {
    const colKey=D.str(date);
    const colTasks=tasksForCol(colKey);
    const pinClass = colKey===todayStr && todayPin ? `today-pinned pin-${todayPin}` : '';
    return <Column key={`${keyPrefix}${colKey}`} className={pinClass} date={date} tasks={colTasks}
      focusedCardId={focusedId} selectedIds={selectedIds} spawning={spawning} theme={theme}
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
      onDragStart={onDragStart} onDragEnd={onDragEnd}
      onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}
      dragOver={dragOver===colKey?colKey:null} draggingId={drag?.taskId}
      childrenOf={childrenOf} projectStats={projectStats}
      collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
      forceOpenProjects={forceOpenProjects}
      onCardDragOver={onCardDragOver} onCardDragLeave={onCardDragLeave} onCardDrop={onCardDrop}
      cardDragOver={cardDragOver}
      blockingCountFor={blockingCountFor} taskTitleById={taskTitleById}
      cardExtras={cardExtras}/>;
  };
  const ctxItems = contextMenu ? (() => {
    const t = contextMenu.task;
    const open = field => { setPopRequest({id:t.id, field}); setFocusedId(t.id); };
    return [
      {type:'lbl', label:'Edit'},
      {label:'Tag…',      onClick:()=>open('tag'),    kbd:'T'},
      {label:'Location…', onClick:()=>open('proj'),   kbd:'P'},
      {label:'Time…',     onClick:()=>open('time'),   kbd:'M'},
      {label:'Date…',     onClick:()=>open('date'),   kbd:'⇧D'},
      {label:'Priority…', onClick:()=>open('pri'),    kbd:'⇧R'},
      {label:'Snooze…',   onClick:()=>open('snooze'), kbd:'S'},
      {type:'sep'},
      {label:'Open in drawer', onClick:()=>openTask(t.id), kbd:'↵'},
      {label:'Rename',         onClick:()=>setRenamingId(t.id), kbd:'E'},
      {label:'Duplicate',      onClick:()=>duplicateTask(t.id), kbd:'D'},
      {label:'Move to inbox',  onClick:()=>updateTask(t.id,{date:null,someday:false,snoozedUntil:null})},
      {type:'sep'},
      {label:'Archive', onClick:()=>archiveTask(t.id), kbd:'C'},
      {label:'Delete',  onClick:()=>deleteTask(t.id), danger:true, kbd:'⌫'},
    ];
  })() : [];

  return <>
    {/* TOPBAR */}
    <div className="topbar">
      <div className="tb-logo"><div className="tb-icon">K</div>kanban</div>
      <div className="tb-sep"/>
      <div className="tb-crumb">
        <span>Workspace</span><span>›</span>
        <span className="tb-crumb-active">{viewTitle}</span>
      </div>
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
      <div className="tb-spacer"/>
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
        <button className="tb-btn" onClick={()=>setShowWaitingOn(v=>!v)} title="Show only delegated tasks"
          style={showWaitingOn?{color:'var(--accent)'}:undefined}>→ Waiting</button>
        <button className="tb-btn" onClick={()=>setShowStaleOnly(v=>!v)} title="Show only stale delegations"
          style={showStaleOnly?{color:'#ef4444'}:undefined}>⚠ Stale</button>
        <button className="tb-btn" onClick={()=>setView('delegations')} title="Delegations dashboard"
          style={view==='delegations'?{color:'var(--accent)'}:undefined}>👥 Delegations</button>
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
      <button className="tb-btn primary" onClick={()=>addTask('today',D.today(),'Untitled')}><I.Plus/>New task</button>
    </div>

    {/* BODY */}
    <div className="app-shell">
    <div className={`app-body${filtersActive?' chk-mode':''}${selectedIds.size?' chk-mode':''}`} onClick={e=>{ setFilterOpen(false); setGroupOpen(false); if(!e.target.closest('.card,.list-item,.side-panel,.lnav,.drawer,.bulk-bar')) { setFocusedId(null); setRenamingId(null); setDrawerId(null); setSettingsOpen(false); } }}>
      <LeftNav tasks={tasks} view={view} onSettings={openSettings} onView={v=>{setView(v);setSettingsOpen(false);setFilterOpen(false);}} collapsed={navCollapsed} theme={theme}
        activeLifeAreas={filters.lifeAreas}
        onLifeAreaToggle={id=>toggleFilter('lifeAreas',id)}/>
      {view==='week' ? (
        <div className="board-area" ref={boardShellRef} style={{'--col-w':`${COL_W}px`}}>
          <InboxCol tasks={sidePanelCurrentTasks} theme={theme} focusedCardId={focusedId} spawning={spawning}
            selectedIds={selectedIds}
            renamingId={renamingId}
            width={Number(tweaks.inboxWidth)||178}
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
            onDragStart={onDragStart} onDragEnd={onDragEnd}
            onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}
            dragOver={dragOver} draggingId={drag?.taskId}
            childrenOf={childrenOf} projectStats={projectStats}
            collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
            forceOpenProjects={forceOpenProjects}
            onCardDragOver={onCardDragOver} onCardDragLeave={onCardDragLeave} onCardDrop={onCardDrop}
            cardDragOver={cardDragOver} colDropIndex={colDropIndex}
            inboxFilters={inboxFilters} onCycleInboxFilter={cycleInboxFilter} onClearInboxFilters={clearInboxFilters} inboxFilterCount={inboxFilterCount}
            inboxGroupBy={inboxGroupBy} onInboxGroupBy={setInboxGroupBy}
            collapsedGrps={collapsedGrps}
            onToggleGrp={gk=>setCollapsedGrps(s=>{const ns=new Set(s);ns.has(gk)?ns.delete(gk):ns.add(gk);return ns;})}
            cardExtras={cardExtras}/>
          {tweaks.showProjectPanel && <ProjectSidePanel tasks={activeTasks}
            activeProjects={filters.projects}
            width={Number(tweaks.projectPanelWidth)||190}
            collapsed={!!tweaks.projectPanelCollapsed}
            stickyLeft={tweaks.inboxCollapsed?34:(Number(tweaks.inboxWidth)||178)}
            onCollapse={()=>setTweak('projectPanelCollapsed',!tweaks.projectPanelCollapsed)}
            onResizeStart={resizeSidePanel}
            onProjectToggle={id=>toggleFilter('projects',id)}/>}
          <div className="timeline-scroll" ref={boardRef} onMouseDown={onBoardMouseDown} onScroll={onBoardScroll}>
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
      ) : (
        <ListView title={viewTitle} tasks={listTasks()} onOpen={openTask} onFocus={setFocusedId}
          onSelect={toggleSelected} selectedIds={selectedIds}
          focusedCardId={focusedId} renamingId={renamingId} onRename={updateTask} onRenameDone={()=>setRenamingId(null)}/>
      )}
    </div>
    {selectedTasks.length>0 && (
      <div className="bulk-bar" onClick={e=>e.stopPropagation()}>
        <div className="bulk-count">{selectedTasks.length} selected</div>
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
        <input className="bulk-input" type="date" onChange={e=>{bulkSet({date:e.target.value||null}, e.target.value?'Date updated':'Moved to inbox'); e.target.value='';}}/>
        <button className="tb-btn" onClick={bulkGroupIntoProject} disabled={selectedTasks.length<2}>Group into project</button>
        <button className="tb-btn" onClick={()=>{
          const ts = new Date().toISOString();
          bulkUpdate(t=>({...t, done:true, completedAt:ts,
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
    </div>

    {/* STATUS BAR */}
    <div className="sbar">
      <div className="sbar-left">
        <span>{todayCount} remaining today · {allCount} total</span>
        <div className="sbar-sep"/>
        <span style={{color:'var(--accent)',fontFamily:'var(--mono)',fontSize:10}}>{activeTasks.filter(t=>!t.done&&!t.blocked&&(t.tags||[]).includes('focus')).length} focus blocks</span>
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
      onClose={()=>setDrawerId(null)}
      onDelete={deleteTask}
      onDuplicate={duplicateTask}
      onMoveToInbox={id=>updateTask(id,{date:null,someday:false,snoozedUntil:null})}
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

    {/* MODALS */}
    {palette && <CommandPalette onClose={()=>setPalette(false)} onCmd={onPaletteCmd}/>}
    {shortcuts && <ShortcutsOverlay onClose={()=>setShortcuts(false)}/>}
    {confirmDialog && (
      <div className="overlay-bg" onClick={e=>{ if(e.target===e.currentTarget) confirmDialog.onCancel?.(); }}>
        <div className="confirm-dialog">
          <div className="confirm-msg">{confirmDialog.message}</div>
          <div className="confirm-acts">
            <button className="tb-btn" onClick={confirmDialog.onCancel}>Cancel</button>
            <button className="tb-btn primary" onClick={confirmDialog.onConfirm}>Confirm</button>
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
  </>;
}

export default App;
