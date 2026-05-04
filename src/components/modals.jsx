import React, { useState, useEffect, useRef } from 'react';
import { D } from '../data.js';
import { I } from '../utils/icons.jsx';

const CMDS=[
  {i:'Plus',l:'New task',k:'N'},{i:'Archive',l:'Archive focused task',k:'C'},{i:'Cal',l:'Jump to today',k:'T'},
  {i:'Moon',l:'Toggle theme',k:'L'},{i:'Filter',l:'Toggle weekends',k:'W'},
  {i:'Star',l:'Priorities view'},{i:'Inbox',l:'Go to inbox'},
];
function CommandPalette({ onClose, onCmd }) {
  const [q,setQ]=useState(''); const [sel,setSel]=useState(0);
  const ref=useRef(null);
  useEffect(()=>ref.current?.focus(),[]);
  const items=CMDS.filter(c=>c.l.toLowerCase().includes(q.toLowerCase()));
  const onKey=e=>{ if(e.key==='Escape')onClose(); if(e.key==='ArrowDown'){e.preventDefault();setSel(s=>Math.min(s+1,items.length-1));} if(e.key==='ArrowUp'){e.preventDefault();setSel(s=>Math.max(s-1,0));} if(e.key==='Enter'){onCmd(items[sel]);onClose();} };
  return <div className="overlay-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="palette" onKeyDown={onKey}>
      <div className="pal-input-row"><I.Search/><input ref={ref} className="pal-input" placeholder="Search or run a command…" value={q} onChange={e=>{setQ(e.target.value);setSel(0);}}/><span className="pal-esc">esc</span></div>
      <div className="pal-sec-lbl">Commands</div>
      {items.map((c,i)=>{const Ico=I[c.i]||I.Star; return <div key={i} className={`pal-item${i===sel?' sel':''}`} onClick={()=>{onCmd(c);onClose();}}><Ico/><span className="pal-item-lbl">{c.l}</span>{c.k&&<span className="pal-item-kbd">{c.k}</span>}</div>;})}
      <div className="pal-footer"><span><kbd>↑↓</kbd>navigate</span><span><kbd>↵</kbd>run</span><span><kbd>esc</kbd>close</span></div>
    </div>
  </div>;
}

// ── ShortcutsOverlay ─────────────────────────────────────────────────────
const SC_ROWS=[['J / K','Next / prev card'],['← →','Prev / next column'],['X','Toggle complete'],['E','Rename hovered card'],['N','New task'],['A','New task at cursor'],['C','Archive hovered card'],['T','Jump to today'],['1 2 3','Set priority P1/P2/P3'],['[ ]','Move card ←/→ day'],['D','Duplicate card'],['⌫','Delete card'],['Z','Toggle Someday'],['⌘Z','Undo'],['S','Snooze (open drawer)'],['L','Toggle theme'],['W','Toggle weekends'],['⌘K','Command palette'],['⌘\\','Toggle sidebar'],['?','This overlay'],['Esc','Close / clear focus']];
function ShortcutsOverlay({ onClose }) {
  return <div className="overlay-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="sc-panel">
      <div className="sc-title">Keyboard Shortcuts</div>
      <div className="sc-grid">{SC_ROWS.map(([k,d])=><div key={k} className="sc-row"><kbd>{k}</kbd><span className="sc-row-desc">{d}</span></div>)}</div>
    </div>
  </div>;
}

export { CMDS, CommandPalette, SC_ROWS, ShortcutsOverlay };
