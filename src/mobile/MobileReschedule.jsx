import React, { useState, useRef, useCallback } from 'react';

// Long-press a task → screen "zooms out" + the week strip becomes drop tiles.
// Drag the floating ghost to a day and release to reschedule.

export function useReschedule({ updateTask, TODAY }) {
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  dragRef.current = drag;

  const start = useCallback((task, init) => {
    if (navigator.vibrate) navigator.vibrate(12);
    const startDay = task.date || TODAY;
    setDrag({
      task,
      x: init.x, y: init.y,
      ox: init.x, oy: init.y,
      hoverDay: startDay,
      originDay: startDay,
      phase: 'opening',
      targetRect: null,
      cardWidth: init.rect.width, cardHeight: init.rect.height,
      originX: init.rect.left, originY: init.rect.top,
    });

    setTimeout(() => {
      setDrag(d => d && { ...d, phase: 'dragging' });
    }, 60);

    const onMove = (e) => {
      e.preventDefault?.();
      const x = e.clientX, y = e.clientY;
      const el = document.elementFromPoint(x, y);
      const tile = el && el.closest && el.closest('[data-drop-day]');
      const hoverDay = tile ? tile.getAttribute('data-drop-day') : null;
      const targetRect = tile ? tile.getBoundingClientRect() : null;
      setDrag(d => d && { ...d, x, y, hoverDay, targetRect });
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);

      const d = dragRef.current;
      if (!d) return;

      if (d.hoverDay && d.hoverDay !== d.originDay) {
        if (navigator.vibrate) navigator.vibrate([6, 28, 14]);
        setDrag(s => s && { ...s, phase: 'dropping' });
        setTimeout(() => {
          updateTask(d.task.id, { date: d.hoverDay });
          setDrag(null);
        }, 340);
      } else {
        setDrag(s => s && { ...s, phase: 'cancelling', hoverDay: null, targetRect: null });
        setTimeout(() => setDrag(null), 280);
      }
    };

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }, [updateTask, TODAY]);

  return { drag, startLongPress: start };
}

export function DropTile({ day, dayTasks, isOrigin, isHover, isToday, label, daynum, weekday, openDelay }) {
  return (
    <div
      data-drop-day={day}
      style={{
        flex:1, minWidth:0,
        display:'flex', flexDirection:'column',
        background: isHover ? 'var(--accent)' : 'var(--surface)',
        color: isHover ? '#fff' : 'var(--t1)',
        borderRadius:14,
        border: `1.5px ${isOrigin ? 'dashed' : 'solid'} ${isHover ? 'var(--accent)' : isOrigin ? 'var(--accent-border)' : 'var(--border)'}`,
        padding:'10px 8px 9px',
        boxShadow: isHover
          ? '0 8px 24px var(--accent-dim), 0 2px 8px rgba(15,118,110,.18)'
          : '0 1px 2px rgba(13,23,20,.04)',
        transform: `translateY(0) scale(${isHover ? 1.06 : 1})`,
        transition: 'transform .28s var(--ease-spring), background .18s ease, border-color .18s ease, box-shadow .22s ease, color .18s ease',
        animation: `mob-tileIn .42s var(--ease-spring) ${openDelay}ms both`,
        position:'relative', overflow:'hidden',
        pointerEvents:'auto',
      }}
    >
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, pointerEvents:'none' }}>
        <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'.10em', textTransform:'uppercase',
                       color: isHover ? 'rgba(255,255,255,.85)' : isToday ? 'var(--accent)' : 'var(--t4)' }}>
          {weekday}
        </span>
        <span style={{ fontSize:22, fontWeight:700, lineHeight:1, fontVariantNumeric:'tabular-nums', letterSpacing:'-.02em',
                       color: isHover ? '#fff' : 'var(--t1)' }}>
          {daynum}
        </span>
        <span style={{ fontSize:10, fontWeight:600, marginTop:1, letterSpacing:'.02em',
                       color: isHover ? 'rgba(255,255,255,.8)' : 'var(--t4)' }}>
          {label}
        </span>
      </div>
      <div style={{ display:'flex', justifyContent:'center', gap:3, marginTop:8, flexWrap:'wrap', pointerEvents:'none' }}>
        {dayTasks.slice(0,5).map((t,i) => (
          <span key={t.id} style={{ width:4, height:4, borderRadius:'50%',
            background: isHover ? 'rgba(255,255,255,.85)' : t.done ? 'var(--t4)' : 'var(--accent)',
            opacity: t.done ? .5 : 1 }}/>
        ))}
        {dayTasks.length > 5 && (
          <span style={{ fontSize:9, fontWeight:700,
                         color: isHover ? 'rgba(255,255,255,.85)' : 'var(--t4)' }}>
            +{dayTasks.length - 5}
          </span>
        )}
        {dayTasks.length === 0 && (
          <span style={{ fontSize:9, color: isHover ? 'rgba(255,255,255,.8)' : 'var(--t4)', fontStyle:'italic' }}>empty</span>
        )}
      </div>
      {isHover && (
        <div style={{ position:'absolute', inset:0, borderRadius:14, pointerEvents:'none',
                      background:'radial-gradient(circle at 50% 0%, rgba(255,255,255,.25), transparent 70%)',
                      animation:'mob-hoverPulse 1.4s ease-in-out infinite' }}/>
      )}
    </div>
  );
}

export function DragGhost({ drag, children }) {
  const isDrop = drag.phase === 'dropping';
  const isCancel = drag.phase === 'cancelling';

  let tx, ty, scale, rotate;
  if (isDrop && drag.targetRect) {
    tx = drag.targetRect.left + drag.targetRect.width/2 - drag.cardWidth/2;
    ty = drag.targetRect.top  + drag.targetRect.height/2 - drag.cardHeight/2;
    scale = 0.18; rotate = 0;
  } else if (isCancel) {
    tx = drag.originX; ty = drag.originY;
    scale = 1; rotate = 0;
  } else {
    tx = drag.x - drag.cardWidth/2;
    ty = drag.y - drag.cardHeight/2 - 18;
    scale = drag.phase === 'opening' ? 1.0 : 1.04;
    const dx = drag.x - drag.ox;
    rotate = Math.max(-4, Math.min(4, dx * 0.025));
  }

  return (
    <div style={{
      position:'fixed', left:0, top:0,
      width: drag.cardWidth, height: drag.cardHeight,
      transform: `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotate}deg)`,
      transition: (isDrop || isCancel)
        ? 'transform .34s var(--ease-out), opacity .34s ease'
        : 'transform .14s cubic-bezier(.2,.7,.3,1)',
      opacity: isDrop ? 0 : 1,
      pointerEvents:'none', zIndex:1001,
      filter:'drop-shadow(0 18px 32px rgba(13,23,20,.18)) drop-shadow(0 4px 10px rgba(13,23,20,.10))',
      willChange:'transform',
    }}>
      <div style={{
        transformOrigin:'center',
        animation: drag.phase === 'opening' ? 'mob-ghostLift .32s var(--ease-spring) both' : 'none',
      }}>
        {children}
      </div>
    </div>
  );
}
