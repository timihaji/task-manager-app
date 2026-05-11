import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

// ── CardPopover primitive ────────────────────────────────────────────────
// Uses position:fixed with viewport-relative coordinates and renders into
// document.body via portal, so it never affects the anchoring card's layout.
function CardPopover({ open, onClose, children, anchorRef }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open || !anchorRef?.current) return;
    const update = () => {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      // Measure the popover if it's already mounted; else fall back to estimate
      const popH = ref.current ? ref.current.offsetHeight : 320;
      const popW = ref.current ? ref.current.offsetWidth  : 260;
      const margin = 8;
      const below = window.innerHeight - r.bottom;
      const goesUp = below < popH + margin && r.top > popH + margin;
      let left = r.left;
      if (left + popW > window.innerWidth - margin) left = window.innerWidth - popW - margin;
      if (left < margin) left = margin;
      const top = goesUp ? r.top - popH - 4 : r.bottom + 4;
      setPos({left, top});
    };
    update();
    // Re-measure on next frame after the popover has rendered, to use real height
    const raf = requestAnimationFrame(update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const onDoc = e => {
      if (ref.current?.contains(e.target)) return;
      if (anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchorRef]);
  if (!open) return null;
  const node = (
    <div ref={ref} className="card-pop"
      style={pos ? {left:pos.left, top:pos.top} : {visibility:'hidden', left:-9999, top:-9999}}
      onClick={e=>{e.stopPropagation();}}
      onMouseDown={e=>e.stopPropagation()}
      onContextMenu={e=>e.stopPropagation()}>
      {children}
    </div>
  );
  return ReactDOM.createPortal(node, document.body);
}

// ── StackPickerPopover ───────────────────────────────────────────────────
// Variant of CardPopover anchored at fixed x/y (cursor position) instead of
// to an element ref. Used by the Stack-view right-click menu, where the
// .scard rows don't host per-card meta-button anchors. Uses the same
// `.card-pop` styling so the picker contents look identical to the
// TaskCard versions.
function StackPickerPopover({ x, y, onClose, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const update = () => {
      const el = ref.current;
      const popW = el ? el.offsetWidth : 260;
      const popH = el ? el.offsetHeight : 280;
      const margin = 8;
      let left = x;
      let top = y;
      if (left + popW > window.innerWidth - margin) left = window.innerWidth - popW - margin;
      if (left < margin) left = margin;
      if (top + popH > window.innerHeight - margin) top = window.innerHeight - popH - margin;
      if (top < margin) top = margin;
      setPos({ left, top });
    };
    update();
    const raf = requestAnimationFrame(update);
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    window.addEventListener('resize', update);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [x, y, onClose]);
  const node = (
    <div ref={ref} className="card-pop"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: -9999, top: -9999 }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onContextMenu={e => e.stopPropagation()}>
      {children}
    </div>
  );
  return ReactDOM.createPortal(node, document.body);
}

// ── MiniCalendar ─────────────────────────────────────────────────────────

export { CardPopover, StackPickerPopover };
