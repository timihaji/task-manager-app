import React, { useState, useEffect, useRef } from 'react';

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

// ── MiniCalendar ─────────────────────────────────────────────────────────

export { CardPopover };
