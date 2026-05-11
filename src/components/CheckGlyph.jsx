import React from 'react';
import { useTapSpring } from '../hooks/useTapSpring.js';
import { SPRING } from '../hooks/springs.js';

// Morphing checkbox — circle fills, checkmark stroke draws via stroke-dashoffset.
// Wraps in useTapSpring so the glyph scales 0.92 → overshoots on click.
// Pass `interactive={false}` for display-only sites (e.g. ListView read-only).
export function CheckGlyph({
  done,
  size = 13,
  interactive = true,
  filled = 'var(--accent)',
  empty = 'var(--border-s)',
}) {
  const tap = useTapSpring({ pressedScale: 0.86, releaseKick: 3.0, spring: SPRING.bounce });
  const transform = interactive ? `scale(${tap.scale})` : undefined;
  const handlers = interactive ? tap.props : null;
  const r = 9;
  const C = 2 * Math.PI * r;
  const stroke = 1.6;

  return (
    <span
      {...(handlers || {})}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        transform,
        transformOrigin: 'center',
        flexShrink: 0,
        cursor: interactive ? 'pointer' : 'default',
        touchAction: 'none',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r={r}
          className="cg-circle"
          fill={done ? filled : 'transparent'}
          stroke={done ? filled : empty}
          strokeWidth={stroke}/>
        <path d="M6 11.4 L9.6 14.6 L15.5 8"
          className="cg-tick"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={C}
          strokeDashoffset={done ? 0 : C}/>
      </svg>
    </span>
  );
}
