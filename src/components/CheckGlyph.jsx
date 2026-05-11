import React, { useEffect, useRef, useState } from 'react';
import { useTapSpring } from '../hooks/useTapSpring.js';
import { useSpring } from '../hooks/useSpring.js';
import { SPRING } from '../hooks/springs.js';

// Morphing checkbox — circle fills, checkmark stroke draws via stroke-dashoffset.
// On done false→true, kicks an extra spring (celebration overshoot) and emits a
// ring burst that expands and fades. Press/release adds a tap spring on top.
export function CheckGlyph({
  done,
  size = 13,
  interactive = true,
  filled = 'var(--accent)',
  empty = 'var(--border-s)',
}) {
  const tap = useTapSpring({ pressedScale: 0.84, releaseKick: 1.6, spring: SPRING.bounce });
  const [doneScale, doneKick] = useSpring(1, SPRING.bounce);
  const [burstKey, setBurstKey] = useState(0);
  const prevDone = useRef(done);

  useEffect(() => {
    if (prevDone.current === done) return;
    if (done) {
      doneKick(5);                 // celebratory overshoot
      setBurstKey(k => k + 1);     // (re)triggers the ring burst animation
    } else {
      doneKick(-1.8);              // softer reverse pulse on un-check
    }
    prevDone.current = done;
  }, [done, doneKick]);

  const combinedScale = (interactive ? tap.scale : 1) * doneScale;
  const handlers = interactive ? tap.props : null;
  const r = 9;
  const C = 2 * Math.PI * r;
  const stroke = 1.6;

  return (
    <span
      {...(handlers || {})}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        transform: `scale(${combinedScale})`,
        transformOrigin: 'center',
        flexShrink: 0,
        cursor: interactive ? 'pointer' : 'default',
        touchAction: 'none',
        overflow: 'visible',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden style={{ overflow: 'visible' }}>
        {burstKey > 0 && done && (
          <circle
            key={burstKey}
            className="cg-burst"
            cx="11" cy="11" r={r}
            fill="none"
            stroke={filled}
            strokeWidth="2"
          />
        )}
        <circle
          cx="11" cy="11" r={r}
          className="cg-circle"
          fill={done ? filled : 'transparent'}
          stroke={done ? filled : empty}
          strokeWidth={stroke}
        />
        <path
          d="M6 11.4 L9.6 14.6 L15.5 8"
          className="cg-tick"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={C}
          strokeDashoffset={done ? 0 : C}
        />
      </svg>
    </span>
  );
}
