// Decimal-position ordering. New tasks get a position between their
// neighbors so the list stays ordered without renumbering everything.
// Shared by desktop (App.jsx) and mobile (MobileData / useReorder).
//
// Returns 1 for an empty list, neighbor±1 for an end-of-list insert,
// (A+B)/2 between two cards, A+0.5 if the gap has collapsed to zero
// (rare — happens after thousands of inserts between the same pair).
export function computePosition(above, below) {
  const A = above && Number.isFinite(above.position) ? above.position : null;
  const B = below && Number.isFinite(below.position) ? below.position : null;
  if (A == null && B == null) return 1;
  if (A == null) return B - 1;
  if (B == null) return A + 1;
  if (Math.abs(B - A) < 1e-9) return A + 0.5;
  return (A + B) / 2;
}
