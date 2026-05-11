// Named spring presets — match the "Button Physics" reference plan.
// Stiffness/damping/mass tuned for a damped harmonic oscillator
// integrated at 60Hz (see useSpring.js).
export const SPRING = {
  tap:    { stiffness: 520, damping: 32, mass: 1   }, // quick presses, taps, toggles
  snap:   { stiffness: 340, damping: 26, mass: 1   }, // snap-to position, drop into slot
  heavy:  { stiffness: 180, damping: 22, mass: 1.4 }, // sheets, modals, weighted things
  bounce: { stiffness: 420, damping: 14, mass: 1   }, // confirmation, celebration
};

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
