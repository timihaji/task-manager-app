import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useData, useTheme, haptic } from './contexts.js';
import { D, TODAY } from './dateUtil.js';

// ── useSwipeable ─────────────────────────────────────────────────────────────
// Native non-passive touchmove + touch-action: pan-y so the browser commits
// to vertical scroll and leaves horizontal gestures to JS.
export function useSwipeable({ onSwipedLeft, onSwipedRight, leftThreshold=60, rightThreshold=52, minRange=-96, maxRange=80, snapLeftTo=-88, lockedRef } = {}) {
  const ref = useRef(null);
  const [dx, setDx] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [settled, setSettled] = useState('idle'); // 'idle' | 'left'
  const stateRef = useRef({ startX:0, startY:0, dir:null, active:false });

  const reset = useCallback(() => { setDx(0); setSettled('idle'); }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onStart = (e) => {
      if (lockedRef?.current) return;
      if (settled === 'left') return;
      const t = e.touches[0];
      stateRef.current = { startX: t.clientX, startY: t.clientY, dir: null, active: true };
    };
    const onMove = (e) => {
      const s = stateRef.current;
      if (!s.active) return;
      const t = e.touches[0];
      const ddx = t.clientX - s.startX;
      const ddy = t.clientY - s.startY;
      if (s.dir == null) {
        if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return;
        s.dir = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v';
      }
      if (s.dir !== 'h') return;
      if (e.cancelable) e.preventDefault();
      setSwiping(true);
      setDx(Math.max(minRange, Math.min(maxRange, ddx)));
    };
    const onEnd = () => {
      const s = stateRef.current;
      if (!s.active) return;
      s.active = false;
      setSwiping(false);
      if (s.dir !== 'h') return;
      setDx(curr => {
        if (curr > rightThreshold) { onSwipedRight?.(); return 0; }
        if (curr < -leftThreshold)  { onSwipedLeft?.();  setSettled('left'); return snapLeftTo; }
        setSettled('idle');
        return 0;
      });
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd,   { passive: true });
    el.addEventListener('touchcancel', onEnd,  { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [onSwipedLeft, onSwipedRight, leftThreshold, rightThreshold, minRange, maxRange, snapLeftTo, settled, lockedRef]);

  return { ref, dx, swiping, settled, reset };
}

// ── Sheet ─────────────────────────────────────────────────────────────────────
export function Sheet({ open, onClose, children, title, maxHeight='94dvh', noPad=false }) {
  const [visible, setVisible] = useState(false);
  const [anim,    setAnim]    = useState(false);
  const sheetRef  = useRef(null);
  const startYRef = useRef(null);
  const dragYRef  = useRef(0);

  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnim(true)));
    } else {
      setAnim(false);
      const t = setTimeout(() => setVisible(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (visible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [visible]);

  const onHandleTouchStart = e => {
    startYRef.current = e.touches[0].clientY;
    dragYRef.current  = 0;
  };
  const onHandleTouchMove  = e => {
    if (startYRef.current == null) return;
    const dy = Math.max(0, e.touches[0].clientY - startYRef.current);
    dragYRef.current = dy;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onHandleTouchEnd   = () => {
    if (dragYRef.current > 100) { onClose(); }
    else if (sheetRef.current)  { sheetRef.current.style.transform = ''; }
    startYRef.current = null;
  };

  if (!visible) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background: anim ? 'rgba(0,0,0,0.45)' : 'transparent', transition:'background .3s ease', backdropFilter: anim ? 'blur(1px)' : 'none' }}/>
      <div ref={sheetRef} style={{
        position:'relative', background:'var(--surface)', borderRadius:'24px 24px 0 0',
        maxHeight, display:'flex', flexDirection:'column', zIndex:1,
        transform: anim ? 'translateY(0)' : 'translateY(100%)',
        transition:'transform .36s var(--ease-out)',
        boxShadow:'0 -1px 0 var(--border), 0 -12px 48px rgba(0,0,0,.22)',
      }}>
        <div onTouchStart={onHandleTouchStart} onTouchMove={onHandleTouchMove} onTouchEnd={onHandleTouchEnd}
          style={{ flexShrink:0, paddingTop:9, paddingBottom:5, display:'flex', justifyContent:'center', cursor:'grab', touchAction:'none' }}>
          <div style={{ width:38, height:5, borderRadius:99, background:'var(--border-strong)' }}/>
        </div>
        {title && (
          <div style={{ display:'flex', alignItems:'center', padding:'4px 20px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <span style={{ flex:1, fontSize:17, fontWeight:600, color:'var(--t1)', letterSpacing:'-.012em' }}>{title}</span>
            <button onClick={onClose} className="tap" style={{ width:30, height:30, border:'none', borderRadius:'50%', background:'var(--surface-2)', color:'var(--t3)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
            </button>
          </div>
        )}
        <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', padding: noPad ? 0 : '0 0 max(20px,env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
export function Header({ title, secondary, eyebrow, subtitle, onBack, actions, large=false }) {
  if (large) {
    return (
      <div style={{ padding:'14px 20px 16px', display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:8, flexShrink:0, background:'var(--surface)', borderBottom:'1px solid var(--border)', position:'relative' }}>
        {onBack && (
          <button onClick={onBack} className="tap" style={{ width:34, height:34, border:'none', borderRadius:10, background:'transparent', color:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, marginRight:2, alignSelf:'center' }}>
            <svg width="9" height="16" viewBox="0 0 9 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="8 1 1 8 8 15"/></svg>
          </button>
        )}
        <div style={{ flex:1, minWidth:0 }}>
          {eyebrow && <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.16em', textTransform:'uppercase', color:'var(--t4)', marginBottom:5 }}>{eyebrow}</div>}
          <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
            <span style={{ fontSize:30, fontWeight:700, letterSpacing:'-.028em', color:'var(--t1)', lineHeight:1, whiteSpace:'nowrap' }}>{title}</span>
            {secondary && <span style={{ fontSize:17, fontWeight:400, color:'var(--t4)', letterSpacing:'-.01em', lineHeight:1, whiteSpace:'nowrap' }}>{secondary}</span>}
          </div>
          {subtitle && <div style={{ fontSize:13, color:'var(--t3)', marginTop:6 }}>{subtitle}</div>}
        </div>
        {actions && <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0, paddingBottom:2 }}>{actions}</div>}
      </div>
    );
  }
  return (
    <div style={{ padding:'0 16px', height:54, display:'flex', alignItems:'center', gap:8, flexShrink:0, borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
      {onBack && (
        <button onClick={onBack} className="tap" style={{ width:36, height:36, border:'none', borderRadius:10, background:'transparent', color:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
          <svg width="9" height="16" viewBox="0 0 9 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="8 1 1 8 8 15"/></svg>
        </button>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:17, fontWeight:600, color:'var(--t1)', letterSpacing:'-.014em', lineHeight:1.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize:12.5, color:'var(--t3)', marginTop:2 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>{actions}</div>}
    </div>
  );
}

// ── HdrBtn ────────────────────────────────────────────────────────────────────
export function HdrBtn({ icon, onPress, badge, label, variant='ghost' }) {
  const styles = {
    ghost:   { background:'var(--surface-2)', border:'1px solid transparent', color:'var(--t2)' },
    outline: { background:'var(--surface)',   border:'1px solid var(--border)', color:'var(--t2)' },
    accent:  { background:'var(--accent-dim)',border:'1px solid var(--accent-border)', color:'var(--accent)' },
  }[variant] || {};
  return (
    <button onClick={onPress} title={label} aria-label={label} className="tap"
      style={{ width:38, height:38, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative', flexShrink:0, ...styles }}>
      {icon}
      {badge > 0 && <span style={{ position:'absolute', top:5, right:5, width:7, height:7, borderRadius:'50%', background:'var(--accent)', border:'1.5px solid var(--surface)' }}/>}
    </button>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────
export function TaskCard({ task, onOpen, onToggle, onDelete, onLongPress, showDate=false, showProject=true, compact=false, hidden=false }) {
  const { PROJECTS, ALL_TAGS, TAG_COLORS, PRI } = useData();
  const theme = useTheme();
  const [justDone, setJustDone] = useState(false);
  const [sparks,   setSparks]   = useState(false);
  const [pressing, setPressing] = useState(false);

  const proj  = PROJECTS.find(p => p.id === task.project);
  const tagId = task.tags?.[0];
  const tc    = tagId ? TAG_COLORS[tagId] : null;
  const isDark = theme === 'dark';

  const lockRef = useRef(false);
  const { ref: swipeRef, dx: swipeX, swiping, settled, reset: resetSwipe } = useSwipeable({
    onSwipedRight: () => onToggle?.(task.id),
    lockedRef: lockRef,
  });

  useEffect(() => {
    const el = swipeRef.current;
    if (!el || !onLongPress) return;
    let timer = null, sx = 0, sy = 0, pid = null, fired = false;

    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      setPressing(false);
      lockRef.current = false;
      pid = null;
    };
    const onDown = (e) => {
      if (e.target.closest('button')) return;
      if (settled === 'left') return;
      sx = e.clientX; sy = e.clientY; pid = e.pointerId; fired = false;
      setPressing(true);
      timer = setTimeout(() => {
        timer = null; fired = true;
        lockRef.current = true;
        const rect = el.getBoundingClientRect();
        onLongPress(task, { x: sx, y: sy, rect });
      }, 380);
    };
    const onMove = (e) => {
      if (timer == null || e.pointerId !== pid) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) cancel();
    };
    const onUp = () => { if (!fired) cancel(); else { setPressing(false); lockRef.current = false; } };

    el.addEventListener('pointerdown',   onDown);
    el.addEventListener('pointermove',   onMove);
    el.addEventListener('pointerup',     onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown',   onDown);
      el.removeEventListener('pointermove',   onMove);
      el.removeEventListener('pointerup',     onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [onLongPress, task, settled]);

  const handleTap = () => {
    if (settled === 'left') { resetSwipe(); return; }
    if (Math.abs(swipeX) > 6) { resetSwipe(); return; }
    onOpen?.(task.id);
  };
  const handleCheck = e => {
    e.stopPropagation();
    if (!task.done) {
      setJustDone(true); setSparks(true);
      setTimeout(() => setJustDone(false), 520);
      setTimeout(() => setSparks(false), 750);
      haptic([8, 5, 16]);
    } else { haptic([4]); }
    onToggle?.(task.id);
  };

  const priInfo  = PRI[task.priority] || PRI.p3;
  const overdue  = task.date && D.isPst(task.date) && !task.done;
  const hasDue   = task.dueDate && task.dueDate <= TODAY;

  const showActions = swiping || swipeX !== 0 || settled === 'left';
  return (
    <div style={{ position:'relative', marginBottom:4, userSelect:'none', opacity: hidden ? 0 : 1, transition:'opacity .18s ease' }}>
      <div style={{ position:'absolute', inset:0, borderRadius:'var(--rk,10px)', overflow:'hidden', display:'flex', opacity: showActions ? 1 : 0, transition:'opacity .12s ease' }}>
        <div style={{ width:80, background:'#10b981', display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ flex:1 }}/>
        <div style={{ width:88, background:'#ef4444', display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7M6 7l1 12.5A2 2 0 0 0 9 21h6a2 2 0 0 0 2-1.5L18 7"/></svg>
        </div>
      </div>
      <div
        ref={swipeRef}
        onClick={handleTap}
        style={{
          background: task.done ? 'var(--surface-2)' : 'var(--surface)',
          border:`1px solid ${overdue ? 'rgba(239,68,68,.32)' : 'var(--border)'}`,
          borderRadius:'var(--rk,10px)', padding: compact ? '10px 14px' : '12px 14px 12px 12px',
          transform:`translateX(${swipeX}px) scale(${pressing && swipeX===0 ? 0.985 : 1})`,
          transition: swiping ? 'transform 0s' : 'transform .36s var(--ease-spring), box-shadow .2s ease',
          position:'relative', cursor:'pointer', opacity: task.done ? 0.55 : 1,
          touchAction: 'pan-y',
          boxShadow: pressing && swipeX===0
            ? '0 0 0 2px var(--accent-dim), 0 6px 22px rgba(13,23,20,.10)'
            : overdue ? '0 1px 2px rgba(239,68,68,.06)' : 'var(--shadow-sm)',
        }}
      >
        {settled === 'left' && (
          <div style={{ position:'absolute', inset:0, zIndex:10 }} onClick={e => { e.stopPropagation(); onDelete?.(task.id); }}/>
        )}
        <div style={{ display:'flex', alignItems:'flex-start', gap:11 }}>
          <div style={{ position:'relative', flexShrink:0, marginTop:1 }}>
            <button onClick={handleCheck} aria-label={task.done?'Mark incomplete':'Mark complete'}
              style={{ width:22, height:22, borderRadius:'50%', border:`2px solid ${task.done ? 'var(--accent)' : 'var(--border-strong)'}`, background: task.done ? 'var(--accent)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', animation: justDone ? 'mob-checkPop .52s var(--ease-spring)' : 'none', transition:'background .18s, border-color .18s', flexShrink:0 }}>
              {task.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" style={{ strokeDasharray:20, animation: justDone ? 'mob-checkDraw .28s ease .08s both' : 'none' }}><polyline points="20 6 9 17 4 12"/></svg>}
            </button>
            {sparks && [0,60,120,180,240,300].map((deg, i) => {
              const rad = deg * Math.PI / 180, r = 22;
              return <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:5, height:5, borderRadius:'50%', marginTop:-2.5, marginLeft:-2.5, background:['#0f766e','#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6'][i], animation:`mob-particleFly .65s ease-out ${i*0.04}s both`, '--tx':`${Math.cos(rad)*r}px`, '--ty':`${Math.sin(rad)*r}px`, pointerEvents:'none', zIndex:20 }}/>;
            })}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14.5, fontWeight:500, color: task.done ? 'var(--t3)' : overdue ? '#ef4444' : 'var(--t1)', lineHeight:1.4, marginBottom: (task.priority!=='p3'||proj||tc||(showDate&&task.date)||task.timeEstimate||task.delegatedTo||task.snoozedUntil||task.dueDate||task.blocked) ? 5 : 0, textDecoration: task.done ? 'line-through' : 'none', textWrap:'pretty', letterSpacing:'-.005em' }}>
              {task.recurrence && <span style={{ marginRight:5, opacity:.55, fontSize:11, display:'inline-block', verticalAlign:'1px' }}>↻</span>}
              {task.blocked && <span style={{ marginRight:5, fontSize:11 }}>⏸</span>}
              {task.title}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:'4px 8px' }}>
              {task.priority !== 'p3' && <span style={{ fontSize:11, fontWeight:700, color:priInfo.color, letterSpacing:'.06em' }}>{task.priority==='p1'?'●●●':'●●'}</span>}
              {showProject && proj && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, color:'var(--t3)', fontWeight:500 }}>
                  <span style={{ width:6, height:6, borderRadius:2, background:proj.color, display:'inline-block', flexShrink:0 }}/>
                  {proj.label}
                </span>
              )}
              {tc && tagId && (
                <span style={{ fontSize:10.5, padding:'1.5px 7px', borderRadius:5, background: isDark ? tc.bd : tc.bl, color: isDark ? tc.d : tc.l, fontWeight:600, letterSpacing:'.01em' }}>
                  {ALL_TAGS[tagId] || tagId}
                </span>
              )}
              {showDate && task.date && <span style={{ fontSize:11.5, color: overdue ? '#ef4444' : 'var(--t3)', fontWeight: overdue ? 600 : 500 }}>{D.fmt(task.date)}</span>}
              {task.timeEstimate && <span style={{ fontSize:11, color:'var(--t4)', display:'inline-flex', alignItems:'center', gap:3, fontVariantNumeric:'tabular-nums' }}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>{task.timeEstimate}</span>}
              {task.delegatedTo && <span style={{ fontSize:10.5, padding:'1.5px 7px', borderRadius:5, background:'rgba(99,102,241,.15)', color:'#818cf8', fontWeight:600 }}>→ {task.delegatedTo}</span>}
              {task.snoozedUntil && <span style={{ fontSize:11, color:'#f59e0b', fontWeight:500 }}>💤 {D.fmt(task.snoozedUntil)}</span>}
              {(task.dueDate||task.blocked) && (
                <span style={{ fontSize:10.5, padding:'1.5px 7px', borderRadius:5, background: task.blocked ? 'rgba(239,68,68,.14)' : hasDue ? 'rgba(239,68,68,.14)' : 'transparent', color:'#ef4444', fontWeight:600, letterSpacing:'.01em' }}>
                  {task.blocked ? 'Blocked' : `Due ${D.fmt(task.dueDate)}`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({ icon='✓', title, body }) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'56px 32px 80px', textAlign:'center', gap:12, animation:'mob-fadeInUp .4s var(--ease-out) both' }}>
      <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, marginBottom:6, color:'var(--t3)' }}>{icon}</div>
      <div style={{ fontSize:17, fontWeight:600, color:'var(--t1)', letterSpacing:'-.012em' }}>{title}</div>
      {body && <div style={{ fontSize:13.5, color:'var(--t3)', lineHeight:1.55, maxWidth:260, textWrap:'pretty' }}>{body}</div>}
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
export function SectionHeader({ label, count, right, onToggle, collapsed, accent }) {
  return (
    <div onClick={onToggle} style={{ display:'flex', alignItems:'center', gap:8, padding:'18px 20px 8px', cursor: onToggle ? 'pointer' : 'default', userSelect:'none' }}>
      {onToggle && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2.6" strokeLinecap="round" style={{ transition:'transform .2s var(--ease-out)', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9"/></svg>
      )}
      <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color: accent || 'var(--t4)' }}>{label}</span>
      {count != null && <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--t3)', background:'var(--surface-2)', padding:'2px 7px', borderRadius:99, fontWeight:600, lineHeight:1.4 }}>{count}</span>}
      {right && <span style={{ marginLeft:'auto', fontSize:12, color:'var(--t3)' }}>{right}</span>}
    </div>
  );
}

// ── ActionSheet ───────────────────────────────────────────────────────────────
export function ActionSheet({ open, onClose, title, items }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div style={{ padding:'6px 0 max(16px,env(safe-area-inset-bottom))' }}>
        {items.map((item, i) => item === 'sep'
          ? <div key={i} style={{ height:1, background:'var(--border)', margin:'6px 0' }}/>
          : (
            <button key={i} disabled={item.disabled} onClick={() => { item.onPress?.(); onClose?.(); }} className="tap"
              style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'14px 22px', border:'none', background:'transparent', cursor: item.disabled ? 'default' : 'pointer', textAlign:'left', opacity: item.disabled ? 0.4 : 1 }}>
              {item.dot && <span style={{ width:9, height:9, borderRadius:2, background:item.dot, display:'inline-block', flexShrink:0 }}/>}
              {item.icon && <span style={{ color: item.danger ? '#ef4444' : 'var(--t3)', display:'flex', flexShrink:0 }}>{item.icon}</span>}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15.5, color: item.danger ? '#ef4444' : 'var(--t1)', fontWeight: item.active ? 600 : 400, letterSpacing:'-.005em' }}>{item.label}</div>
                {item.sub && <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>{item.sub}</div>}
              </div>
              {item.active && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              {item.badge && <span style={{ fontSize:11, fontFamily:'monospace', color:'var(--t4)', background:'var(--surface-2)', padding:'2px 8px', borderRadius:99, fontWeight:600 }}>{item.badge}</span>}
            </button>
          )
        )}
      </div>
    </Sheet>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#6366f1','#10b981','#ec4899','#f59e0b','#3b82f6','#8b5cf6'];
export function Avatar({ name, size=32 }) {
  const c = AVATAR_COLORS[(name||'').charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:c, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:Math.floor(size*0.38), fontWeight:700, flexShrink:0, letterSpacing:'-.5px' }}>
      {(name||'?').slice(0,2).toUpperCase()}
    </div>
  );
}

// ── SegmentedControl ──────────────────────────────────────────────────────────
export function SegmentedControl({ options, value, onChange }) {
  return (
    <div style={{ display:'inline-flex', background:'var(--surface-2)', borderRadius:10, padding:3, gap:2 }}>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          style={{ padding:'6px 14px', borderRadius:8, border:'none', background: value===opt.value ? 'var(--surface)' : 'transparent', color: value===opt.value ? 'var(--t1)' : 'var(--t3)', fontSize:13, fontWeight: value===opt.value ? 600 : 400, cursor:'pointer', transition:'all .15s', boxShadow: value===opt.value ? '0 1px 4px rgba(0,0,0,.1)' : 'none', whiteSpace:'nowrap' }}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── CaptureBar ────────────────────────────────────────────────────────────────
export function CaptureBar({ placeholder='Add a task…', onSubmit }) {
  const [val, setVal] = useState('');
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);
  const submit = () => {
    if (!val.trim()) return;
    onSubmit(val.trim());
    setVal('');
  };
  const hasVal = !!val.trim();
  return (
    <div style={{ display:'flex', gap:8, padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:9, background:'var(--surface-2)', border:`1px solid ${focused ? 'var(--accent-border)' : 'var(--border)'}`, borderRadius:12, padding:'0 14px', height:44, transition:'border-color .2s, box-shadow .2s', boxShadow: focused ? '0 0 0 3px var(--accent-dim)' : 'none' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={focused?'var(--accent)':'var(--t4)'} strokeWidth="2.2" strokeLinecap="round" style={{ transition:'stroke .2s', flexShrink:0 }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onKeyDown={e => { if (e.key==='Enter') submit(); }}
          placeholder={placeholder}
          style={{ flex:1, border:'none', background:'transparent', color:'var(--t1)', fontSize:15, outline:'none', minWidth:0 }}/>
        {val && (
          <button onClick={() => setVal('')} aria-label="Clear" style={{ border:'none', background:'transparent', color:'var(--t4)', cursor:'pointer', fontSize:18, lineHeight:1, padding:'0 2px', flexShrink:0 }}>×</button>
        )}
      </div>
      <button onClick={submit} disabled={!hasVal} className="tap"
        style={{ width: hasVal ? 44 : 0, height:44, border:'none', borderRadius:12, background: hasVal ? 'var(--accent)' : 'transparent', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor: hasVal ? 'pointer' : 'default', flexShrink:0, overflow:'hidden', transition:'width .25s var(--ease-out), background .15s', padding:0 }}>
        {hasVal && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>}
      </button>
    </div>
  );
}

// ── StatusChip ────────────────────────────────────────────────────────────────
export function StatusChip({ status }) {
  const map = {
    waiting:     { label:'Waiting',     bg:'rgba(99,102,241,.14)',  color:'#818cf8' },
    in_progress: { label:'In Progress', bg:'rgba(16,185,129,.14)',  color:'#10b981' },
    heard_back:  { label:'Heard Back',  bg:'rgba(16,185,129,.14)',  color:'#10b981' },
    overdue:     { label:'Overdue',     bg:'rgba(239,68,68,.14)',   color:'#ef4444' },
    stale:       { label:'Stale',       bg:'rgba(245,158,11,.14)',  color:'#f59e0b' },
  };
  const s = map[status] || map.waiting;
  return <span style={{ fontSize:11, padding:'2px 9px', borderRadius:99, background:s.bg, color:s.color, fontWeight:600, letterSpacing:'.01em', whiteSpace:'nowrap' }}>{s.label}</span>;
}

// ── DetailRow ─────────────────────────────────────────────────────────────────
export function DetailRow({ label, children, last=false }) {
  return (
    <div style={{ display:'flex', alignItems:'center', minHeight:50, borderBottom: last ? 'none' : '1px solid var(--border)', padding:'4px 20px', gap:12 }}>
      <span style={{ flex:'0 0 100px', fontSize:13.5, color:'var(--t3)', fontWeight:500, letterSpacing:'-.005em' }}>{label}</span>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8, minWidth:0 }}>{children}</div>
    </div>
  );
}

// ── ProgressBar ───────────────────────────────────────────────────────────────
export function ProgressBar({ done, total }) {
  const pct = total > 0 ? (done/total)*100 : 0;
  const complete = done === total && total > 0;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 20px 10px' }}>
      <div style={{ flex:1, height:4, background:'var(--surface-2)', borderRadius:99, overflow:'hidden', position:'relative' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:complete ? '#10b981' : 'var(--accent)', borderRadius:99, transition:'width .5s var(--ease-out), background .3s' }}/>
      </div>
      <span style={{ fontSize:10.5, color: complete ? '#10b981' : 'var(--t3)', whiteSpace:'nowrap', fontFamily:'var(--mono)', fontWeight:700, fontVariantNumeric:'tabular-nums', minWidth:32, textAlign:'right' }}>{done}/{total}</span>
    </div>
  );
}
