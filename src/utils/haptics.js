// Subtle haptic feedback for touch devices. No-op on desktop / unsupported
// browsers. Keep durations short (<= 15ms) — anything longer reads as "buzz."
//
// Call sites (added by polish review):
//   tap()    — checkbox toggle / completion
//   pickup() — drag start (long-press settle on touch)
//   drop()   — drag landing
export const tap    = () => { try { navigator.vibrate?.(8); }  catch {} };
export const pickup = () => { try { navigator.vibrate?.(12); } catch {} };
export const drop   = () => { try { navigator.vibrate?.(15); } catch {} };
