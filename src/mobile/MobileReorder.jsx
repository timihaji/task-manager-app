import React, { useState, useRef, useCallback } from 'react';
import { computePosition } from '../utils/position.js';

// Long-press a task in a list → ghost card follows the finger, an insertion
// line shows above/below the hovered neighbor. Drop commits a new
// `position` value computed from the neighbors via `computePosition`.
//
// Today screen uses MobileReschedule (drag-to-day) instead. Everywhere else
// uses this for in-list reorder.

export function useReorder({ tasks, updateTask }) {
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  dragRef.current = drag;

  const start = useCallback((task, init) => {
    if (navigator.vibrate) navigator.vibrate(12);
    setDrag({
      task,
      x: init.x, y: init.y,
      ox: init.x, oy: init.y,
      phase: 'opening',
      insertionId: null,
      insertionPos: null,
      cardWidth: init.rect.width, cardHeight: init.rect.height,
      originX: init.rect.left, originY: init.rect.top,
    });
    setTimeout(() => setDrag(d => d && { ...d, phase: 'dragging' }), 60);

    const onMove = (e) => {
      e.preventDefault?.();
      const x = e.clientX, y = e.clientY;
      const el = document.elementFromPoint(x, y);
      const card = el && el.closest && el.closest('[data-task-id]');
      let insertionId = null, insertionPos = null;
      if (card) {
        const otherId = card.getAttribute('data-task-id');
        if (otherId !== task.id) {
          const rect = card.getBoundingClientRect();
          insertionPos = (y - rect.top) < rect.height / 2 ? 'above' : 'below';
          insertionId = otherId;
        }
      }
      setDrag(d => d && { ...d, x, y, insertionId, insertionPos });
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      const d = dragRef.current;
      if (!d) return;
      if (!d.insertionId) {
        setDrag(s => s && { ...s, phase: 'cancelling' });
        setTimeout(() => setDrag(null), 280);
        return;
      }
      const sorted = tasks.slice().sort((a,b) => (a.position ?? 1e9) - (b.position ?? 1e9));
      const targetIdx = sorted.findIndex(t => t.id === d.insertionId);
      if (targetIdx === -1) {
        setDrag(s => s && { ...s, phase: 'cancelling' });
        setTimeout(() => setDrag(null), 280);
        return;
      }
      let above, below;
      if (d.insertionPos === 'above') {
        below = sorted[targetIdx];
        above = sorted[targetIdx - 1];
      } else {
        above = sorted[targetIdx];
        below = sorted[targetIdx + 1];
      }
      // Don't anchor to self if the dragged task is one of the neighbors
      if (above?.id === d.task.id) above = sorted[targetIdx - 2] || null;
      if (below?.id === d.task.id) below = sorted[targetIdx + 2] || null;
      const newPos = computePosition(above, below);
      if (navigator.vibrate) navigator.vibrate([6, 28, 14]);
      updateTask(d.task.id, { position: newPos });
      setDrag(s => s && { ...s, phase: 'dropping' });
      setTimeout(() => setDrag(null), 200);
    };

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }, [tasks, updateTask]);

  return { drag, startReorder: start };
}

// Floating ghost card following the finger.
export function ReorderGhost({ drag, children }) {
  if (!drag) return null;
  const isCancel = drag.phase === 'cancelling';
  const isDrop = drag.phase === 'dropping';
  let tx, ty, scale, rotate;
  if (isCancel) {
    tx = drag.originX; ty = drag.originY;
    scale = 1; rotate = 0;
  } else {
    tx = drag.x - drag.cardWidth/2;
    ty = drag.y - drag.cardHeight/2 - 18;
    scale = drag.phase === 'opening' ? 1.0 : 1.04;
    const dx = drag.x - drag.ox;
    rotate = Math.max(-3, Math.min(3, dx * 0.02));
  }
  return (
    <div style={{
      position:'fixed', left:0, top:0,
      width: drag.cardWidth, height: drag.cardHeight,
      transform: `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotate}deg)`,
      transition: isCancel
        ? 'transform .28s var(--ease-out), opacity .28s ease'
        : 'transform .14s cubic-bezier(.2,.7,.3,1)',
      opacity: isDrop ? 0 : 1,
      pointerEvents:'none', zIndex:1001,
      filter:'drop-shadow(0 18px 32px rgba(13,23,20,.18)) drop-shadow(0 4px 10px rgba(13,23,20,.10))',
      willChange:'transform',
    }}>
      <div style={{ transformOrigin:'center', animation: drag.phase === 'opening' ? 'mob-ghostLift .32s var(--ease-spring) both' : 'none' }}>
        {children}
      </div>
    </div>
  );
}

// Horizontal accent line shown above/below the hovered target card. Renders
// into document body (fixed positioning) so it's not clipped by ancestor
// overflow:hidden containers (e.g. the screen scroll wrapper).
export function InsertionLine({ drag }) {
  if (!drag || !drag.insertionId || drag.phase === 'cancelling') return null;
  const targetEl = typeof document !== 'undefined'
    ? document.querySelector(`[data-task-id="${drag.insertionId}"]`)
    : null;
  if (!targetEl) return null;
  const rect = targetEl.getBoundingClientRect();
  const top = drag.insertionPos === 'above' ? rect.top - 2 : rect.bottom;
  return (
    <div style={{
      position:'fixed', left: rect.left + 4, top: top - 1.5,
      width: rect.width - 8, height: 3,
      background:'var(--accent)', borderRadius:99,
      boxShadow:'0 0 0 4px var(--accent-dim)',
      zIndex:1000, pointerEvents:'none',
    }}/>
  );
}

// Backdrop scrim while dragging — dims everything outside the drag layer.
export function ReorderScrim({ drag }) {
  if (!drag) return null;
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:999, pointerEvents:'none',
      background:'rgba(13,23,20,.10)',
      animation:'mob-scrimIn .22s ease both',
    }}/>
  );
}
