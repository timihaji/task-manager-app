import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './springs';

// Damped harmonic oscillator integrated at 60Hz with sub-stepping for stability.
// Returns [value, kick(velocity)] — kick injects external velocity for overshoot.
// Snaps to target instantly when prefers-reduced-motion is set.
export function useSpring(target, { stiffness = 520, damping = 32, mass = 1, precision = 0.01 } = {}) {
  const reduced = useRef(prefersReducedMotion());
  const [value, setValue] = useState(target);
  const stateRef = useRef({ v: target, vel: 0, target });
  const rafRef = useRef(null);
  const lastRef = useRef(null);

  const tick = useCallback(() => {
    if (rafRef.current) return;
    if (reduced.current) {
      setValue(stateRef.current.target);
      stateRef.current.v = stateRef.current.target;
      stateRef.current.vel = 0;
      return;
    }
    lastRef.current = performance.now();
    const step = (now) => {
      const dt = Math.min(0.064, (now - lastRef.current) / 1000);
      lastRef.current = now;
      const s = stateRef.current;
      const sub = 4;
      const h = dt / sub;
      for (let i = 0; i < sub; i++) {
        const f = -stiffness * (s.v - s.target) - damping * s.vel;
        const a = f / mass;
        s.vel += a * h;
        s.v += s.vel * h;
      }
      const settled = Math.abs(s.vel) < precision && Math.abs(s.v - s.target) < precision;
      if (settled) {
        s.v = s.target; s.vel = 0;
        setValue(s.target);
        rafRef.current = null;
      } else {
        setValue(s.v);
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [stiffness, damping, mass, precision]);

  useEffect(() => {
    stateRef.current.target = target;
    tick();
  }, [target, tick]);

  const kick = useCallback((vel) => {
    if (reduced.current) return;
    stateRef.current.vel += vel;
    tick();
  }, [tick]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return [value, kick];
}
