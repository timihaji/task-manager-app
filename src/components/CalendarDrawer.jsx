// Day calendar drawer — Sunsama-style time-blocking surface. Ported from
// the standalone prototype with minimal changes:
//   * ESM imports instead of window.* globals.
//   * task duration is read from task.timeEstimate via parseTimeEst, not
//     from a numeric estMin field.
//   * NOW line follows real time and is only rendered when the visible
//     date is today.
//   * The drawer is positioned fixed (not flex-inline) so it can slide
//     over the active view; styling for that lives in styles.css.
// Physics, hand-rolled DnD, snap pulse, settle, rubberband — unchanged.

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  SNAP, DAY_MIN, MIN_PXH, MAX_PXH, WORK_START, WORK_END,
  clamp, snap as snapMinutes, massFor, rubber,
  minToLabel, minToCompact, fmtDur, currentMinOfDay,
} from '../utils/timeOfDay.js';
import { parseTimeEst, D } from '../data.js';
import { I } from '../utils/icons.jsx';
import { ContextMenu } from './ContextMenu.jsx';

const Chev = ({ dir = 'left' }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
       style={{ transform: dir === 'right' ? 'rotate(180deg)' : 'none' }}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

// Preset swatch palette for the per-event colour picker (matches bucket colour choices).
const CAL_EVENT_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
  '#78716c','#6b7280',
];

function CalEventColorPicker({ x, y, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 200);
  const top  = Math.min(y, window.innerHeight - 64);
  return (
    <div ref={ref} className="cal-color-picker" style={{ left, top }}>
      {CAL_EVENT_COLORS.map(c => (
        <button
          key={c}
          className="cal-color-swatch"
          style={{ background: c }}
          title={c}
          onClick={() => { onPick(c); onClose(); }}
        />
      ))}
    </div>
  );
}

// When a manual (user-placed) event lands on top of auto-planned events,
// shift the auto events past the manual event's end so the user's intent
// takes precedence. Single left-to-right pass — if a displaced auto event
// now collides with the next auto event, that one is pushed too (cascade).
function displaceAutoEvents(allEvents, manualEv) {
  const manualStart = manualEv.startMin;
  const manualEnd   = manualEv.startMin + manualEv.durationMin;
  // Auto events sorted by their *current* startMin.
  const autoSorted = allEvents
    .filter(e => e.id !== manualEv.id && e.source === 'auto')
    .sort((a, b) => a.startMin - b.startMin);
  let pushCursor = null; // end of the most recently displaced event, or null
  const moved = new Map();
  for (const ev of autoSorted) {
    const evEnd = ev.startMin + ev.durationMin;
    let needsPush = false;
    let target = 0;
    if (pushCursor !== null && ev.startMin < pushCursor) {
      // Collides with a previously displaced auto event → cascade.
      needsPush = true;
      target = pushCursor;
    } else if (ev.startMin < manualEnd && evEnd > manualStart) {
      // Direct overlap with manual event.
      needsPush = true;
      target = manualEnd;
    } else {
      // No conflict — clear cursor once we're definitively past the displaced region.
      if (pushCursor !== null && ev.startMin >= pushCursor) pushCursor = null;
    }
    if (needsPush) {
      const newStart = Math.min(target, DAY_MIN - ev.durationMin);
      moved.set(ev.id, { ...ev, startMin: newStart });
      pushCursor = newStart + ev.durationMin;
    }
  }
  return allEvents.map(e => moved.get(e.id) || e);
}

// Compute side-by-side columns for overlapping events. Map<eventId, {col, cols}>.
function layoutOverlaps(events) {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.durationMin - b.durationMin);
  const out = new Map();
  const clusters = [];
  for (const ev of sorted) {
    let placed = false;
    for (const c of clusters) {
      if (c.some(e => !(ev.startMin >= e.startMin + e.durationMin || ev.startMin + ev.durationMin <= e.startMin))) {
        c.push(ev); placed = true; break;
      }
    }
    if (!placed) clusters.push([ev]);
  }
  for (const cluster of clusters) {
    const cols = [];
    for (const ev of cluster) {
      let ci = cols.findIndex(col => col.every(e => e.startMin + e.durationMin <= ev.startMin));
      if (ci === -1) { cols.push([ev]); ci = cols.length - 1; }
      else cols[ci].push(ev);
      out.set(ev.id, { col: ci, cols: 0 });
    }
    for (const ev of cluster) out.get(ev.id).cols = cols.length;
  }
  return out;
}

function EventBlock({
  ev, task, color, pxh, layout, selected, dimmed, small,
  dragView, settle,
  isUnscheduling,
  isRenaming,
  chunkInfo,
  isAuto,
  onStartDrag, onSelect, onRename, onContextMenu,
}) {
  // +1 top / -2 height gives a 1px visual gap above and below each block
  // without touching the drag math (which uses ev.startMin / ev.durationMin directly).
  const declTop    = (ev.startMin / 60) * pxh + 1;
  const declHeight = Math.max(14, (ev.durationMin / 60) * pxh - 2);

  const top    = dragView ? dragView.topPx    : declTop;
  const height = dragView ? dragView.heightPx : declHeight;

  const mass = (dragView?.mass) ?? (settle?.mass) ?? massFor(ev.durationMin);

  const { col = 0, cols = 1 } = layout || {};
  const widthPct = 100 / cols;
  const leftPct = col * widthPct;

  const liftScale = 1.04 - clamp(mass, 0.6, 2.6) * 0.012;
  const liftTilt  = -0.5 + (1.6 - clamp(mass, 0.6, 2.6)) * 0.15;

  const tinyHeight = height < 36;
  const canRename = !ev.taskId;

  const [editTitle, setEditTitle] = useState(null);
  const inputRef = useRef(null);
  const blockRef = useRef(null);

  useEffect(() => {
    if (isRenaming && editTitle === null) setEditTitle(ev.title || '');
  }, [isRenaming]);

  useEffect(() => {
    if (editTitle !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editTitle !== null]);

  // Native contextmenu listener — more reliable than React's onContextMenu
  // when an extension, parent capture-phase listener, or React-event-delegation
  // quirk intercepts the synthetic event before it reaches the handler.
  useEffect(() => {
    const el = blockRef.current;
    if (!el || !onContextMenu) return;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(ev, task, e.clientX, e.clientY);
    };
    el.addEventListener('contextmenu', handler);
    return () => el.removeEventListener('contextmenu', handler);
  }, [onContextMenu, ev, task]);

  const commitRename = () => {
    const val = editTitle?.trim();
    onRename && onRename(ev.id, val || 'Time block');
    setEditTitle(null);
  };

  const baseTitle = task?.title || ev.title || 'Time block';
  const displayTitle = chunkInfo ? `${baseTitle} (${chunkInfo.idx}/${chunkInfo.total})` : baseTitle;

  return (
    <div
      key={settle?.key}
      ref={blockRef}
      className={
        'cal-event' +
        (dragView ? ' is-grabbing' : '') +
        (settle ? ' is-settling' : '') +
        (isUnscheduling ? ' is-unscheduling' : '') +
        (selected ? ' is-selected' : '') +
        (dimmed ? ' is-dimmed' : '') +
        (isAuto ? ' is-auto' : '') +
        (tinyHeight ? ' is-small' : '') +
        (editTitle !== null ? ' is-renaming' : '')
      }
      style={{
        top, height,
        left: `calc(6px + ${leftPct}% * (1 - 14px / 100%))`,
        width: `calc(${widthPct}% - 8px - ${cols > 1 ? 2 : 0}px)`,
        '--ev-color': color,
        '--mass': mass.toFixed(3),
        '--lift-scale': liftScale.toFixed(3),
        '--lift-tilt':  liftTilt.toFixed(2) + 'deg',
      }}
      onMouseDown={(e) => { if (editTitle !== null) return; onStartDrag(e, 'move', ev); }}
      onClick={(e) => { e.stopPropagation(); onSelect && onSelect(ev.id); }}
    >
      <div className="cal-event-stripe" />
      <div
        className="cal-event-resize cal-event-resize-top"
        onMouseDown={(e) => { e.stopPropagation(); onStartDrag(e, 'resize-top', ev); }}
        title="Drag to change start time"
      />
      <div className="cal-event-body">
        {editTitle !== null ? (
          <input
            ref={inputRef}
            className="cal-event-title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { setEditTitle(null); onRename && onRename(ev.id, null); }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className="cal-event-title"
            onDoubleClick={(e) => {
              if (!canRename) return;
              e.stopPropagation();
              setEditTitle(ev.title || '');
            }}
            title={canRename ? 'Double-click to rename' : undefined}
          >
            {displayTitle}
          </div>
        )}
        {!tinyHeight && editTitle === null && (
          <div className="cal-event-meta">
            <span>{minToCompact(ev.startMin)} – {minToCompact(ev.startMin + ev.durationMin)}</span>
            <span className="dotsep">·</span>
            <span>{fmtDur(ev.durationMin)}</span>
          </div>
        )}
      </div>
      <div
        className="cal-event-resize cal-event-resize-bot"
        onMouseDown={(e) => { e.stopPropagation(); onStartDrag(e, 'resize', ev); }}
        title="Drag to change duration"
      />
    </div>
  );
}

// Stable random-ish event id. Doesn't need to be globally unique — only
// unique within the day (server-side check constraints + workspace+date
// indexing keep collisions impossible across users).
const newEventId = () => 'e' + Math.random().toString(36).slice(2, 8);

export default function CalendarDrawer({
  dateStr,
  events, setEvents,
  tasks,
  projectColor,         // (task) => '#hex' (handles task-less time blocks via task = null)
  pxh, setPxh,
  snapOn, setSnapOn,
  externalDrag,
  onConsumeExternal,
  onCancelExternal,
  onAutoPlan,
  onPrev, onNext, onToday, onClose,
  calendarWidth, onWidthChange,
  pinned, onTogglePin,
  differentiateAutoBlocks,
  hideCompletedOnCalendar,
  routines,           // task[] — routines due today, not yet scheduled
  onRoutineMouseDown, // (e, task) => void — same as onTaskMouseDown in App.jsx
  onOpenTask,         // (taskId) => void — open task in drawer
  onMarkDone,         // (taskId, done) => void — toggle task done
}) {
  const scrollRef = useRef(null);
  const gridRef = useRef(null);
  const drawerRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [pan, setPan] = useState(null); // { anchorScrollTop, anchorClientY }

  // Context menu for calendar events.
  const [calCtxMenu, setCalCtxMenu] = useState(null);
  const [calColorPickerFor, setCalColorPickerFor] = useState(null);

  const onResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = calendarWidth || 460;
    const onMove = (mv) => {
      const newW = Math.max(360, Math.min(900, startW - (mv.clientX - startX)));
      onWidthChange && onWidthChange(newW);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [calendarWidth, onWidthChange]);
  const [hoverMin, setHoverMin] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);

  // Live "now" line — minute resolution is fine.
  const [nowMin, setNowMin] = useState(currentMinOfDay());
  useEffect(() => {
    const id = setInterval(() => setNowMin(currentMinOfDay()), 30_000);
    return () => clearInterval(id);
  }, []);
  const isToday = dateStr === D.str(D.today());

  // Settle map: evId → {mass, kind, key}.
  const [settle, setSettle] = useState({});
  const settleTimers = useRef({});
  const markSettle = useCallback((id, mass, kind = 'move') => {
    const key = (Math.random() * 1e9 | 0).toString(36);
    setSettle(s => ({ ...s, [id]: { mass, kind, key } }));
    clearTimeout(settleTimers.current[id]);
    const dur = 320 + mass * 200;
    settleTimers.current[id] = setTimeout(() => {
      setSettle(s => { const n = { ...s }; delete n[id]; return n; });
    }, dur + 60);
  }, []);
  useEffect(() => () => Object.values(settleTimers.current).forEach(clearTimeout), []);

  // Pulse when crossing a 15m boundary while dragging.
  const [snapPulse, setSnapPulse] = useState(null);
  const lastSnapRef = useRef(null);
  const triggerSnapPulse = (minute) => {
    if (lastSnapRef.current === minute) return;
    lastSnapRef.current = minute;
    setSnapPulse({ minute, key: Math.random() });
    setTimeout(() => setSnapPulse(p => (p && p.minute === minute ? null : p)), 240);
  };

  const yToMin = useCallback((clientY) => {
    const grid = gridRef.current;
    if (!grid) return 0;
    const rect = grid.getBoundingClientRect();
    return ((clientY - rect.top) / pxh) * 60;
  }, [pxh]);

  const cursorOutsideGrid = useCallback((clientX) => {
    const grid = gridRef.current;
    if (!grid) return false;
    const rect = grid.getBoundingClientRect();
    return clientX < rect.left - 16;
  }, []);

  const snapMin = useCallback((m) => snapOn ? snapMinutes(m, SNAP) : Math.round(m), [snapOn]);

  const elasticClampMin = useCallback((rawMin, lo, hi) => {
    const pxhSafe = pxh || 1;
    if (rawMin < lo) {
      const overPx = (lo - rawMin) / 60 * pxhSafe;
      const tapPx = rubber(overPx);
      return lo - (tapPx / pxhSafe) * 60;
    }
    if (rawMin > hi) {
      const overPx = (rawMin - hi) / 60 * pxhSafe;
      const tapPx = rubber(overPx);
      return hi + (tapPx / pxhSafe) * 60;
    }
    return rawMin;
  }, [pxh]);

  const startEventDrag = useCallback((e, kind, ev) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setSelectedId(ev.id);
    lastSnapRef.current = null;
    setDrag({
      kind, evId: ev.id,
      startMin: ev.startMin,
      durationMin: ev.durationMin,
      visStartMin: ev.startMin,
      visDurationMin: ev.durationMin,
      anchor: { y: e.clientY, startMin: ev.startMin, durationMin: ev.durationMin },
      unschedule: false,
    });
  }, []);

  // Grid mousedown starts a pan. Double-click creates a new block (see onGridDoubleClick).
  const onGridMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget) return;
    setSelectedId(null);
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    setPan({ anchorScrollTop: scrollEl.scrollTop, anchorClientY: e.clientY });
  }, []);

  // Double-click on the empty grid creates a 15-min block and opens rename.
  const onGridDoubleClick = useCallback((e) => {
    if (e.target !== e.currentTarget) return;
    const raw = yToMin(e.clientY);
    const startMin = snapMin(clamp(raw, 0, DAY_MIN - SNAP));
    const id = newEventId();
    setEvents(ev => [...ev, {
      id, taskId: null, title: 'Time block', color: '#5eead4',
      date: dateStr,
      startMin, durationMin: SNAP,
    }]);
    setSelectedId(id);
    setRenamingId(id);
    markSettle(id, massFor(SNAP), 'create');
  }, [snapMin, yToMin, dateStr, setEvents, markSettle]);

  // Pan effect — scroll the cal-scroll container while panning.
  useEffect(() => {
    if (!pan) return;
    const onMove = (e) => {
      const dy = e.clientY - pan.anchorClientY;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = pan.anchorScrollTop - dy;
      }
    };
    const onUp = () => setPan(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pan]);

  // External drag (from inbox / routines strip) → live preview block on the grid.
  useEffect(() => {
    if (!externalDrag) return;
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const inside =
      externalDrag.clientX >= rect.left && externalDrag.clientX <= rect.right &&
      externalDrag.clientY >= rect.top  && externalDrag.clientY <= rect.bottom;
    if (!inside) {
      if (drag && drag.kind === 'create' && drag.taskId === externalDrag.taskId) setDrag(null);
      return;
    }
    const task = tasks.find(t => t.id === externalDrag.taskId);
    if (!task) return;
    const dur = parseTimeEst(task.timeEstimate) || 30;
    const raw = yToMin(externalDrag.clientY) - dur / 2;
    const visStartMin = clamp(raw, 0, DAY_MIN - dur);
    const startMin = clamp(snapMin(raw), 0, DAY_MIN - dur);
    triggerSnapPulse(startMin);
    setDrag({
      kind: 'create', taskId: externalDrag.taskId,
      startMin,
      durationMin: dur,
      visStartMin,
      visDurationMin: dur,
      anchor: { y: externalDrag.clientY, startMin },
      external: true,
    });
  }, [externalDrag, tasks, snapMin, yToMin]);

  // Local drag move/resize.
  useEffect(() => {
    if (!drag || drag.external) return;
    const onMove = (e) => {
      const dy = e.clientY - drag.anchor.y;
      const dMin = (dy / pxh) * 60;
      if (drag.kind === 'move') {
        const rawStart = drag.anchor.startMin + dMin;
        const out = cursorOutsideGrid(e.clientX);
        const visStart = elasticClampMin(rawStart, 0, DAY_MIN - drag.durationMin);
        const snappedStart = snapMin(clamp(rawStart, 0, DAY_MIN - drag.durationMin));
        if (snapOn) triggerSnapPulse(snappedStart);
        setDrag(d => d && {
          ...d,
          startMin: snappedStart,
          visStartMin: visStart,
          unschedule: out,
        });
      } else if (drag.kind === 'resize') {
        const rawDur = drag.anchor.durationMin + dMin;
        const maxDur = DAY_MIN - drag.startMin;
        const visDur = elasticClampMin(rawDur, SNAP, maxDur);
        const snappedDur = clamp(snapMin(rawDur), SNAP, maxDur);
        if (snapOn) triggerSnapPulse(drag.startMin + snappedDur);
        setDrag(d => d && { ...d, durationMin: snappedDur, visDurationMin: visDur });
      } else if (drag.kind === 'resize-top') {
        const rawStart = drag.anchor.startMin + dMin;
        const ne = drag.anchor.startMin + drag.anchor.durationMin;
        const visStart = elasticClampMin(rawStart, 0, ne - SNAP);
        const snappedStart = clamp(snapMin(rawStart), 0, ne - SNAP);
        if (snapOn) triggerSnapPulse(snappedStart);
        setDrag(d => d && {
          ...d,
          startMin: snappedStart,
          durationMin: ne - snappedStart,
          visStartMin: visStart,
          visDurationMin: ne - visStart,
        });
      }
    };
    const onUp = () => {
      if (drag.kind === 'move') {
        if (drag.unschedule) {
          setEvents(ev => ev.filter(x => x.id !== drag.evId));
          setSelectedId(null);
        } else {
          // User-drag commits ownership: clear source='auto' so the block
          // renders solid (no longer matches .is-auto). Then displace any
          // auto-planned events that now overlap with the moved block.
          setEvents(ev => {
            const updated = ev.map(x => x.id === drag.evId ? { ...x, startMin: drag.startMin, source: null } : x);
            const movedEv = updated.find(x => x.id === drag.evId);
            return movedEv ? displaceAutoEvents(updated, movedEv) : updated;
          });
          markSettle(drag.evId, massFor(drag.durationMin), 'move');
        }
      } else if (drag.kind === 'resize') {
        setEvents(ev => ev.map(x => x.id === drag.evId ? { ...x, durationMin: drag.durationMin, source: null } : x));
        markSettle(drag.evId, massFor(drag.durationMin), 'resize');
      } else if (drag.kind === 'resize-top') {
        setEvents(ev => ev.map(x => x.id === drag.evId ? { ...x, startMin: drag.startMin, durationMin: drag.durationMin, source: null } : x));
        markSettle(drag.evId, massFor(drag.durationMin), 'resize');
      }
      setDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, pxh, snapMin, yToMin, snapOn, cursorOutsideGrid, elasticClampMin, setEvents, markSettle, dateStr]);

  // External drop commit. When externalDrag transitions from set → null and
  // we still have a preview, materialize an event.
  const lastExternalRef = useRef(null);
  useEffect(() => {
    if (externalDrag) {
      lastExternalRef.current = { ...externalDrag, preview: drag };
    } else if (lastExternalRef.current) {
      const { preview } = lastExternalRef.current;
      lastExternalRef.current = null;
      if (preview && preview.external && preview.taskId) {
        const id = newEventId();
        setEvents(ev => {
          // Re-scheduling the same task on the same day replaces its prior
          // event, mirroring the prototype. Then displace any auto-planned
          // events that overlap with the dropped block.
          const filtered = ev.filter(x => !(x.taskId === preview.taskId && x.date === dateStr));
          const newEv = {
            id, taskId: preview.taskId,
            date: dateStr,
            startMin: preview.startMin, durationMin: preview.durationMin,
          };
          return displaceAutoEvents([...filtered, newEv], newEv);
        });
        setSelectedId(id);
        setDrag(null);
        markSettle(id, massFor(preview.durationMin), 'external');
        onConsumeExternal && onConsumeExternal(preview.taskId);
      } else {
        setDrag(null);
        onCancelExternal && onCancelExternal();
      }
    }
  }, [externalDrag, drag, setEvents, onConsumeExternal, onCancelExternal, markSettle, dateStr]);

  // Keyboard nudge / delete on selection.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'Escape') { setSelectedId(null); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        setEvents(ev => ev.filter(x => x.id !== selectedId));
        setSelectedId(null);
        return;
      }
      const step = e.shiftKey ? 60 : SNAP;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        let mass = 1;
        if (e.altKey) {
          setEvents(ev => ev.map(x => {
            if (x.id !== selectedId) return x;
            const nd = clamp(x.durationMin + dir * step, SNAP, DAY_MIN - x.startMin);
            mass = massFor(nd);
            return { ...x, durationMin: nd, source: null };
          }));
        } else {
          setEvents(ev => ev.map(x => {
            if (x.id !== selectedId) return x;
            mass = massFor(x.durationMin);
            return { ...x, startMin: clamp(x.startMin + dir * step, 0, DAY_MIN - x.durationMin), source: null };
          }));
        }
        markSettle(selectedId, mass, 'kbd');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, setEvents, markSettle]);

  const onGridMouseMove = useCallback((e) => {
    if (drag || pan) return;
    if (e.target !== e.currentTarget) { setHoverMin(null); return; }
    setHoverMin(snapMin(clamp(yToMin(e.clientY), 0, DAY_MIN)));
  }, [drag, pan, snapMin, yToMin]);
  const onGridMouseLeave = useCallback(() => setHoverMin(null), []);

  // Render events with drag overrides for the in-flight block.
  // Also filters out events whose task is done when hideCompletedOnCalendar is on.
  const renderEvents = useMemo(() => {
    let src = events;
    if (hideCompletedOnCalendar) {
      src = src.filter(e => {
        if (!e.taskId) return true;
        const t = tasks.find(tk => tk.id === e.taskId);
        return !t?.done;
      });
    }
    return src.map(e => {
      if (drag && drag.kind !== 'create' && drag.evId === e.id) {
        return {
          ...e,
          _dragView: {
            topPx:    ((drag.visStartMin ?? drag.startMin) / 60) * pxh,
            heightPx: Math.max(14, ((drag.visDurationMin ?? drag.durationMin) / 60) * pxh),
            mass:     massFor(drag.visDurationMin ?? drag.durationMin),
            snapPx:   (drag.startMin / 60) * pxh,
            snapHeightPx: Math.max(14, (drag.durationMin / 60) * pxh),
          },
          _unscheduling: drag.unschedule,
        };
      }
      return e;
    });
  }, [events, drag, pxh, hideCompletedOnCalendar, tasks]);
  const layout = useMemo(() => layoutOverlaps(renderEvents), [renderEvents]);

  // Chunk index map for split tasks — keyed by event id, gives {idx, total}
  // when a task has >1 event on this day. Used by EventBlock for "(i/n)" label.
  const chunkIndex = useMemo(() => {
    const byTask = new Map();
    for (const ev of renderEvents) {
      if (!ev.taskId) continue;
      const arr = byTask.get(ev.taskId);
      if (arr) arr.push(ev);
      else byTask.set(ev.taskId, [ev]);
    }
    const out = new Map();
    for (const arr of byTask.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => a.startMin - b.startMin);
      arr.forEach((ev, i) => out.set(ev.id, { idx: i + 1, total: arr.length }));
    }
    return out;
  }, [renderEvents]);

  const previewEv = (drag && drag.kind === 'create')
    ? {
        id: '__preview', taskId: drag.taskId,
        startMin: drag.startMin, durationMin: drag.durationMin,
        _dragView: {
          topPx:    ((drag.visStartMin ?? drag.startMin) / 60) * pxh,
          heightPx: Math.max(14, ((drag.visDurationMin ?? drag.durationMin) / 60) * pxh),
          mass:     massFor(drag.visDurationMin ?? drag.durationMin),
          snapPx:   (drag.startMin / 60) * pxh,
          snapHeightPx: Math.max(14, (drag.durationMin / 60) * pxh),
        },
      }
    : null;

  // Initial scroll: anchor the "now" line ~25% from the top on today, or
  // 9am on any other day. Re-runs when the visible day changes.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchorMin = isToday ? nowMin : 9 * 60;
    const targetY = (anchorMin / 60) * pxh - el.clientHeight * 0.25;
    el.scrollTop = Math.max(0, targetY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr]);

  // Ctrl/Cmd + wheel zoom — anchors to cursor minute.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorY = e.clientY - rect.top + el.scrollTop;
      const cursorMin = (cursorY / pxh) * 60;
      const next = clamp(pxh - Math.sign(e.deltaY) * 8, MIN_PXH, MAX_PXH);
      setPxh(next);
      requestAnimationFrame(() => {
        const newY = (cursorMin / 60) * next;
        el.scrollTop = newY - (e.clientY - rect.top);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pxh, setPxh]);

  const totalMin = events.reduce((s, e) => s + e.durationMin, 0);
  const overCapacity = totalMin > 8 * 60;
  const gridH = 24 * pxh;

  const dragTip = drag && (
    drag.kind === 'create' || drag.kind === 'move'
      ? `${minToLabel(drag.startMin)} – ${minToLabel(drag.startMin + drag.durationMin)} · ${fmtDur(drag.durationMin)}`
      : drag.kind === 'resize'
        ? `${fmtDur(drag.durationMin)} · ends ${minToLabel(drag.startMin + drag.durationMin)}`
        : drag.kind === 'resize-top'
          ? `${fmtDur(drag.durationMin)} · starts ${minToLabel(drag.startMin)}`
          : null
  );

  const guide = (() => {
    if (!drag) return null;
    const visStart = drag.visStartMin ?? drag.startMin;
    const visDur   = drag.visDurationMin ?? drag.durationMin;
    const offByPx = Math.abs(visStart - drag.startMin) / 60 * pxh
                  + Math.abs(visDur - drag.durationMin) / 60 * pxh;
    if (offByPx < 3) return null;
    return {
      topPx: (drag.startMin / 60) * pxh,
      heightPx: Math.max(14, (drag.durationMin / 60) * pxh),
    };
  })();

  // Context menu items for calendar events.
  const handleEvContextMenu = useCallback((ev, task, x, y) => {
    setCalCtxMenu({ ev, task, x, y });
  }, []);

  const calCtxItems = calCtxMenu ? (() => {
    const { ev, task } = calCtxMenu;
    const items = [];
    if (task) {
      items.push({ type: 'lbl', label: 'Task' });
      items.push({ label: 'Open in drawer', onClick: () => onOpenTask?.(task.id) });
      items.push({ label: task.done ? 'Unmark done' : 'Mark as done', onClick: () => onMarkDone?.(task.id, !task.done) });
      items.push({ type: 'sep' });
    }
    items.push({ label: 'Calendar colour…', onClick: () => setCalColorPickerFor({ evId: ev.id, x: calCtxMenu.x, y: calCtxMenu.y }) });
    if (ev.color) {
      items.push({ label: 'Reset colour', onClick: () => setEvents(evs => evs.map(x => x.id === ev.id ? { ...x, color: null } : x)) });
    }
    items.push({ type: 'sep' });
    if (!task) {
      items.push({ label: 'Rename', onClick: () => setRenamingId(ev.id) });
    }
    items.push({
      label: 'Duplicate block',
      onClick: () => {
        const newId = newEventId();
        const occupied = events.map(x => [x.startMin, x.startMin + x.durationMin]);
        const lastEnd = occupied.length ? Math.max(...occupied.map(([, e]) => e)) : 9 * 60;
        const nextStart = snapMin(clamp(lastEnd, 0, DAY_MIN - ev.durationMin));
        setEvents(evs => [...evs, { ...ev, id: newId, startMin: nextStart, source: null }]);
        setSelectedId(newId);
        markSettle(newId, massFor(ev.durationMin), 'create');
      },
    });
    items.push({
      label: 'Remove from calendar',
      onClick: () => { setEvents(evs => evs.filter(x => x.id !== ev.id)); setSelectedId(null); },
      danger: true,
    });
    return items;
  })() : [];

  // Date label for the header — short weekday + "Apr 29" style.
  const dateObj = D.parse(dateStr) || D.today();
  const wkLabel = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dateObj.getDay()];
  const moLabel = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dateObj.getMonth()];
  const numLabel = `${moLabel} ${dateObj.getDate()}`;

  return (
    <section
      className={`cal-drawer is-open${(calendarWidth || 460) < 420 ? ' cal-narrow' : ''}`}
      ref={drawerRef}
      style={{width: calendarWidth || 460}}
      onContextMenu={(e) => {
        // Suppress the browser's native menu anywhere in the drawer that
        // hasn't been handled by an event block's own contextmenu listener.
        // (Event blocks call preventDefault + stopPropagation in their native
        // listener, so this only runs for right-clicks on the empty grid,
        // gutter, routines strip, header, etc.)
        e.preventDefault();
      }}
    >
      <div className="cal-resize-handle" onMouseDown={onResizeMouseDown}/>
      <header className="cal-hdr">
        <div className="cal-hdr-left">
          <button className="icon-btn" title="Previous day" onClick={onPrev}><Chev dir="left" /></button>
          <button className="cal-today" onClick={onToday} title="Jump to today">Today</button>
          <button className="icon-btn" title="Next day" onClick={onNext}><Chev dir="right" /></button>
          <div className="cal-date">
            <span className="cal-date-day">{wkLabel}</span>
            <span className="cal-date-num">{numLabel}</span>
          </div>
        </div>
        <div className="cal-hdr-right">
          <button
            className="auto-plan-btn"
            onClick={onAutoPlan}
            disabled={!isToday}
            title={isToday ? 'Auto-plan: fill open slots with today\'s tasks' : 'Auto-plan only fills today'}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 12l4 4 14-14"/>
            </svg>
            <span className="plan-lbl">Plan</span>
          </button>
          <input
            type="range" min={MIN_PXH} max={MAX_PXH} step="2" value={pxh}
            onChange={(e) => setPxh(parseInt(e.target.value, 10))}
            className="zoom-range" aria-label="Zoom" title="Zoom (Ctrl/Cmd + scroll)"
          />
          <button
            className={'snap-btn' + (snapOn ? ' on' : '')}
            onClick={() => setSnapOn(s => !s)}
            title={snapOn ? 'Snap: 15 min (on)' : 'Snap: off'}
            aria-label="Toggle 15-minute snap"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18"/>
              <circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none"/>
              <circle cx="14" cy="12" r="1.6" fill="currentColor" stroke="none"/>
              <circle cx="10" cy="18" r="1.6" fill="currentColor" stroke="none"/>
            </svg>
            <span className="snap-lbl">15m</span>
          </button>
          {onTogglePin && (
            <button
              className={'icon-btn cal-pin' + (pinned ? ' on' : '')}
              title={pinned ? 'Unpin calendar (will close on click-away)' : 'Pin calendar open'}
              aria-pressed={!!pinned}
              onClick={onTogglePin}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22"/>
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
              </svg>
            </button>
          )}
          {onClose && (
            <button className="icon-btn cal-close" title="Close calendar" onClick={onClose}>&#215;</button>
          )}
        </div>
      </header>

      <div className="cal-capacity">
        <div className="capacity-row">
          <span className="capacity-label">Scheduled</span>
          <span className={'capacity-val' + (overCapacity ? ' over' : '')}>{fmtDur(totalMin) || '0m'}</span>
          <span className="capacity-of">/ 8h day</span>
        </div>
        <div className="capacity-bar">
          <div
            className={'capacity-fill' + (overCapacity ? ' over' : '')}
            style={{ width: clamp((totalMin / (8*60)) * 100, 0, 100) + '%' }}
          />
        </div>
      </div>

      {routines?.length > 0 && (
        <div className="cal-routines">
          <span className="cal-routines-lbl">Routines</span>
          <div className="cal-routines-chips">
            {routines.map(t => (
              <div
                key={t.id}
                className="cal-routine-chip"
                onMouseDown={(e) => onRoutineMouseDown?.(e, t)}
                title="Drag onto calendar to schedule"
              >
                <span className="cal-routine-icon">&#8635;</span>
                <span className="cal-routine-name">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-grid-wrap" style={{ height: gridH }}>
          <div className="cal-gutter">
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} className="hour-label" style={{ top: h * pxh }}>
                {minToCompact(h * 60)}
              </div>
            ))}
          </div>

          <div
            className={'cal-grid' + (drag ? ' is-dragging' : '') + (pan ? ' is-panning' : '')}
            ref={gridRef}
            onMouseDown={onGridMouseDown}
            onDoubleClick={onGridDoubleClick}
            onMouseMove={onGridMouseMove}
            onMouseLeave={onGridMouseLeave}
            style={{ height: gridH, '--pxh': pxh + 'px' }}
          >
            <div
              className="work-band"
              style={{ top: (WORK_START / 60) * pxh, height: ((WORK_END - WORK_START) / 60) * pxh }}
              aria-hidden="true"
            />

            {Array.from({ length: 24 }).map((_, h) => (
              <React.Fragment key={h}>
                <div className="hour-line" style={{ top: h * pxh }} />
                {pxh >= 60 && <div className="halfhour-line" style={{ top: h * pxh + pxh / 2 }} />}
                {pxh >= 110 && (
                  <>
                    <div className="quarterhour-line" style={{ top: h * pxh + pxh * 0.25 }} />
                    <div className="quarterhour-line" style={{ top: h * pxh + pxh * 0.75 }} />
                  </>
                )}
              </React.Fragment>
            ))}

            {hoverMin != null && !drag && !pan && (
              <div className="hover-line" style={{ top: (hoverMin / 60) * pxh }}>
                <span className="hover-time">{minToCompact(hoverMin)}</span>
              </div>
            )}

            {guide && (
              <div className="snap-guide" style={{ top: guide.topPx, height: guide.heightPx }} />
            )}

            {snapPulse && (
              <div
                key={snapPulse.key}
                className="snap-pulse"
                style={{ top: (snapPulse.minute / 60) * pxh }}
              />
            )}

            {isToday && nowMin >= 0 && nowMin <= DAY_MIN && (
              <div className="now-line" style={{ top: (nowMin / 60) * pxh }}>
                <span className="now-dot" />
                <span className="now-time">{minToCompact(nowMin)}</span>
              </div>
            )}

            {renderEvents.map(ev => {
              const task = ev.taskId ? tasks.find(t => t.id === ev.taskId) : null;
              // ev.color is a per-event override; falls back to bucket/project color via projectColor.
              const color = ev.color || (task ? projectColor(task) : '#5eead4');
              return (
                <EventBlock
                  key={ev.id}
                  ev={ev}
                  task={task}
                  color={color}
                  pxh={pxh}
                  layout={layout.get(ev.id)}
                  selected={selectedId === ev.id}
                  isUnscheduling={ev._unscheduling}
                  dragView={ev._dragView}
                  settle={settle[ev.id]}
                  isRenaming={renamingId === ev.id}
                  chunkInfo={chunkIndex.get(ev.id)}
                  isAuto={ev.source === 'auto' && differentiateAutoBlocks}
                  onStartDrag={startEventDrag}
                  onSelect={setSelectedId}
                  onContextMenu={handleEvContextMenu}
                  onRename={(id, title) => {
                    setRenamingId(null);
                    if (title !== null) setEvents(ev => ev.map(x => x.id === id ? { ...x, title } : x));
                  }}
                />
              );
            })}

            {previewEv && (() => {
              const task = previewEv.taskId
                ? tasks.find(t => t.id === previewEv.taskId)
                : null;
              const color = previewEv.color || (task ? projectColor(task) : '#5eead4');
              return (
                <EventBlock
                  ev={previewEv}
                  task={task}
                  color={color}
                  pxh={pxh}
                  layout={{ col: 0, cols: 1 }}
                  dragView={previewEv._dragView}
                  onStartDrag={() => {}}
                />
              );
            })()}

            {drag && dragTip && (
              <div
                className="drag-tip"
                style={{
                  top: ((drag.kind === 'resize'
                          ? drag.startMin + drag.durationMin
                          : drag.startMin) / 60) * pxh
                }}
              >
                {dragTip}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="cal-foot">
        <span><kbd>drag</kbd> to pan &middot; <kbd>dbl-click</kbd> new block &middot; <kbd>drag event left</kbd> to remove &middot; <kbd>&#8679;&#8679;</kbd> nudge &middot; <kbd>del</kbd></span>
      </footer>

      {/* Portal these to document.body — the .cal-drawer has a transform
          (from its slide-in animation) which creates a containing block
          for position:fixed children, knocking them off-screen. */}
      {calCtxMenu && createPortal(
        <ContextMenu
          x={calCtxMenu.x}
          y={calCtxMenu.y}
          items={calCtxItems}
          onClose={() => setCalCtxMenu(null)}
        />,
        document.body
      )}
      {calColorPickerFor && createPortal(
        <CalEventColorPicker
          x={calColorPickerFor.x}
          y={calColorPickerFor.y}
          onPick={(color) => setEvents(evs => evs.map(e => e.id === calColorPickerFor.evId ? { ...e, color } : e))}
          onClose={() => setCalColorPickerFor(null)}
        />,
        document.body
      )}
    </section>
  );
}
