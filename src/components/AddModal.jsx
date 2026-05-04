import React, { useState, useEffect, useRef } from 'react';
import { makeTask } from '../data.js';

function AddModal({ forDate, dayLabel, onAdd, onClose }) {
  const [title,setTitle]=useState(''); const ref=useRef(null);
  useEffect(()=>ref.current?.focus(),[]);
  const submit=()=>{ if(!title.trim())return; onAdd(makeTask({title:title.trim(),date:forDate||null})); onClose(); };
  return <div className="overlay-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:'var(--surface)',border:'1px solid var(--border-s)',borderRadius:2,padding:20,width:380,boxShadow:'var(--shadow-lg)',animation:'su .15s ease'}}>
      <div style={{fontSize:13,fontWeight:600,color:'var(--t1)',marginBottom:12}}>{dayLabel?`New task — ${dayLabel}`:'New task'}</div>
      <input ref={ref} style={{width:'100%',padding:'8px 10px',border:'1px solid var(--border-s)',borderRadius:2,background:'var(--surface-2)',color:'var(--t1)',font:'13px var(--font)',outline:'none',marginBottom:12}} placeholder="What needs to get done?" value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter')submit(); if(e.key==='Escape')onClose(); }}/>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'6px 12px',borderRadius:2,border:'1px solid var(--border-s)',background:'transparent',color:'var(--t3)',font:'12px var(--font)',cursor:'pointer'}}>Cancel</button>
        <button onClick={submit} style={{padding:'6px 14px',borderRadius:2,border:'none',background:'var(--accent)',color:'#fff',font:'12px/1 var(--font)',fontWeight:500,cursor:'pointer'}}>Add task</button>
      </div>
    </div>
  </div>;
}

// ── App ──────────────────────────────────────────────────────────────────

export { AddModal };
