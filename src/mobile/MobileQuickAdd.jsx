import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useApp, useData, haptic } from './contexts.js';
import { D, TODAY } from './dateUtil.js';

// Keyboard-anchored capture bar. Always mounted in the DOM so its <input>
// element exists *before* the user taps the FAB — the FAB handler then calls
// inputRef.current.focus() synchronously inside the gesture tick. iOS Safari
// will only open the on-screen keyboard if focus() happens inside a gesture.
// A setTimeout or a sheet-open animation breaks that chain.
//
// Docked to the bottom of the visual viewport so it sits above the keyboard
// instead of under it.

const SMART_DATE_PATTERNS = [
  { re: /\btoday\b/i,     fn: () => TODAY },
  { re: /\btomorrow\b/i,  fn: () => D.str(D.add(D.today(), 1)) },
  { re: /\bnext week\b/i, fn: () => D.str(D.add(D.today(), 7)) },
];

// Returns { date, cleanTitle } — strips the matched date phrase from the title
// so a captured task doesn't end up reading "Email John tomorrow at 2pm" after
// it's already filed on Tomorrow. Returns date=null if no phrase matched.
function parseSmartDate(title) {
  for (const { re, fn } of SMART_DATE_PATTERNS) {
    if (re.test(title)) {
      const cleanTitle = title.replace(re, '').replace(/\s{2,}/g, ' ').trim();
      return { date: fn(), cleanTitle };
    }
  }
  return { date: null, cleanTitle: title };
}

export const QuickAddBar = forwardRef(function QuickAddBar(_props, ref) {
  const { addTask, PROJECTS, PRI } = useData();
  const { quickAddOpts, closeQuickAdd, showToast } = useApp();

  const isOpen = quickAddOpts !== null;
  const opts = quickAddOpts || {};

  const [title,    setTitle]    = useState('');
  const [project,  setProject]  = useState(null);
  const [priority, setPriority] = useState('p3');
  const [date,     setDate]     = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [vvOffset, setVvOffset] = useState(0);
  const [sessionAdds, setSessionAdds] = useState(0);
  const inputRef = useRef(null);
  const startYRef = useRef(null);
  const dragYRef  = useRef(0);

  // Expose focus() to the parent — called synchronously from the FAB handler
  // BEFORE openQuickAdd() so iOS treats it as part of the user gesture.
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }), []);

  // Reset chip state + session counter whenever the bar opens. Title always
  // starts empty. Chips persist within an open session (brain-dump mode) so
  // repeated submissions inherit the same metadata.
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setProject(opts.project ?? null);
      setPriority(opts.priority ?? 'p3');
      setDate(opts.date ?? null);
      setExpanded(false);
      setSessionAdds(0);
    }
  }, [isOpen, opts.project, opts.date]);

  // Track the visual viewport so the bar stays pinned just above the keyboard.
  // On iOS 16.4+ with `interactive-widget=resizes-content`, the layout viewport
  // also resizes — both paths converge to the same `bottom: 0` placement.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setVvOffset(offset);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Brain-dump mode: each submit clears the title but keeps the bar open,
  // keyboard up, and chips persisted, so the user can rattle off tasks back
  // to back. Explicit dismiss via X / backdrop / swipe-down / empty-Enter /
  // browser back.
  const submit = useCallback(() => {
    if (!title.trim()) return;
    const { date: smartDate, cleanTitle } = parseSmartDate(title.trim());
    addTask({
      title: cleanTitle || title.trim(),
      project,
      priority,
      date: smartDate ?? date,
    });
    haptic([6, 12]);
    showToast('Task added ✓');
    setTitle('');
    setSessionAdds(n => n + 1);
    // Refocus in the same microtask so iOS keeps the keyboard up.
    inputRef.current?.focus();
  }, [title, project, priority, date, addTask, showToast]);

  // Pressing Enter with an empty title acts as "I'm done" — closes the bar.
  const onEnter = useCallback(() => {
    if (!title.trim()) { closeQuickAdd(); return; }
    submit();
  }, [title, submit, closeQuickAdd]);

  // Swipe down to dismiss
  const onDragStart = (e) => {
    startYRef.current = e.touches[0].clientY;
    dragYRef.current = 0;
  };
  const onDragMove = (e) => {
    if (startYRef.current == null) return;
    const dy = Math.max(0, e.touches[0].clientY - startYRef.current);
    dragYRef.current = dy;
    if (dy > 6) inputRef.current?.blur();
  };
  const onDragEnd = () => {
    if (dragYRef.current > 40) closeQuickAdd();
    startYRef.current = null;
  };

  const chip = (active) => ({
    padding:'6px 13px', borderRadius:99,
    border:`1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`,
    background: active ? 'var(--accent-dim)' : 'var(--surface)',
    color: active ? 'var(--accent)' : 'var(--t2)',
    fontSize:12.5, fontWeight:600, cursor:'pointer', transition:'all .15s',
    whiteSpace:'nowrap', flexShrink:0,
  });

  const projChip = (p, on) => ({
    display:'flex', alignItems:'center', gap:5,
    padding:'5px 11px', borderRadius:99,
    border:`1px solid ${on ? p.color : 'var(--border)'}`,
    background: on ? `${p.color}1a` : 'var(--surface)',
    color: on ? p.color : 'var(--t3)',
    fontSize:12.5, fontWeight:600, cursor:'pointer', transition:'all .15s',
    whiteSpace:'nowrap', flexShrink:0,
  });

  const dateOpts = [
    { l:'Today',     v: TODAY },
    { l:'Tomorrow',  v: D.str(D.add(D.today(), 1)) },
    { l:'Next week', v: D.str(D.add(D.today(), 7)) },
  ];

  const hasContent = !!title.trim();

  // ── Backdrop (tap to dismiss) ───────────────────────────────────────────
  return (
    <>
      <div
        onClick={closeQuickAdd}
        style={{
          position:'fixed', inset:0, zIndex:399,
          background:'rgba(13,23,20,.36)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition:'opacity .22s ease',
        }}
      />

      {/* ── Bar wrapper (always mounted, transformed off-screen when closed) */}
      <div
        style={{
          position:'fixed', left:0, right:0,
          bottom: vvOffset,
          zIndex:400,
          transform: isOpen ? 'translateY(0)' : 'translateY(110%)',
          transition:'transform .32s var(--ease-out)',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {/* ── Metadata strip (expandable) ────────────────────────────────── */}
        <div style={{
          background:'var(--surface)',
          borderTop:'1px solid var(--border)',
          maxHeight: expanded ? 260 : 0,
          overflow:'hidden',
          transition:'max-height .28s var(--ease-out)',
        }}>
          <div style={{ padding:'12px 14px 4px' }}>
            <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--t4)', marginBottom:8 }}>When</div>
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4, marginBottom:10 }}>
              {dateOpts.map(o => (
                <button key={o.l} onClick={() => setDate(date===o.v ? null : o.v)} style={chip(date===o.v)}>
                  {o.l}
                </button>
              ))}
              <div style={{ position:'relative' }}>
                <button style={{ ...chip(false), display:'inline-flex', alignItems:'center', gap:5 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {date && !dateOpts.some(o => o.v === date) ? D.fmt(date) : 'Pick'}
                </button>
                <input type="date" value={date||''} onChange={e => setDate(e.target.value||null)}
                  style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer', width:'100%' }}/>
              </div>
            </div>

            <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--t4)', marginBottom:8 }}>Project</div>
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4, marginBottom:10 }}>
              {PROJECTS.map(p => (
                <button key={p.id} onClick={() => setProject(project===p.id ? null : p.id)} style={projChip(p, project===p.id)}>
                  <span style={{ width:6, height:6, borderRadius:2, background:p.color, display:'inline-block' }}/>
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--t4)', marginBottom:8 }}>Priority</div>
            <div style={{ display:'flex', gap:6, paddingBottom:12 }}>
              {Object.entries(PRI).map(([id, info]) => (
                <button key={id} onClick={() => setPriority(id)} style={{
                  padding:'6px 14px', borderRadius:8,
                  border:`1px solid ${priority===id ? info.color : 'var(--border)'}`,
                  background: priority===id ? info.dim : 'var(--surface)',
                  color: priority===id ? info.color : 'var(--t3)',
                  fontSize:12.5, fontWeight:700, cursor:'pointer', flex:1,
                }}>
                  {info.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Input row ──────────────────────────────────────────────────── */}
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          onTouchCancel={onDragEnd}
          style={{
            background:'var(--surface)',
            borderTop:'1px solid var(--border)',
            padding:'10px 12px',
            paddingBottom: `max(10px, env(safe-area-inset-bottom))`,
            display:'flex',
            alignItems:'center',
            gap:8,
            boxShadow:'0 -8px 24px rgba(13,23,20,.10)',
            touchAction:'pan-y',
          }}>
          <div style={{
            flex:1,
            display:'flex',
            alignItems:'center',
            gap:8,
            background:'var(--surface-2)',
            border:'1px solid var(--accent-border)',
            borderRadius:14,
            padding:'0 12px',
            height:44,
            boxShadow:'0 0 0 3px var(--accent-dim)',
          }}>
            <input
              ref={inputRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
              placeholder={sessionAdds > 0 ? `Added ${sessionAdds} — next one…` : 'What needs doing?'}
              tabIndex={isOpen ? 0 : -1}
              enterKeyHint="go"
              autoCapitalize="sentences"
              autoCorrect="on"
              style={{
                flex:1, border:'none', background:'transparent',
                color:'var(--t1)', fontSize:16, outline:'none', minWidth:0,
                fontFamily:'inherit', letterSpacing:'-.005em',
              }}/>
            <button
              onClick={() => setExpanded(v => !v)}
              aria-label={expanded ? 'Hide options' : 'Show options'}
              tabIndex={isOpen ? 0 : -1}
              style={{
                flexShrink:0, width:28, height:28, borderRadius:'50%',
                border:'none', background: expanded ? 'var(--accent-dim)' : 'transparent',
                color: expanded ? 'var(--accent)' : 'var(--t3)',
                display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
                transition:'background .15s, color .15s',
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.8"/>
                <circle cx="12" cy="12" r="1.8"/>
                <circle cx="19" cy="12" r="1.8"/>
              </svg>
            </button>
          </div>

          <button
            onClick={closeQuickAdd}
            aria-label="Cancel"
            tabIndex={isOpen ? 0 : -1}
            className="tap"
            style={{
              flexShrink:0, width:40, height:40, borderRadius:12,
              border:'1px solid var(--border)', background:'var(--surface)',
              color:'var(--t3)', display:'flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
          </button>

          <button
            onClick={submit}
            disabled={!hasContent}
            aria-label="Add task"
            tabIndex={isOpen ? 0 : -1}
            className="tap"
            style={{
              flexShrink:0, width:44, height:44, borderRadius:13,
              border:'none',
              background: hasContent ? 'var(--accent)' : 'var(--surface-2)',
              color: hasContent ? '#fff' : 'var(--t4)',
              display:'flex', alignItems:'center', justifyContent:'center',
              cursor: hasContent ? 'pointer' : 'default',
              boxShadow: hasContent ? '0 4px 14px var(--accent-dim)' : 'none',
              transition:'background .15s, box-shadow .15s, color .15s',
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );
});
