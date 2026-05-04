import React, { useEffect, useRef } from 'react';


// ── ContextMenu (right-click on cards) ───────────────────────────────────
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  // clamp to viewport
  const w = 200, h = items.length * 28 + 12;
  const ax = Math.min(x, window.innerWidth - w - 6);
  const ay = Math.min(y, window.innerHeight - h - 6);
  return (
    <div ref={ref} className="ctx-menu" style={{left:ax, top:ay}}>
      {items.map((it,i)=>{
        if (it.type === 'sep') return <div key={i} className="ctx-menu-sep"/>;
        if (it.type === 'lbl') return <div key={i} className="ctx-menu-lbl">{it.label}</div>;
        return <div key={i} className={`ctx-menu-item${it.danger?' danger':''}`}
          onClick={()=>{ it.onClick(); onClose(); }}>
          <span>{it.label}</span>
          {it.kbd && <span className="ctx-menu-item-kbd">{it.kbd}</span>}
        </div>;
      })}
    </div>
  );
}

// ── PriBars ──────────────────────────────────────────────────────────────

export { ContextMenu };
