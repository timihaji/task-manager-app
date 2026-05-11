import { useCallback, useState } from 'react';
import { useSpring } from './useSpring';
import { SPRING } from './springs';

// Pairs useSpring with pointer handlers for press-with-overshoot feel.
// Press → scales target to `pressedScale`; release → kicks velocity outward
// so the rebound overshoots past 1 and settles. CSS :active still fires for
// keyboard activation; this hook layers a spring on top for primary buttons.
export function useTapSpring({
  pressedScale = 0.92,
  releaseKick = 2.4,
  spring = SPRING.tap,
} = {}) {
  const [pressed, setPressed] = useState(false);
  const [scale, kick] = useSpring(pressed ? pressedScale : 1, spring);

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    setPressed(true);
  }, []);

  const release = useCallback(() => {
    setPressed(prev => {
      if (prev) kick(releaseKick);
      return false;
    });
  }, [kick, releaseKick]);

  return {
    scale,
    pressed,
    props: {
      onPointerDown,
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: release,
    },
  };
}
