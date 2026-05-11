import React, { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../hooks/springs.js';

// Hold-to-confirm button. Press → progress fills over `ms`. Release before
// commit → progress decays at `decayRate` units/sec. Reaching 1 fires
// `onCommit` once. Reduced-motion users get a single click handler instead.
export function HoldButton({ onCommit, ms = 900, decayRate = 2.4, className = '', children, ...rest }) {
  const [pct, setPct] = useState(0);
  const [committed, setCommitted] = useState(false);
  const heldRef = useRef(false);
  const rafRef = useRef(null);
  const lastRef = useRef(0);
  const reducedRef = useRef(false);

  useEffect(() => { reducedRef.current = prefersReducedMotion(); }, []);
  useEffect(() => () => rafRef.current && cancelAnimationFrame(rafRef.current), []);

  if (reducedRef.current) {
    return (
      <button className={`hold-btn ${className}`} onClick={onCommit} {...rest}>
        <span className="hold-btn-label">{children}</span>
      </button>
    );
  }

  const startHold = (e) => {
    if (committed) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    heldRef.current = true;
    lastRef.current = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (now) => {
      if (!heldRef.current) return;
      const dt = now - lastRef.current; lastRef.current = now;
      setPct(p => {
        const next = p + dt / ms;
        if (next >= 1) {
          heldRef.current = false;
          setCommitted(true);
          // Fire onCommit on the next tick to let the fill paint at 100%.
          setTimeout(() => onCommit?.(), 60);
          return 1;
        }
        rafRef.current = requestAnimationFrame(step);
        return next;
      });
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const endHold = () => {
    if (committed) return;
    heldRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    let last = performance.now();
    const decay = (now) => {
      const dt = (now - last) / 1000; last = now;
      setPct(p => {
        const next = Math.max(0, p - dt * decayRate);
        if (next > 0) rafRef.current = requestAnimationFrame(decay);
        return next;
      });
    };
    rafRef.current = requestAnimationFrame(decay);
  };

  return (
    <button
      className={`hold-btn${committed ? ' committed' : ''} ${className}`}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onPointerLeave={endHold}
      type="button"
      {...rest}
    >
      <span className="hold-btn-fill" style={{ transform: `scaleX(${pct})` }}/>
      <span className="hold-btn-label">{committed ? 'Done' : children}</span>
    </button>
  );
}
