import React from 'react';
import { PROJ, ALL_TAGS, TAG_NAMES, TAG_DARK, D, LIFE_AREAS, LIFE_AREA_NAMES } from '../data.js';
import { I } from '../utils/icons.jsx';
import { lifeAreaPalette, UNASSIGNED_LIFE_AREA } from '../utils/colors.js';

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
    stack: all.filter(t=>!t.done&&!t.parentId&&!t.snoozedUntil).length,
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
        <NavItem ico={I.Stack} label="Stack" v="stack" cnt={counts.stack}/>
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

export { ProjectSidePanel, LeftNav };
