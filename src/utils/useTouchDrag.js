import { useEffect, useRef } from 'react';

/**
 * Synthesizes drag-and-drop from touch (pointer) events with a long-press start gesture.
 * Lets a card be tapped (short release = no drag) or long-pressed to enter drag mode.
 *
 * Native HTML5 drag continues to work for mouse on desktop; this hook only activates for
 * pointerType === 'touch'. The caller wires onPointerDown to each draggable element and
 * supplies callbacks that mirror its existing dragstart/dragover/drop logic.
 */
export function useTouchDrag({
  longPressMs = 350,
  moveCancelPx = 8,
  edgeAutoScroll = true,
  scrollContainerRef = null,
  onStart,
  onMove,
  onEnd,
  onCancel,
}) {
  const stateRef = useRef({
    active: false,
    longPressTimer: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    id: null,
    captureEl: null,
    rafId: null,
    edgeDy: 0,
    edgeDx: 0,
    prevTouchAction: '',
    prevUserSelect: '',
  });

  const cancel = (reason) => {
    const s = stateRef.current;
    if (s.longPressTimer) { clearTimeout(s.longPressTimer); s.longPressTimer = null; }
    if (s.captureEl && s.pointerId != null) {
      try { s.captureEl.releasePointerCapture(s.pointerId); } catch {}
    }
    if (s.active) {
      document.body.style.touchAction = s.prevTouchAction || '';
      document.body.style.userSelect = s.prevUserSelect || '';
      try { onCancel?.(reason); } catch {}
    }
    if (s.rafId) { cancelAnimationFrame(s.rafId); s.rafId = null; }
    s.active = false;
    s.pointerId = null;
    s.captureEl = null;
    s.id = null;
    s.edgeDy = 0;
    s.edgeDx = 0;
  };

  // Auto-scroll the scrollContainer (if provided) when finger near edges.
  const tickAutoScroll = () => {
    const s = stateRef.current;
    s.rafId = null;
    const el = scrollContainerRef?.current;
    if (!s.active || !el) return;
    if (s.edgeDy) el.scrollTop += s.edgeDy;
    if (s.edgeDx) el.scrollLeft += s.edgeDx;
    if (s.edgeDy || s.edgeDx) {
      s.rafId = requestAnimationFrame(tickAutoScroll);
    }
  };

  const updateEdgeAutoScroll = (clientX, clientY) => {
    if (!edgeAutoScroll) return;
    const s = stateRef.current;
    const el = scrollContainerRef?.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const EDGE = 60;
    const top = clientY - r.top;
    const bottom = r.bottom - clientY;
    const left = clientX - r.left;
    const right = r.right - clientX;
    let dy = 0, dx = 0;
    if (top < EDGE && top > -20) dy = -Math.max(4, (EDGE - top) / 4);
    else if (bottom < EDGE && bottom > -20) dy = Math.max(4, (EDGE - bottom) / 4);
    if (left < EDGE && left > -20) dx = -Math.max(4, (EDGE - left) / 4);
    else if (right < EDGE && right > -20) dx = Math.max(4, (EDGE - right) / 4);
    s.edgeDy = dy;
    s.edgeDx = dx;
    if ((dy !== 0 || dx !== 0) && !s.rafId) {
      s.rafId = requestAnimationFrame(tickAutoScroll);
    }
  };

  // Window-level listeners attached only while a long-press is potentially pending or active.
  useEffect(() => {
    const onPointerMove = (e) => {
      const s = stateRef.current;
      if (s.pointerId == null || e.pointerId !== s.pointerId) return;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      if (!s.active) {
        const dx = Math.abs(e.clientX - s.startX);
        const dy = Math.abs(e.clientY - s.startY);
        if (dx > moveCancelPx || dy > moveCancelPx) {
          if (s.longPressTimer) { clearTimeout(s.longPressTimer); s.longPressTimer = null; }
          s.pointerId = null;
        }
        return;
      }
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      try { onMove?.({ x: e.clientX, y: e.clientY }, el); } catch {}
      updateEdgeAutoScroll(e.clientX, e.clientY);
    };
    const onPointerUp = (e) => {
      const s = stateRef.current;
      if (s.pointerId == null || e.pointerId !== s.pointerId) return;
      if (!s.active) {
        if (s.longPressTimer) { clearTimeout(s.longPressTimer); s.longPressTimer = null; }
        s.pointerId = null;
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      try { onEnd?.({ x: e.clientX, y: e.clientY }, el); } catch {}
      cancel('end');
    };
    const onPointerCancel = (e) => {
      const s = stateRef.current;
      if (s.pointerId != null && e.pointerId === s.pointerId) cancel('cancel');
    };
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      cancel('unmount');
    };
  }, []);

  const onPointerDown = (e, id) => {
    if (e.pointerType !== 'touch') return;
    if (e.target?.closest('button, input, textarea, select, a, [contenteditable="true"]')) return;
    const s = stateRef.current;
    cancel('restart');
    s.pointerId = e.pointerId;
    s.startX = e.clientX;
    s.startY = e.clientY;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.id = id;
    s.captureEl = e.currentTarget;
    s.longPressTimer = setTimeout(() => {
      s.longPressTimer = null;
      s.active = true;
      s.prevTouchAction = document.body.style.touchAction;
      s.prevUserSelect = document.body.style.userSelect;
      document.body.style.touchAction = 'none';
      document.body.style.userSelect = 'none';
      try { s.captureEl?.setPointerCapture?.(s.pointerId); } catch {}
      try { navigator.vibrate?.(10); } catch {}
      try { onStart?.(s.id, { x: s.lastX, y: s.lastY }); } catch {}
    }, longPressMs);
  };

  return { onPointerDown };
}
