import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../utils/icons.jsx';
import { D, parseTimeEst, fmtTimeEst, PROJ, TAG_NAMES, TAG_DARK, TAG_LIGHT, LIFE_AREA_NAMES } from '../data.js';
import { lifeAreaPalette } from '../utils/colors.js';
import { PriBars } from './PriBars.jsx';

const PRI_RANK = { p1:0, p2:1, p3:2, p4:3 };
const COMPLETE_ANIM_MS = 320;

const todayStr = () => D.str(D.today());

// Local-day YYYY-MM-DD from a Date or ISO string. Matches the user's wall-clock day,
// unlike D.str(D.today()) which converts local-midnight to UTC and can drift by a day.
const localDayStr = (input) => {
  const d = input ? new Date(input) : new Date();
  if (isNaN(d)) return null;
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
};

const dateRank = (date, today=todayStr()) => {
  if (!date) return 999;
  if (date < today) return -1;
  if (date === today) return 0;
  const a = D.parse(date).getTime();
  const t = D.parse(today).getTime();
  return Math.round((a - t) / 86400000);
};

const dueLabel = (date, today=todayStr()) => {
  if (!date) return null;
  if (date < today) {
    const days = -dateRank(date, today);
    return { kind:'overdue', label: days===1 ? '1 day overdue' : `${days} days overdue` };
  }
  if (date === today) return { kind:'today', label:'Due today' };
  const r = dateRank(date, today);
  if (r === 1) return { kind:'soon', label:'Due tomorrow' };
  if (r <= 7) return { kind:'soon', label:`In ${r} days` };
  const d = D.parse(date);
  return { kind:'later', label: d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) };
};

const effectiveDate = (t, allTasks) => {
  if (t.cardType === 'project') {
    const kids = (allTasks || []).filter(c => c.parentId === t.id && !c.done && c.date);
    if (kids.length) {
      kids.sort((a,b)=> (a.date||'').localeCompare(b.date||''));
      return kids[0].date;
    }
  }
  return t.date || null;
};

function sortStack(arr, mode, allTasks, manualOrder=[]) {
  const list = arr.slice();
  if (mode === 'date') {
    list.sort((a,b)=>{
      const da = dateRank(effectiveDate(a, allTasks)), db = dateRank(effectiveDate(b, allTasks));
      if (da !== db) return da - db;
      return (PRI_RANK[a.priority || a.pri] ?? 9) - (PRI_RANK[b.priority || b.pri] ?? 9);
    });
  } else if (mode === 'priority') {
    list.sort((a,b)=>{
      const pa = PRI_RANK[a.priority || a.pri] ?? 9, pb = PRI_RANK[b.priority || b.pri] ?? 9;
      if (pa !== pb) return pa - pb;
      const da = dateRank(effectiveDate(a, allTasks)), db = dateRank(effectiveDate(b, allTasks));
      return da - db;
    });
  } else if (mode === 'manual') {
    const idx = new Map(manualOrder.map((id,i)=>[id,i]));
    const smart = sortStack(list, 'smart', allTasks);
    const smartIdx = new Map(smart.map((t,i)=>[t.id, i]));
    list.sort((a,b)=>{
      const ai = idx.has(a.id) ? idx.get(a.id) : Infinity;
      const bi = idx.has(b.id) ? idx.get(b.id) : Infinity;
      if (ai !== bi) return ai - bi;
      return (smartIdx.get(a.id) ?? 0) - (smartIdx.get(b.id) ?? 0);
    });
  } else {
    // smart
    list.sort((a,b)=>{
      const ba = a.blocked ? 1 : 0, bb = b.blocked ? 1 : 0;
      if (ba !== bb) return ba - bb;
      const da = dateRank(effectiveDate(a, allTasks)), db = dateRank(effectiveDate(b, allTasks));
      const dsA = da < 0 ? -100 : da;
      const dsB = db < 0 ? -100 : db;
      const pa = PRI_RANK[a.priority || a.pri] ?? 9, pb = PRI_RANK[b.priority || b.pri] ?? 9;
      const sA = dsA * 4 + pa * 6;
      const sB = dsB * 4 + pb * 6;
      if (sA !== sB) return sA - sB;
      return (a.title||'').localeCompare(b.title||'');
    });
  }
  return list;
}

function ChipRow({ task, isProject, allTasks, theme }) {
  const due = dueLabel(effectiveDate(task, allTasks));
  const proj = PROJ.find(p=>p.id === task.project);
  const tags = task.tags || [];
  const life = task.lifeArea;
  const lifeMeta = life ? lifeAreaPalette(life, theme) : null;
  const tagPalette = theme === 'light' ? TAG_LIGHT : TAG_DARK;

  let totalTime = task.timeEstimate;
  if (isProject) {
    const kids = (allTasks || []).filter(c => c.parentId === task.id && !c.done);
    const sum = kids.reduce((s,c)=>s + parseTimeEst(c.timeEstimate), 0);
    if (sum) totalTime = fmtTimeEst(sum);
  }

  return (
    <div className="scard-r2">
      {due && due.kind === 'overdue' && <span className="schip schip-due-overdue">⚠ {due.label}</span>}
      {due && due.kind === 'today' && <span className="schip schip-due-today">● {due.label}</span>}
      {due && due.kind === 'soon' && <span className="schip"><I.Cal/>{due.label}</span>}
      {due && due.kind === 'later' && <span className="schip"><I.Cal/>{due.label}</span>}
      {!due && <span className="schip" style={{opacity:.6}}><I.Cal/>No date</span>}

      {proj && <span className="schip schip-proj" style={{color:proj.color, borderColor:proj.color+'55'}}>{proj.id}</span>}

      {lifeMeta && (
        <span className="schip schip-life" style={{background:lifeMeta.bg, color:lifeMeta.fg, borderColor:lifeMeta.fg+'40'}}>
          {LIFE_AREA_NAMES[life] || life}
        </span>
      )}

      {tags.slice(0,2).map(tg => {
        const p = tagPalette[tg];
        if (!p) return null;
        return <span key={tg} className="schip schip-tag" style={{background:p.bg, color:p.fg, borderLeftColor:p.fg, borderColor:p.fg+'40'}}>{TAG_NAMES[tg] || tg}</span>;
      })}

      {task.checkInOf && <span className="schip schip-delegated">→ Check-in</span>}
      {task.blocked && <span className="schip schip-blocked" title={task.blockedReason}>⏸ Blocked</span>}
      {task.recurrence && <span className="schip schip-recurring">↻ {task.recurrence.freq}</span>}

      {totalTime && <span className="schip-time">⏱ {totalTime}</span>}
      <PriBars pri={task.priority || task.pri}/>
    </div>
  );
}

function StackCard({ task, idx, isNow, isDeck, isLater, completing, allTasks, theme, isFirst, isLast,
                    expanded, onToggleExpand, onOpen, onComplete, onSendToTop, onSendToBottom, onSubToggle,
                    isDragging, dropPos, onDragStart, onDragOver, onDragEnd, onDrop,
                    focused, renaming, onFocus, onContextMenu, onRename, onStartRename, onRenameDone }) {
  const [draft, setDraft] = useState(task.title || '');
  const inputRef = useRef(null);
  useEffect(()=>{ setDraft(task.title || ''); }, [task.id, task.title]);
  useEffect(()=>{
    if (renaming) requestAnimationFrame(()=>{ inputRef.current?.focus(); inputRef.current?.select(); });
  }, [renaming]);
  const finishRename = (save=true) => {
    if (save && draft.trim() && draft.trim() !== task.title) onRename?.(task.id, { title: draft.trim() });
    else setDraft(task.title || '');
    onRenameDone?.();
  };
  const isProject = task.cardType === 'project';
  const kids = isProject ? (allTasks || []).filter(c => c.parentId === task.id) : [];
  const openSubs = kids.filter(c => !c.done);
  const doneSubs = kids.filter(c => c.done);
  const projectPct = kids.length ? Math.round((doneSubs.length / kids.length) * 100) : 0;

  const klass = [
    'scard',
    isNow && 'is-now',
    isDeck && 'is-deck',
    isLater && 'is-later',
    isProject && 'is-project',
    completing && 'completing',
    isDragging && 'is-dragging',
    dropPos === 'before' && 'drop-before',
    dropPos === 'after' && 'drop-after',
    focused && 'focused',
    renaming && 'renaming',
  ].filter(Boolean).join(' ');

  const handleCardClick = (e) => {
    if (renaming) return;
    if (e.target.closest('button')) return;
    if (e.target.closest('input')) return;
    if (e.target.closest('.scard-subs')) return;
    if (e.target.closest('.scard-sub-chk')) return;
    onOpen?.(task.id);
  };

  return (
    <div className={klass}
         data-card-id={task.id}
         draggable={!renaming}
         onDragStart={(e)=>onDragStart?.(e, task.id)}
         onDragOver={(e)=>onDragOver?.(e, task.id)}
         onDrop={(e)=>onDrop?.(e, task.id)}
         onDragEnd={onDragEnd}
         onClick={handleCardClick}
         onMouseEnter={()=>!renaming && onFocus?.(task.id)}
         onMouseLeave={()=>!renaming && onFocus?.(null)}
         onContextMenu={(e)=>{ if (onContextMenu) { e.preventDefault(); e.stopPropagation(); onContextMenu(task, e.clientX, e.clientY); } }}>
      <div className="scard-idx">{idx+1}</div>

      <div className="scard-actions" onClick={e=>e.stopPropagation()}>
        {isNow && (
          <button className="scard-act-btn scard-act-done" title="Mark done (Enter)"
                  onClick={()=>onComplete?.(task.id)}>
            ✓ Done
          </button>
        )}
        <button className="scard-act-btn scard-act-icon" title="Send to top"
                disabled={isFirst}
                onClick={()=>onSendToTop?.(task.id)} aria-label="Send to top">
          <I.ArrUp/>
        </button>
        <button className="scard-act-btn scard-act-icon" title="Send to bottom"
                disabled={isLast}
                onClick={()=>onSendToBottom?.(task.id)} aria-label="Send to bottom">
          <I.ArrDown/>
        </button>
      </div>

      <div className="scard-r1">
        <button className="scard-chk" title="Mark complete"
                onClick={(e)=>{e.stopPropagation(); onComplete?.(task.id);}}/>
        {renaming ? (
          <input ref={inputRef} className="scard-title-input" value={draft}
                 onClick={e=>e.stopPropagation()}
                 onChange={e=>setDraft(e.target.value)}
                 onBlur={()=>finishRename(true)}
                 onKeyDown={e=>{
                   e.stopPropagation();
                   if (e.key === 'Enter') { e.preventDefault(); finishRename(true); }
                   if (e.key === 'Escape') { e.preventDefault(); finishRename(false); }
                 }}/>
        ) : (
          <div className="scard-title"
               onDoubleClick={(e)=>{ e.stopPropagation(); onStartRename?.(task.id); }}>
            {task.title}
            {isNow && <span className="scard-now-tag">Now</span>}
          </div>
        )}
      </div>

      <ChipRow task={task} isProject={isProject} allTasks={allTasks} theme={theme}/>

      {isProject && (
        <div className="scard-proj-prog">
          <div className="bar"><div className="bar-fill" style={{width:projectPct+'%'}}/></div>
          <span className="num">{doneSubs.length}/{kids.length}</span>
          <button className={`scard-toggle${expanded?' open':''}`}
                  onClick={(e)=>{e.stopPropagation(); onToggleExpand(task.id);}}>
            <span className="chev">▸</span>
            {expanded ? 'Collapse' : `Show ${openSubs.length} open subtask${openSubs.length===1?'':'s'}`}
          </button>
        </div>
      )}

      {isProject && expanded && (
        <div className="scard-subs" onClick={e=>e.stopPropagation()}>
          {[...openSubs, ...doneSubs].map(c => (
            <div key={c.id} className="scard-sub" onClick={()=>onOpen?.(c.id)}>
              <div className={`scard-sub-chk${c.done?' done':''}`}
                   onClick={(e)=>{e.stopPropagation(); onSubToggle?.(c);}}/>
              <div className={`scard-sub-title${c.done?' done':''}`}>{c.title}</div>
              {c.date && <span className="scard-sub-meta">{c.date}</span>}
              {c.timeEstimate && <span className="scard-sub-meta">{c.timeEstimate}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DoneTodayFooter({ items, onRestore }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="stack-done-footer">
      <button className={`stack-done-pill${open?' open':''}`} onClick={()=>setOpen(o=>!o)}>
        ✓ {items.length} done today <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="stack-done-list">
          {items.map(t => (
            <div key={t.id} className="scard completed">
              <div className="scard-r1">
                <button className="scard-chk done" title="Restore"
                        onClick={()=>onRestore?.(t.id)}>
                  <span className="chk-dot"/>
                </button>
                <div className="scard-title">{t.title}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StackView({ tasks, allTasks, tweaks, setTweak, onUpdate, onComplete, onOpen, theme,
                             focusedId, setFocusedId, renamingId, setRenamingId, onContextMenu, onAddNew,
                             navCollapsed, onToggleNav }) {
  const sortMode = tweaks.stackSort || 'smart';
  const manualOrder = tweaks.stackOrder || [];
  const compactBelowDeck = tweaks.stackCompactBelowDeck !== false;
  const showCompleted = tweaks.stackShowCompleted !== false;
  const showSpine = tweaks.stackShowSpine !== false;
  const groupByDate = tweaks.stackGroupByDate === true;
  const showDividers = sortMode === 'date' && groupByDate;

  const bucketOf = (t) => {
    const d = effectiveDate(t, allTasks);
    if (!d) return 'No date';
    const r = dateRank(d);
    if (r < 0) return 'Overdue';
    if (r === 0) return 'Today';
    if (r === 1) return 'Tomorrow';
    if (r <= 7) return 'This week';
    return 'Later';
  };

  const sorted = useMemo(
    () => sortStack(tasks, sortMode, allTasks, manualOrder),
    [tasks, allTasks, sortMode, manualOrder]
  );

  const [expanded, setExpanded] = useState(() => {
    const s = new Set();
    const proj = tasks.find(t => t.cardType === 'project');
    if (proj) s.add(proj.id);
    return s;
  });
  const toggleExpand = (id) => setExpanded(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const [completing, setCompleting] = useState(() => new Set());

  const handleComplete = (id) => {
    setCompleting(prev => {
      if (prev.has(id)) return prev;
      const n = new Set(prev); n.add(id); return n;
    });
    setTimeout(() => {
      onComplete?.(id);
      setCompleting(prev => {
        if (!prev.has(id)) return prev;
        const n = new Set(prev); n.delete(id); return n;
      });
    }, COMPLETE_ANIM_MS);
  };

  const handleSendToTop = (id) => {
    const ids = sorted.map(t => t.id);
    const i = ids.indexOf(id);
    if (i <= 0) return;
    const reordered = [id, ...ids.slice(0, i), ...ids.slice(i+1)];
    setTweak('stackOrder', reordered);
    if (sortMode !== 'manual') setTweak('stackSort', 'manual');
  };

  const handleSendToBottom = (id) => {
    const ids = sorted.map(t => t.id);
    const i = ids.indexOf(id);
    if (i < 0 || i === ids.length - 1) return;
    const reordered = [...ids.slice(0, i), ...ids.slice(i+1), id];
    setTweak('stackOrder', reordered);
    if (sortMode !== 'manual') setTweak('stackSort', 'manual');
  };

  const handleSubToggle = (child) => {
    const nowDone = !child.done;
    onUpdate?.(child.id, {
      done: nowDone,
      completedAt: nowDone ? new Date().toISOString() : null,
    });
  };

  const handleRestore = (id) => {
    onUpdate?.(id, { done: false, completedAt: null });
  };

  // ---- Drag reorder ----
  const [drag, setDrag] = useState({ id: null, overId: null, overPos: null });
  const dragRef = useRef({ id: null });
  const stackBodyRef = useRef(null);
  const autoscrollRef = useRef({ rafId: null, dy: 0 });

  const resetDrag = () => {
    dragRef.current.id = null;
    setDrag({ id: null, overId: null, overPos: null });
  };

  const handleDragStart = (e, id) => {
    if (e.target.closest('.scard-subs') || e.target.closest('button') || e.target.closest('.scard-chk')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch {}
    dragRef.current.id = id;
    setDrag(d => ({ ...d, id }));
  };

  const handleDragOver = (e, id) => {
    if (!dragRef.current.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id === dragRef.current.id) {
      if (drag.overId !== null) setDrag(d => ({ ...d, overId: null, overPos: null }));
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientY < rect.top + rect.height/2) ? 'before' : 'after';
    setDrag(prev => (prev.overId === id && prev.overPos === pos) ? prev : { ...prev, overId: id, overPos: pos });
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    const draggedId = dragRef.current.id || (() => { try { return e.dataTransfer.getData('text/plain'); } catch { return null; }})();
    if (!draggedId || draggedId === targetId) { resetDrag(); return; }
    const ids = sorted.map(t => t.id);
    const fromIdx = ids.indexOf(draggedId);
    if (fromIdx < 0) { resetDrag(); return; }
    ids.splice(fromIdx, 1);
    let toIdx = ids.indexOf(targetId);
    if (toIdx < 0) { resetDrag(); return; }
    if (drag.overPos === 'after') toIdx += 1;
    ids.splice(toIdx, 0, draggedId);
    setTweak('stackOrder', ids);
    if (sortMode !== 'manual') setTweak('stackSort', 'manual');
    resetDrag();
  };

  const handleDragEnd = () => resetDrag();

  // Auto-scroll the stack-body when dragging near top/bottom edges.
  useEffect(() => {
    if (!drag.id) return;
    const tick = () => {
      autoscrollRef.current.rafId = requestAnimationFrame(() => {
        const dy = autoscrollRef.current.dy;
        const el = stackBodyRef.current;
        if (dy && el) {
          el.scrollTop += dy;
          autoscrollRef.current.rafId = null;
          if (autoscrollRef.current.dy) tick();
        } else {
          autoscrollRef.current.rafId = null;
        }
      });
    };
    const onMove = (e) => {
      const el = stackBodyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const top = e.clientY - rect.top;
      const bottom = rect.bottom - e.clientY;
      const EDGE = 60;
      let dy = 0;
      if (top < EDGE && top > -20) dy = -Math.max(4, (EDGE - top) / 4);
      else if (bottom < EDGE && bottom > -20) dy = Math.max(4, (EDGE - bottom) / 4);
      autoscrollRef.current.dy = dy;
      if (dy !== 0 && !autoscrollRef.current.rafId) tick();
    };
    window.addEventListener('dragover', onMove);
    return () => {
      window.removeEventListener('dragover', onMove);
      if (autoscrollRef.current.rafId) cancelAnimationFrame(autoscrollRef.current.rafId);
      autoscrollRef.current = { rafId: null, dy: 0 };
    };
  }, [drag.id]);

  // Refs let our window keydown closure see latest sorted/handlers without rebinding every render.
  const handlersRef = useRef();
  handlersRef.current = { sorted, handleComplete };

  useEffect(() => {
    const fn = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { sorted, handleComplete } = handlersRef.current;
      const top = sorted[0];
      if (!top) return;
      if (e.key === 'Enter') { e.preventDefault(); handleComplete(top.id); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const totalOpen = sorted.length;
  const totalMinutes = useMemo(() => sorted.reduce((s, t) => {
    if (t.cardType === 'project') {
      const kids = (allTasks || []).filter(c => c.parentId === t.id && !c.done);
      return s + kids.reduce((ss, c) => ss + parseTimeEst(c.timeEstimate), 0);
    }
    return s + parseTimeEst(t.timeEstimate);
  }, 0), [sorted, allTasks]);

  const localToday = localDayStr();
  const doneTodayList = useMemo(
    () => (allTasks || []).filter(t => t.done && !t.parentId && t.completedAt && localDayStr(t.completedAt) === localToday),
    [allTasks, localToday]
  );
  const doneToday = doneTodayList.length;

  return (
    <div className="stack-shell">
      <div className="stack-toolbar">
        {onToggleNav && (
          <button className="stack-burger" onClick={onToggleNav}
                  aria-label={navCollapsed ? 'Open menu' : 'Close menu'}
                  title="Menu">
            <span/><span/><span/>
          </button>
        )}
        <div className="stack-h1">
          <span className="stack-glyph"><i/><i/><i/><i/></span>
          Stack
        </div>
        <span className="stack-sub">Top down. Work the next thing, then the next.</span>

        <div className="stack-stats">
          <div className="stack-stats-prog">
            <div className="stack-mini-prog">
              <div className="stack-mini-prog-fill" style={{width: (doneToday/Math.max(1,doneToday+totalOpen))*100 + '%'}}/>
            </div>
            <span><b>{doneToday}</b> done · <b>{totalOpen}</b> to go</span>
          </div>
          <div className="stack-stats-time">
            ⏱ <b>{fmtTimeEst(totalMinutes) || '—'}</b> remaining
          </div>
          <div className="seg" role="group" aria-label="Sort">
            <button className={sortMode==='smart' ? 'act' : ''} onClick={()=>setTweak('stackSort','smart')} title="Smart: balance urgency + priority">Smart</button>
            <button className={sortMode==='date' ? 'act' : ''} onClick={()=>setTweak('stackSort','date')} title="By due date">Date</button>
            <button className={sortMode==='priority' ? 'act' : ''} onClick={()=>setTweak('stackSort','priority')} title="By priority">Priority</button>
            <button className={sortMode==='manual' ? 'act' : ''} onClick={()=>setTweak('stackSort','manual')} title="Manual order">Manual</button>
          </div>
        </div>
      </div>

      <div className={`stack-body${drag.id ? ' is-dragging' : ''}`} ref={stackBodyRef}>
        <div className={`stack-inner${showSpine ? '' : ' no-spine'}`}>
          {onAddNew && (
            <button className="stack-add-top"
                    onClick={(e)=>{ e.stopPropagation(); onAddNew(); }}
                    title="Add new task at top">
              <I.Plus/> New task
            </button>
          )}
          {sorted.length === 0 && (
            <div className="empty">
              <div className="big"><I.Stack/></div>
              <h3>Stack cleared</h3>
              <p>Nothing left to do. Take a break, or capture the next thing.</p>
            </div>
          )}

          {(() => {
            let lastBucket = null;
            return sorted.map((t, idx) => {
              const isNow = idx === 0;
              const isDeck = idx >= 1 && idx <= 2;
              const isLater = idx >= 3 && compactBelowDeck;
              const bucket = showDividers ? bucketOf(t) : null;
              const dividerNeeded = bucket && bucket !== lastBucket;
              if (bucket) lastBucket = bucket;
              return (
                <React.Fragment key={t.id}>
                  {dividerNeeded && (
                    <div className="stack-divider">
                      <span className="label">{bucket}</span>
                      <span className="rule"/>
                    </div>
                  )}
                  <StackCard
                    task={t}
                    idx={idx}
                    isNow={isNow}
                    isDeck={isDeck}
                    isLater={isLater}
                    isFirst={idx === 0}
                    isLast={idx === sorted.length - 1}
                    completing={completing.has(t.id)}
                    allTasks={allTasks}
                    theme={theme}
                    expanded={expanded.has(t.id)}
                    onToggleExpand={toggleExpand}
                    onOpen={onOpen}
                    onComplete={handleComplete}
                    onSendToTop={handleSendToTop}
                    onSendToBottom={handleSendToBottom}
                    onSubToggle={handleSubToggle}
                    isDragging={drag.id === t.id}
                    dropPos={drag.overId === t.id ? drag.overPos : null}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    focused={focusedId === t.id}
                    renaming={renamingId === t.id}
                    onFocus={setFocusedId}
                    onContextMenu={onContextMenu}
                    onRename={onUpdate}
                    onStartRename={setRenamingId}
                    onRenameDone={()=>setRenamingId?.(null)}
                  />
                </React.Fragment>
              );
            });
          })()}

          {showCompleted && (
            <DoneTodayFooter items={doneTodayList} onRestore={handleRestore}/>
          )}
        </div>
      </div>
    </div>
  );
}
