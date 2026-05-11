import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../utils/icons.jsx';
import { D, parseTimeEst, fmtTimeEst, PROJ, TAG_NAMES, TAG_DARK, TAG_LIGHT, LIFE_AREA_NAMES } from '../data.js';
import { lifeAreaPalette } from '../utils/colors.js';
import { cardColorVars } from '../utils/cardColor.js';
import { PriBars } from './PriBars.jsx';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTapSpring } from '../hooks/useTapSpring.js';
import { SPRING } from '../hooks/springs.js';
import { useMagnet } from '../hooks/useMagnet.js';
import { CheckGlyph } from './CheckGlyph.jsx';

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

// `isDue` lets the caller render "Due today" only when the chip really
// reflects a due date, vs. "Today" / "In 3 days" when it's just a start date.
const dueLabel = (date, today=todayStr(), isDue=true) => {
  if (!date) return null;
  if (date < today) {
    const days = -dateRank(date, today);
    return { kind:'overdue', label: days===1 ? '1 day overdue' : `${days} days overdue` };
  }
  if (date === today) return { kind:'today', label: isDue ? 'Due today' : 'Today' };
  const r = dateRank(date, today);
  const prefix = isDue ? 'Due ' : '';
  const startsPrefix = isDue ? '' : 'Starts ';
  if (r === 1) return { kind:'soon', label: isDue ? 'Due tomorrow' : 'Starts tomorrow' };
  if (r <= 7) return { kind:'soon', label: `${prefix}in ${r} days` };
  const d = D.parse(date);
  const dateStr = d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  return { kind:'later', label: isDue ? `Due ${dateStr}` : `Starts ${dateStr}` };
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

// Returns { date, isDue } so the chip can label real deadlines as "Due today"
// and start-date-only tasks as plain "Today".
const effectiveDueDate = (t, allTasks) => {
  if (t.cardType === 'project') {
    const kids = (allTasks || [])
      .filter(c => c.parentId === t.id && !c.done && (c.dueDate || c.date))
      .map(c => ({ date: c.dueDate || c.date, isDue: !!c.dueDate }))
      .filter(x => x.date)
      .sort((a,b)=>a.date.localeCompare(b.date));
    if (kids.length) return kids[0];
  }
  if (t.dueDate) return { date: t.dueDate, isDue: true };
  if (t.date) return { date: t.date, isDue: false };
  return { date: null, isDue: false };
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
  const eff = effectiveDueDate(task, allTasks);
  const due = dueLabel(eff.date, undefined, eff.isDue);
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
      {/* Start chip — render when the task has a real start date AND we're not
          already showing it as the due chip below. */}
      {!isProject && task.date && (() => {
        const startD = dueLabel(task.date, undefined, false);
        if (!startD) return null;
        return <span className="schip"><I.Cal/>{startD.label}</span>;
      })()}
      {/* Due chip — red, no calendar, says "Due …". */}
      {!isProject && task.dueDate && (() => {
        const dueD = dueLabel(task.dueDate, undefined, true);
        if (!dueD) return null;
        const cls = dueD.kind === 'overdue' ? 'schip schip-due-overdue' : 'schip schip-due-overdue';
        const prefix = dueD.kind === 'overdue' ? '⚠ ' : '';
        return <span className={cls}>{prefix}{dueD.label}</span>;
      })()}
      {/* Project rollup falls back to the legacy single-chip behaviour. */}
      {isProject && due && due.kind === 'overdue' && <span className="schip schip-due-overdue">⚠ {due.label}</span>}
      {isProject && due && due.kind === 'today' && (
        eff.isDue
          ? <span className="schip schip-due-overdue">{due.label}</span>
          : <span className="schip"><I.Cal/>{due.label}</span>
      )}
      {isProject && due && (due.kind === 'soon' || due.kind === 'later') && (
        eff.isDue
          ? <span className="schip schip-due-overdue">{due.label}</span>
          : <span className="schip"><I.Cal/>{due.label}</span>
      )}
      {!isProject && !task.date && !task.dueDate && <span className="schip schip-empty"><I.Cal/>No start date</span>}
      {isProject && !due && <span className="schip schip-empty"><I.Cal/>No start date</span>}

      {proj && <span className="schip schip-proj" style={{color:proj.color, borderColor:proj.color+'55'}}>{proj.id}</span>}

      {lifeMeta && (
        <span className="schip schip-life" style={{background:lifeMeta.bg, color:lifeMeta.fg, borderColor:lifeMeta.fg+'40'}}>
          {LIFE_AREA_NAMES[life] || life}
        </span>
      )}

      {tags.filter(tg => tagPalette[tg]).slice(0,2).map(tg => {
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

function StackCard({ task, idx, showIdx=true, isNow, isDeck, isLater, completing, allTasks, theme, tweaks, isFirst, isLast,
                    expanded, onToggleExpand, onOpen, onComplete, onSendToTop, onSendToBottom, onSubToggle,
                    sortableIds,
                    focused, renaming, onFocus, onContextMenu, onRename, onStartRename, onRenameDone,
                    selected, onSelect }) {
  const doneTap = useTapSpring({ pressedScale: 0.9, releaseKick: 3.0, spring: SPRING.bounce });
  const upTap = useTapSpring();
  const downTap = useTapSpring();
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: task.id,
    data: { kind: 'stack-task', sortableIds },
    disabled: renaming,
  });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
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
    focused && 'focused',
    renaming && 'renaming',
    selected && 'selected',
  ].filter(Boolean).join(' ');

  const isCardSurface = (e) => {
    if (renaming) return false;
    if (e.target.closest('button')) return false;
    if (e.target.closest('input')) return false;
    if (e.target.closest('.scard-subs')) return false;
    if (e.target.closest('.scard-sub-chk')) return false;
    return true;
  };
  const handleCardClick = (e) => {
    if (!isCardSurface(e)) return;
    if (e.shiftKey && onSelect) { e.preventDefault(); onSelect(task.id); return; }
    onFocus?.(task.id);
  };
  const handleCardDoubleClick = (e) => { if (isCardSurface(e)) onOpen?.(task.id); };

  return (
    <div className={klass}
         ref={setNodeRef}
         style={{...dragStyle, ...cardColorVars(task.cardColor, tweaks, theme)}}
         data-card-id={task.id}
         data-task-id={task.id}
         {...attributes}
         {...listeners}
         onClick={handleCardClick}
         onDoubleClick={handleCardDoubleClick}
         onMouseEnter={()=>!renaming && onFocus?.(task.id)}
         onContextMenu={(e)=>{ if (onContextMenu) { e.preventDefault(); e.stopPropagation(); onContextMenu(task, e.clientX, e.clientY); } }}>
      <div className="scard-idx">{showIdx ? (idx+1) : ''}</div>

      <div className="scard-actions" onClick={e=>e.stopPropagation()}>
        {isNow && (
          <button className="scard-act-btn scard-act-done no-press" title="Mark done (Enter)"
                  {...doneTap.props}
                  style={{ transform: `scale(${doneTap.scale})` }}
                  onClick={()=>onComplete?.(task.id)}>
            ✓ Done
          </button>
        )}
        <button className="scard-act-btn scard-act-icon no-press" title="Send to top"
                disabled={isFirst}
                {...upTap.props}
                style={{ transform: `scale(${upTap.scale})` }}
                onClick={()=>onSendToTop?.(task.id)} aria-label="Send to top">
          <I.ArrUp/>
        </button>
        <button className="scard-act-btn scard-act-icon no-press" title="Send to bottom"
                disabled={isLast}
                {...downTap.props}
                style={{ transform: `scale(${downTap.scale})` }}
                onClick={()=>onSendToBottom?.(task.id)} aria-label="Send to bottom">
          <I.ArrDown/>
        </button>
      </div>

      <div className="scard-r1">
        {/* Now card has the prominent "✓ Done" button in .scard-actions; the
            checkbox here would be a third complete affordance for the same task
            (button + checkbox + Enter). Hide it on Now to keep the gesture
            unambiguous; cards 2+ still show the checkbox. */}
        {!isNow && (
          <button className="scard-chk cg-host no-press" title="Mark complete"
                  onClick={(e)=>{e.stopPropagation(); onComplete?.(task.id);}}>
            <CheckGlyph done={!!task.done} size={16}/>
          </button>
        )}
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
          <div className="scard-title">
            <span className="scard-title-text"
                  onDoubleClick={(e)=>{ e.stopPropagation(); onStartRename?.(task.id); }}>
              {task.title}
            </span>
            {isNow && <span className="scard-now-tag">Now</span>}
          </div>
        )}
      </div>

      <ChipRow task={task} isProject={isProject} allTasks={allTasks} theme={theme}/>

      {isProject && kids.length > 0 && (
        <div className="scard-proj-prog">
          <div className="bar"><div className="bar-fill" style={{width:projectPct+'%'}}/></div>
          <span className="num">{doneSubs.length}/{kids.length}</span>
          <button className={`scard-toggle${expanded?' open':''}`}
                  onClick={(e)=>{e.stopPropagation(); onToggleExpand(task.id);}}>
            <span className="chev">▸</span>
            {expanded
              ? 'Collapse'
              : openSubs.length === 0
                ? `All done · ${doneSubs.length} subtask${doneSubs.length===1?'':'s'}`
                : `Show ${openSubs.length} open subtask${openSubs.length===1?'':'s'}`}
          </button>
        </div>
      )}

      {isProject && expanded && (
        <div className="scard-subs" onClick={e=>e.stopPropagation()}>
          {[...openSubs, ...doneSubs].map(c => (
            <div key={c.id} className="scard-sub" onClick={()=>onOpen?.(c.id)}>
              <span className={`scard-sub-chk cg-host${c.done?' done':''}`}
                   onClick={(e)=>{e.stopPropagation(); onSubToggle?.(c);}}
                   style={{display:'inline-flex',cursor:'pointer'}}>
                <CheckGlyph done={!!c.done} size={14}/>
              </span>
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
                             navCollapsed, onToggleNav,
                             selectedIds, onSelect, onMarqueeStart,
                             renamingGroupId, onStartGroupRename, onGroupRenameDone, onRenameGroup }) {
  const addTap = useTapSpring();
  const [addBtnRef, addMagnet] = useMagnet({ range: 110, pull: 0.35 });
  const sortMode = tweaks.stackSort || 'smart';
  // Stack-view-specific manual order, persisted via tweaks → user_settings.
  // Intentionally separate from `task.position` (which drives week/day/inbox
  // ordering): stack view is a per-user lens, not the canonical task slot.
  const manualOrder = tweaks.stackOrder || [];
  const compactBelowDeck = tweaks.stackCompactBelowDeck !== false;
  const showCompleted = tweaks.stackShowCompleted !== false;
  const showSpine = tweaks.stackShowSpine !== false;
  const groupByDate = tweaks.stackGroupByDate === true;
  const showDividers = sortMode === 'date' && groupByDate;

  const bucketOf = (t) => {
    const d = effectiveDate(t, allTasks);
    if (!d) return 'No start date';
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
  // dnd-kit drives reorder via SortableContext below; the actual mutation
  // (setTweak('stackOrder', ids) + group reconcile) happens in App.jsx's
  // dndOnDragEnd. Source-becomes-placeholder, FLIP-style slide, touch
  // long-press, keyboard nav, and auto-scroll all come from the lib.
  const stackBodyRef = useRef(null);

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
            <button className={sortMode==='date' ? 'act' : ''} onClick={()=>setTweak('stackSort','date')} title="By start date">Start</button>
            <button className={sortMode==='priority' ? 'act' : ''} onClick={()=>setTweak('stackSort','priority')} title="By priority">Priority</button>
            <button className={sortMode==='manual' ? 'act' : ''} onClick={()=>setTweak('stackSort','manual')} title="Manual order">Manual</button>
          </div>
        </div>
      </div>

      <div className="stack-body" ref={stackBodyRef}
           onMouseDown={(e)=>{
             if (e.button !== 0 || !e.shiftKey) return;
             if (e.target.closest('.scard,.scard-actions,.scard-subs,button,input,.stack-divider')) return;
             onMarqueeStart?.(e, stackBodyRef.current);
           }}>
        <div className={`stack-inner${showSpine ? '' : ' no-spine'}`}>
          {onAddNew && (
            <div className="stack-add-magnet-zone"
                 onPointerMove={addMagnet.onPointerMove}
                 onPointerLeave={addMagnet.onPointerLeave}>
              <button className="stack-add-top no-press"
                      ref={addBtnRef}
                      {...addTap.props}
                      style={{ transform: `${addMagnet.transform} scale(${addTap.scale})` }}
                      onClick={(e)=>{ e.stopPropagation(); onAddNew(); }}
                      title="Add new task at top">
                <I.Plus/> New task
              </button>
            </div>
          )}
          {sorted.length === 0 && (
            <div className="empty">
              <div className="big"><I.Stack/></div>
              <h3>Stack cleared</h3>
              <p>Nothing left to do. Take a break, or capture the next thing.</p>
            </div>
          )}

          {(() => {
            // Build "slots" honoring sort order: each ungrouped task is a slot of 1,
            // each custom group is a single slot placed at its first member's sort
            // position. Members of the same group share the slot's tier (now/deck/later)
            // and number — so a group acts as one entity in the stack ordering.
            //
            // dnd-kit's SortableContext takes a flat list of task ids. Visual
            // reordering during a drag is done by the lib via CSS transforms;
            // we don't recompute the slot list from a "displaySorted" array.
            const customGroups = tweaks?.customGroups || [];
            const validGids = new Set(customGroups.map(g => g.id));
            const groupBuckets = new Map();
            for (const t of sorted) {
              if (t.groupId && validGids.has(t.groupId)) {
                if (!groupBuckets.has(t.groupId)) groupBuckets.set(t.groupId, []);
                groupBuckets.get(t.groupId).push(t);
              }
            }
            const slots = [];
            const seenGroups = new Set();
            for (const t of sorted) {
              if (t.groupId && validGids.has(t.groupId)) {
                if (seenGroups.has(t.groupId)) continue;
                seenGroups.add(t.groupId);
                const g = customGroups.find(x => x.id === t.groupId);
                slots.push({ kind: 'group', tasks: groupBuckets.get(t.groupId), group: g });
              } else {
                slots.push({ kind: 'task', task: t });
              }
            }
            const sortableIds = sorted.map(t => t.id);
            let lastBucket = null;

            const renderCard = (t, slotIdx, isFirstInSlot, slotsLen) => {
              const isNow = slotIdx === 0;
              const isDeck = slotIdx >= 1 && slotIdx <= 2;
              const isLater = slotIdx >= 3 && compactBelowDeck;
              return (
                <StackCard
                  key={t.id}
                  task={t}
                  idx={slotIdx}
                  showIdx={isFirstInSlot}
                  isNow={isNow}
                  isDeck={isDeck}
                  isLater={isLater}
                  isFirst={slotIdx === 0}
                  isLast={slotIdx === slotsLen - 1}
                  completing={completing.has(t.id)}
                  allTasks={allTasks}
                  theme={theme}
                  tweaks={tweaks}
                  expanded={expanded.has(t.id)}
                  onToggleExpand={toggleExpand}
                  onOpen={onOpen}
                  onComplete={handleComplete}
                  onSendToTop={handleSendToTop}
                  onSendToBottom={handleSendToBottom}
                  onSubToggle={handleSubToggle}
                  sortableIds={sortableIds}
                  focused={focusedId === t.id}
                  renaming={renamingId === t.id}
                  onFocus={setFocusedId}
                  onContextMenu={onContextMenu}
                  onRename={onUpdate}
                  onStartRename={setRenamingId}
                  onRenameDone={()=>setRenamingId?.(null)}
                  selected={selectedIds?.has(t.id)}
                  onSelect={onSelect}
                />
              );
            };

            return (
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                {slots.map((slot, slotIdx) => {
                  const lead = slot.kind === 'group' ? slot.tasks[0] : slot.task;
                  const bucket = showDividers ? bucketOf(lead) : null;
                  const dividerNeeded = bucket && bucket !== lastBucket;
                  if (bucket) lastBucket = bucket;
                  const divider = dividerNeeded && (
                    <div className="stack-divider">
                      <span className="label">{bucket}</span>
                      <span className="rule"/>
                    </div>
                  );
                  if (slot.kind === 'task') {
                    return (
                      <React.Fragment key={lead.id}>
                        {divider}
                        {renderCard(lead, slotIdx, true, slots.length)}
                      </React.Fragment>
                    );
                  }
                  const grp = slot.group;
                  const tierClass = slotIdx === 0 ? ' is-now' : (slotIdx <= 2 ? ' is-deck' : (compactBelowDeck ? ' is-later' : ''));
                  const firstCard = slot.tasks[0];
                  const lastCard = slot.tasks[slot.tasks.length - 1];
                  return (
                    <React.Fragment key={`__cg__${grp.id}`}>
                      {divider}
                      <div className={`grp-box stack-grp-box${tierClass}`}
                           data-grp-first-id={firstCard.id}
                           data-grp-last-id={lastCard.id}>
                        <div className="grp-hdr grp-hdr-custom">
                          {grp.id === renamingGroupId ? (
                            <input className="grp-name-edit" autoFocus defaultValue={grp.name}
                              onClick={e=>e.stopPropagation()}
                              onBlur={e=>{ onRenameGroup?.(grp.id, e.target.value); onGroupRenameDone?.(); }}
                              onKeyDown={e=>{ if(e.key==='Enter') e.target.blur(); if(e.key==='Escape'){ e.target.value=grp.name; onGroupRenameDone?.(); } }}/>
                          ) : (
                            <span className="grp-name" style={{color: grp.color}}
                                  onDoubleClick={e=>{ e.stopPropagation(); onStartGroupRename?.(grp.id); }}
                                  title="Double-click to rename">{grp.name}</span>
                          )}
                          <span className="grp-cnt">{slot.tasks.length}</span>
                          <button className="grp-add-btn"
                                  title="Add task to this group"
                                  onClick={e=>{ e.stopPropagation(); onAddNew?.({groupId: grp.id}); }}>+</button>
                        </div>
                        {slot.tasks.map((t, i) => renderCard(t, slotIdx, i === 0, slots.length))}
                      </div>
                    </React.Fragment>
                  );
                })}
              </SortableContext>
            );
          })()}

          {showCompleted && (
            <DoneTodayFooter items={doneTodayList} onRestore={handleRestore}/>
          )}
        </div>
      </div>
    </div>
  );
}
