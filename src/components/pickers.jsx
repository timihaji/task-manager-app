import React, { useState } from 'react';
import { PROJ, ALL_TAGS, TAG_NAMES, TAG_DARK, TAG_LIGHT, D } from '../data.js';
import { TIME_PRESETS, TIME_MORE, PRI_INFO, SNOOZE_OPTS } from '../utils/constants.js';
import { parseNLDate } from '../utils/parseNLDate.js';
import { MiniCalendar } from './MiniCalendar.jsx';

// ── Field pickers ────────────────────────────────────────────────────────
function TagPicker({ task, theme, recents, onChange, onClose, isBulk }) {
  const tp = theme==='dark' ? TAG_DARK : TAG_LIGHT;
  const [filter, setFilter] = useState('');
  const cur = task.tags || [];
  const toggle = t => {
    const next = cur.includes(t) ? cur.filter(x=>x!==t) : [...cur, t];
    onChange({tags: next}, t);
  };
  const list = ALL_TAGS.filter(t => !filter || (TAG_NAMES[t]||t).toLowerCase().includes(filter.toLowerCase()));
  const recList = (recents||[]).filter(t => ALL_TAGS.includes(t)).slice(0,3);
  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      {ALL_TAGS.length > 6 && (
        <input className="card-pop-search" placeholder="Filter tags..." autoFocus value={filter} onChange={e=>setFilter(e.target.value)}/>
      )}
      {recList.length > 0 && !filter && (
        <>
          <div className="card-pop-recent-lbl">Recent</div>
          <div className="card-pop-row">
            {recList.map(t=>{
              const c = tp[t] || tp.admin;
              const act = cur.includes(t);
              return <span key={'r'+t} className={`card-pop-chip${act?' act':''}`}
                style={act?{background:c.bg,color:c.fg,borderColor:c.fg+'66'}:{}}
                onClick={()=>toggle(t)}>{TAG_NAMES[t]||t}</span>;
            })}
          </div>
          <div className="card-pop-sep"/>
        </>
      )}
      <div className="card-pop-row">
        {list.map(t=>{
          const c = tp[t] || tp.admin;
          const act = cur.includes(t);
          return <span key={t} className={`card-pop-chip${act?' act':''}`}
            style={act?{background:c.bg,color:c.fg,borderColor:c.fg+'66'}:{}}
            onClick={()=>toggle(t)}>{TAG_NAMES[t]||t}</span>;
        })}
      </div>
      <div className="card-pop-foot">
        <button className="card-pop-clear" onClick={onClose}>Done</button>
      </div>
    </>
  );
}

function ProjPicker({ task, recents, onChange, onClose, isBulk }) {
  const cur = task.project || null;
  const recList = (recents||[]).filter(p => PROJ.find(x=>x.id===p)).slice(0,3);
  const pick = p => { onChange({project: cur===p ? null : p}, p); onClose(); };
  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      {recList.length > 0 && (
        <>
          <div className="card-pop-recent-lbl">Recent</div>
          <div className="card-pop-row">
            {recList.map(pid=>{
              const p = PROJ.find(x=>x.id===pid); if(!p) return null;
              const act = cur===p.id;
              return <span key={'r'+pid} className={`card-pop-chip${act?' act':''}`}
                style={act?{background:p.color+'22',color:p.color,borderColor:p.color+'66'}:{}}
                onClick={()=>pick(p.id)}>
                <span className="card-pop-chip-dot" style={{background:p.color}}/>{p.label}
              </span>;
            })}
          </div>
          <div className="card-pop-sep"/>
        </>
      )}
      <div className="card-pop-row">
        {PROJ.map(p=>{
          const act = cur===p.id;
          return <span key={p.id} className={`card-pop-chip${act?' act':''}`}
            style={act?{background:p.color+'22',color:p.color,borderColor:p.color+'66'}:{}}
            onClick={()=>pick(p.id)}>
            <span className="card-pop-chip-dot" style={{background:p.color}}/>{p.label}
          </span>;
        })}
        {cur && <button className="card-pop-clear" onClick={()=>{onChange({project:null}); onClose();}}>Clear</button>}
      </div>
    </>
  );
}

function TimePicker({ task, onChange, onClose, isBulk }) {
  const cur = task.timeEstimate || null;
  const [showMore, setShowMore] = useState(false);
  const pick = v => { onChange({timeEstimate: cur===v ? null : v}); onClose(); };
  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      <div className="card-pop-row">
        {TIME_PRESETS.map(p=>{
          const act = cur===p;
          return <span key={p} className={`card-pop-chip${act?' act':''}`} onClick={()=>pick(p)}>{p}</span>;
        })}
        <span className="card-pop-chip" onClick={()=>setShowMore(s=>!s)}>{showMore?'Less ▴':'More ▾'}</span>
      </div>
      {showMore && (
        <>
          <div className="card-pop-sep"/>
          <div className="card-pop-row">
            {TIME_MORE.map(p=>{
              const act = cur===p;
              return <span key={p} className={`card-pop-chip${act?' act':''}`} onClick={()=>pick(p)}>{p}</span>;
            })}
          </div>
        </>
      )}
      {cur && (
        <div className="card-pop-foot">
          <button className="card-pop-clear" onClick={()=>{onChange({timeEstimate:null}); onClose();}}>Clear</button>
        </div>
      )}
    </>
  );
}

function DatePicker({ task, onChange, onClose, isBulk }) {
  const cur = task.date || null;
  const [nl, setNL] = useState('');
  const today = D.today();
  const quick = [
    {l:'Today',     fn:()=>D.str(today)},
    {l:'Tomorrow',  fn:()=>D.str(D.add(today,1))},
    {l:'Next week', fn:()=>D.str(D.add(today,7))},
    {l:'Inbox',     fn:()=>null},
  ];
  const preview = parseNLDate(nl);
  const previewLbl = preview ? (() => {
    const d = D.parse(preview);
    return d.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
  })() : null;
  const commit = v => { onChange({date: v}); onClose(); };
  const onNLKey = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (preview) commit(preview);
    }
  };
  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      <div className="card-pop-row">
        {quick.map(q=>{
          const v = q.fn();
          const act = cur === v;
          return <span key={q.l} className={`card-pop-chip${act?' act':''}`} onClick={()=>commit(v)}>{q.l}</span>;
        })}
        {cur && <button className="card-pop-clear" onClick={()=>commit(null)}>Clear</button>}
      </div>
      <div className="card-pop-sep"/>
      <input className="card-pop-input" placeholder='e.g. "next fri", "+3d", "4/15"'
        value={nl} onChange={e=>setNL(e.target.value)} onKeyDown={onNLKey} autoFocus/>
      {nl && (
        <div className={`card-pop-hint${preview?'':' warn'}`}>
          {preview ? `↵ ${previewLbl}` : "Can't parse"}
        </div>
      )}
      <MiniCalendar value={cur} onPick={commit}/>
    </>
  );
}

function PriPicker({ task, onChange, onClose, isBulk }) {
  const cur = task.priority || task.pri || null;
  const pick = v => { onChange({priority:v, pri:v}); onClose(); };
  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      <div className="card-pop-row">
        {['p1','p2','p3'].map(v=>{
          const inf = PRI_INFO[v];
          const act = cur===v;
          return <span key={v} className={`card-pop-chip${act?' act':''}`}
            style={act?{background:inf.c+'22',color:inf.c,borderColor:inf.c+'66'}:{}}
            onClick={()=>pick(v)}>{inf.l}</span>;
        })}
        {cur && <button className="card-pop-clear" onClick={()=>{onChange({priority:null,pri:null}); onClose();}}>Clear</button>}
      </div>
    </>
  );
}

function SnoozePicker({ task, onChange, onClose, isBulk }) {
  const cur = task.snoozedUntil || null;
  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      <div className="card-pop-row">
        {SNOOZE_OPTS.map(o=>(
          <span key={o.l} className="card-pop-chip" onClick={()=>{onChange({snoozedUntil:o.fn()}); onClose();}}>{o.l}</span>
        ))}
      </div>
      {cur && (
        <div className="card-pop-foot">
          <button className="card-pop-clear" onClick={()=>{onChange({snoozedUntil:null}); onClose();}}>Wake up now</button>
        </div>
      )}
    </>
  );
}

export { TagPicker, ProjPicker, TimePicker, DatePicker, PriPicker, SnoozePicker };
