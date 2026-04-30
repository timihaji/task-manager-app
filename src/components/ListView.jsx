import React, { useState, useEffect, useRef } from 'react';
import { PROJ, TAG_NAMES, TAG_DARK, TAG_LIGHT, LIFE_AREA_NAMES, daysSince } from '../data.js';
import { I } from '../utils/icons.jsx';
import { lifeAreaPalette, UNASSIGNED_LIFE_AREA } from '../utils/colors.js';
import { PRI_INFO } from '../utils/constants.js';

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

export { ListTaskItem, ListView };
