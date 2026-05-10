// Shared @dnd-kit configuration and helpers used by every drag-enabled view.
// One DndContext lives at App.jsx; every TaskCard / draggable goes through
// useSortable or useDroppable from this module so the four drag contexts
// (Stack, Timeline, Project nesting, Custom groups) share one input layer.

import {
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  closestCenter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

// Composite collision detection used by every drag in the app.
//
// The challenge: dnd-kit's verticalListSortingStrategy only animates the
// other items shifting (and the active source snapping into a slot) when
// `over` is itself a sortable item. If `over` is the column-level
// droppable (cursor in a gap between cards, or in empty column space),
// transforms reset to identity → the source flickers back to its
// original position between every gap.
//
// Resolution order:
//   1. Cursor INSIDE a card/project-target → that wins (most specific).
//   2. Cursor INSIDE a column or group container but not a card → resolve
//      to the closest card *within that container*. Sortable then
//      transforms cards in that column smoothly across gaps. If the
//      container is empty, return the container itself (drop at end).
//   3. Cursor outside everything → closestCenter / rectIntersection
//      fallback.
const SPECIFIC_KINDS = new Set(['task', 'stack-task', 'project-target']);
const CONTAINER_KINDS = new Set(['column', 'group-target']);

export function compositeCollisionDetection(args) {
  const pointerCollisions = pointerWithin(args);

  // 1. Cursor inside a specific (card-level) droppable
  const specific = pointerCollisions.filter(c => {
    const k = c.data?.droppableContainer?.data?.current?.kind;
    return SPECIFIC_KINDS.has(k);
  });
  if (specific.length > 0) {
    // If multiple specifics, prefer task over project-target (drop on a
    // card to nest is wide; drop on a child reorders directly).
    return [...specific].sort((a, b) => {
      const aK = a.data?.droppableContainer?.data?.current?.kind;
      const bK = b.data?.droppableContainer?.data?.current?.kind;
      const order = { 'task': 0, 'stack-task': 0, 'project-target': 1 };
      return (order[aK] ?? 2) - (order[bK] ?? 2);
    });
  }

  // 2. Cursor inside a container (column or group). Find the closest card
  //    in the same column so the active item gets a transform (no flicker
  //    in column gaps). If the container is empty (no matching cards), the
  //    container itself is the over-target so onDragEnd can drop at end.
  const container = pointerCollisions.find(c => {
    const k = c.data?.droppableContainer?.data?.current?.kind;
    return CONTAINER_KINDS.has(k);
  });
  if (container) {
    const cd = container.data.droppableContainer.data.current;
    // Run closestCenter across ALL droppables (not a filtered subset — that
    // path froze the renderer because dnd-kit's closestCenter expected the
    // full collection identity), then pick the first match that lives in
    // the same column as the cursor.
    const allClosest = closestCenter(args);
    const sameCol = allClosest.find(c2 => {
      const dd = c2.data?.droppableContainer?.data?.current;
      if (!dd) return false;
      if (dd.kind !== 'task' && dd.kind !== 'stack-task') return false;
      if (cd.kind === 'column') return (dd.date ?? null) === (cd.date ?? null);
      return true; // group: any matching card
    });
    if (sameCol) return [sameCol];
    return [container];
  }

  // 3. Outside everything — fall back
  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) return rectCollisions;
  return closestCenter(args);
}

// Sensor config:
//  - PointerSensor with 4px activation distance: shorter than the dnd-kit
//    default of 8 because the user perceives 8px as a noticeable "stuck"
//    moment before the card lifts. 4px still avoids accidental drags from
//    a single click — click handlers fire if the pointer hasn't moved.
//  - TouchSensor with 200ms delay: long-press to drag on phones; replaces the
//    custom useTouchDrag hook (which used 350ms). 200ms feels snappy without
//    swallowing scroll gestures.
//  - KeyboardSensor: free a11y. Tab to a card, Space to pick up, arrows to
//    move, Space to drop.
export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

// Resolve the insertion index for a sortable drop. dnd-kit's sortable
// hook stores the live index in over.data.current.sortable.index; we fall
// back to the over node's id position when the over target isn't itself a
// sortable item (e.g. an empty column body acting purely as a droppable).
export function getInsertionIndex(over, idsInTarget) {
  if (!over) return -1;
  const sIdx = over.data?.current?.sortable?.index;
  if (typeof sIdx === 'number') return sIdx;
  if (Array.isArray(idsInTarget)) {
    const i = idsInTarget.indexOf(String(over.id));
    if (i >= 0) return i;
  }
  return idsInTarget ? idsInTarget.length : 0;
}
