import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './springs';

// Magnetic button — when the cursor enters the container's bounding box and
// is within `range` pixels of the button center, the button drifts toward the
// cursor by `pull * delta`. Snaps back to origin on leave or release.
//
// Usage:
//   const [btnRef, magnet] = useMagnet({ range: 90, pull: 0.45 });
//   <div onPointerMove={magnet.onPointerMove} onPointerLeave={magnet.onPointerLeave}>
//     <button ref={btnRef} style={{ transform: magnet.transform }}>+</button>
//   </div>
export function useMagnet({ range = 90, pull = 0.45 } = {}) {
  const ref = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const reducedRef = useRef(false);

  useEffect(() => { reducedRef.current = prefersReducedMotion(); }, []);

  const onPointerMove = (e) => {
    if (reducedRef.current || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < range) {
      const k = (1 - dist / range) * pull;
      setOffset({ x: dx * k, y: dy * k });
    } else {
      setOffset({ x: 0, y: 0 });
    }
  };
  const onPointerLeave = () => setOffset({ x: 0, y: 0 });

  return [ref, {
    onPointerMove,
    onPointerLeave,
    transform: `translate(${offset.x.toFixed(2)}px, ${offset.y.toFixed(2)}px)`,
    active: offset.x !== 0 || offset.y !== 0,
  }];
}
