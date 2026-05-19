import React, { useState, useEffect, useRef } from 'react';
import { PROJ, TAG_NAMES, TAG_DARK, TAG_LIGHT, daysSince, recurrenceLabel, D } from '../data.js';
import { I } from '../utils/icons.jsx';
// Life-area imports dropped in the Buckets redesign polish pass. ListView
// now shows a bucket chip resolved from tweaks.customGroups.
import { PRI_INFO } from '../utils/constants.js';
import { CheckGlyph } from './CheckGlyph.jsx';
import { EmptyState } from './EmptyState.jsx';

function ListTaskItem({ task, tweaks, focused, selected, renaming, onOpen, onFocus, onSelect, onRename, onRenameDone, onContextMenu }) {
  // Bucket chip — render alongside the other meta if the task is bucketed.
  // Cross-view parity with TaskCard / StackView per
  // memory/feedback_visual_consistency_across_views.md.
  const bucket = task?.groupId
    ? (tweaks?.customGroups || []).find(g => g.id === task.groupId) || null
    : null;
  const [draft,setDraft] = useState(task.title || '');
  const ref = useRef(null);
  // See TaskCard.jsx for rationale — clears hover-induced focus on leave while
  // leaving click/keyboard focus alone.
  const hoverFocusRef = useRef(false);
  useEffect(()=>setDraft(task.title || ''),[task.id,task.title]);
  useEffect(()=>{ if(renaming) requestAnimationFrame(()=>{ ref.current?.focus(); ref.current?.select(); }); },[renaming]);
  const finish = (save=true) => {
    if(save && draft.trim() && draft.trim()!==task.title) onRename(task.id,{title:draft.trim()});
    else setDraft(task.title || '');
    onRenameDone();
  };
  return (
    <div className={`list-item${focused?' focused':''}${selected?' selected':''}${task.snoozedUntil?' is-snoozed':''}`} data-list-id={task.id}
      onMouseEnter={()=>{ if(!focused) hoverFocusRef.current=true; onFocus(task.id); }}
      onMouseLeave={()=>{ if(hoverFocusRef.current && focused) onFocus(null); hoverFocusRef.current=false; }}
      onClick={()=>{ if(renaming) return; hoverFocusRef.current=false; onFocus(task.id); }}
      onDoubleClick={()=>!renaming&&onOpen(task.id)}
      onContextMenu={e=>{ if(onContextMenu){ e.preventDefault(); e.stopPropagation(); onContextMenu(task, e.clientX, e.clientY); } }}>
      <button className={`bulk-check${selected?' on':''}`} title={selected?'Deselect task':'Select task'}
        onClick={e=>{e.stopPropagation();onSelect(task.id);}}>{selected?'✓':''}</button>
      <CheckGlyph done={!!task.done} size={13} interactive={false}/>
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
      {task.snoozedUntil && <span className="list-item-date" title={`Returns ${D.fmtSnooze(task.snoozedUntil)}`}>Until {D.fmtSnooze(task.snoozedUntil)}</span>}
      {task.date && <span className="list-item-date" title={`Start Date: ${task.date}`}>Start {task.date}</span>}
      {task.dueDate && <span className="list-item-date" title={`Due Date: ${task.dueDate}`}>Due {task.dueDate}</span>}
      {bucket && (
        <span className="card-tag card-tag-bucket"
          style={{ background: `${bucket.color || '#94a3b8'}22`, color: bucket.color || '#94a3b8' }}
          title={`Bucket: ${bucket.name}`}>
          {bucket.name}
        </span>
      )}
      {task.recurrence && (
        <span className={`schip ${task.recurrence.isRoutine ? 'schip-routine' : 'schip-recurring'}`}
              title={`Repeats: ${recurrenceLabel(task.recurrence)}${task.recurrence.isRoutine ? ' (routine)' : ''}`}>
          ↻ {recurrenceLabel(task.recurrence)}
        </span>
      )}
    </div>
  );
}

function ListView({ title, tasks, tweaks, onOpen, onFocus, onSelect, selectedIds, focusedCardId, renamingId, onRename, onRenameDone, onContextMenu }) {
  const renderLimit = 500;
  const shownTasks = tasks.slice(0, renderLimit);
  return <div className="list-view">
    <div className="list-view-title">{title}</div>
    {tasks.length===0 && <EmptyState kind="list" title="Nothing here yet" hint="Switch to Calendar or Inbox to capture something."/>}
    {shownTasks.map(t=>(
      <ListTaskItem key={t.id} task={t} tweaks={tweaks} focused={focusedCardId===t.id} selected={selectedIds?.has(t.id)} renaming={renamingId===t.id}
        onOpen={onOpen} onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
        onContextMenu={onContextMenu}/>
    ))}
    {tasks.length>renderLimit && <div className="list-note">Showing first {renderLimit} of {tasks.length}. Search or filter to narrow this list.</div>}
  </div>;
}

// ── AddTaskModal ─────────────────────────────────────────────────────────

export { ListTaskItem, ListView };
