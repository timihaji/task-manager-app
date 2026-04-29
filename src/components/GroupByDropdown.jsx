import React, { useState, useEffect, useRef } from 'react';

function GroupByDropdown({ colKey, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const opts = [{v:'project',l:'Location'},{v:'lifeArea',l:'Life Area'},{v:'tag',l:'Tag'},{v:'priority',l:'Priority'},{v:'none',l:'None'}];
  useEffect(()=>{
    if (!open) return;
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);
  return (
    <div className="col-groupby-wrap" ref={ref}>
      <button className="col-groupby" onClick={e=>{e.stopPropagation();setOpen(o=>!o)}}>
        ▾ Group: {opts.find(o=>o.v===value)?.l||'Location'}
      </button>
      {open && (
        <div className="grp-dd">
          {opts.map(o=>(
            <div key={o.v} className={`grp-dd-item${value===o.v?' active':''}`}
              onClick={e=>{e.stopPropagation();onChange(colKey,o.v);setOpen(false);}}>
              {o.l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Column ───────────────────────────────────────────────────────────────

export { GroupByDropdown };
