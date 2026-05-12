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
// Resolution order:
//   0. Cursor inside an EXPANDED project body — cursor X decides depth:
//      • Right ~55% of the project card → over = closest subtask by cursor Y
//        (positional nest). Top/bottom 8px of body → over = body itself
//        (nest-first / nest-last).
//      • Left ~45% → over = the project card itself (drop = column sibling).
//      For internal drags (a subtask reordering within its own body), this
//      step is skipped so the standard sortable resolution kicks in.
//      Rects are read via getBoundingClientRect directly (the MeasuringStrategy
//      cache goes stale after sortable shifts — see CLAUDE.md).
//   1. Cursor inside a specific (card-level) droppable → that wins.
//   2. Cursor inside a container (column, group, or project-body for internal
//      drags) → resolve to the closest card in that container so the sortable
//      strategy can shift items smoothly across gaps.
//   3. Outside everything → closestCenter / rectIntersection fallback.
// routine-strip is the per-column routines pill area. It sits geometrically
// inside col-body so without registering it as specific, the column always
// wins collision. Drops on it would silently demote the routine (column-body
// path) instead of routing through the reschedule branch.
const SPECIFIC_KINDS = new Set(['task', 'stack-task', 'routine-strip']);
const CONTAINER_KINDS = new Set(['column', 'group-target', 'project-body']);
const NEST_EDGE_PX = 8;     // top strip inside body → nest as first child

export function compositeCollisionDetection(args) {
  const pointer = args.pointerCoordinates;

  // Step 0: cursor inside an EXPANDED project body — route based on what the
  // cursor is hovering, not on cursor X. Hitting a subtask = positional nest at
  // that subtask. Hitting body padding/gap = fall through to the closest
  // top-level sibling (drop "under the project" works naturally). Top 8px =
  // nest as first child. This applies symmetrically to external drags
  // (dragging into the project) and internal drags (dragging a subtask out
  // of its own project) — without symmetry, internal drags can't escape the
  // body because closest-subtask routing always pulls the active task back.
  if (pointer) {
    const pointerHits = pointerWithin(args);
    for (const cont of args.droppableContainers) {
      const d = cont.data?.current;
      if (d?.kind !== 'project-body') continue;
      const bodyNode = cont.node?.current;
      if (!bodyNode) continue;
      const bodyRect = bodyNode.getBoundingClientRect();
      if (pointer.x < bodyRect.left || pointer.x > bodyRect.right) continue;
      if (pointer.y < bodyRect.top || pointer.y > bodyRect.bottom) continue;
      const targetId = d.targetId;

      // a) Top 8px → nest as first child.
      if (pointer.y - bodyRect.top <= NEST_EDGE_PX) {
        return [{ id: cont.id, data: { droppableContainer: cont, value: 0 } }];
      }
      // b) Cursor on a subtask of this body → positional nest at that subtask.
      //    For internal drag, this is the normal sortable reorder path; the
      //    active item itself is included so dnd-kit's strategy keeps shifting
      //    cleanly even when the cursor sits on the source.
      const subtaskHit = pointerHits.find(c => {
        const cd = c.data?.droppableContainer?.data?.current;
        return cd?.kind === 'task' && cd?.parentId === targetId;
      });
      if (subtaskHit) return [subtaskHit];
      // b2) Fresh / empty project — body has no subtask droppables. The
      //     fall-through "closest sibling" path below would route the drop to
      //     the project's neighbour instead of into the project, making it
      //     impossible to drop into a newly-created project except by hitting
      //     the 8px nest edge. Return the body itself so the drop nests.
      const hasSubtaskDroppable = args.droppableContainers.some(c => {
        const cd = c.data?.current;
        return cd?.kind === 'task' && cd?.parentId === targetId;
      });
      if (!hasSubtaskDroppable) {
        return [{ id: cont.id, data: { droppableContainer: cont, value: 0 } }];
      }
      // c) Cursor in body padding/gap (not on a subtask) → fall through to the
      //    closest top-level sibling so "drop under the project" becomes a
      //    sibling reorder. Same path lets an internal drag escape the body
      //    when the cursor leaves the subtask column without exiting the
      //    body's geometric bounds.
      let closestSib = null;
      let minDist = Infinity;
      for (const c of args.droppableContainers) {
        const cd = c.data?.current;
        if (cd?.kind !== 'task' || cd.parentId) continue;
        const n = c.node?.current;
        if (!n) continue;
        const r = n.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const dist = Math.abs(pointer.y - mid);
        if (dist < minDist) { minDist = dist; closestSib = c; }
      }
      if (closestSib) return [{ id: closestSib.id, data: { droppableContainer: closestSib, value: minDist } }];
      break;
    }
  }

  const pointerCollisions = pointerWithin(args);

  // 1. Cursor inside a specific (card-level) droppable
  const specific = pointerCollisions.filter(c => {
    const k = c.data?.droppableContainer?.data?.current?.kind;
    return SPECIFIC_KINDS.has(k);
  });
  if (specific.length > 0) return specific;

  // 2. Cursor inside a container (column, group, or project-body for internal
  //    drags). Find the closest card *in that container* so sortable can
  //    transform without flicker.
  const container = pointerCollisions.find(c => {
    const k = c.data?.droppableContainer?.data?.current?.kind;
    return CONTAINER_KINDS.has(k);
  });
  if (container) {
    const cd = container.data.droppableContainer.data.current;
    const allClosest = closestCenter(args);
    const sameCol = allClosest.find(c2 => {
      const dd = c2.data?.droppableContainer?.data?.current;
      if (!dd) return false;
      if (dd.kind !== 'task' && dd.kind !== 'stack-task') return false;
      if (cd.kind === 'project-body') return dd.parentId === cd.targetId;
      if (cd.kind === 'column') {
        // Top-level cards only. Subtasks of an expanded project also live in
        // the same column-date "namespace", but routing to one via the column
        // fall-through would re-nest an internal drag (a subtask trying to
        // escape its parent) because dndOnDragEnd's subtask branch always
        // re-anchors to the parent. Subtasks are still reachable via Step 0
        // (project-body) when the cursor is actually inside a body.
        return (dd.date ?? null) === (cd.date ?? null) && !dd.parentId;
      }
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
