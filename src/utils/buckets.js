// Bucket helpers — buckets are user-curated categorisation columns stored in
// tweaks (`tweaks.customGroups`, surfaced in the UI as "Buckets"). Each
// bucket is `{ id, name, color }`. Tasks reference a bucket via `task.groupId`
// (DB column: `bucket_id` post-migration-0011) and order within a bucket
// column via `task.bucketPosition`.
//
// We keep the legacy in-memory names `groupId` / `customGroups` to avoid a
// risky rename across the existing grouping/DnD codebase — only the
// user-facing vocabulary and the new Buckets view treat them as buckets.

import { computePosition } from './position.js';

// Resolve a bucket by id. Returns null if the id isn't in the list.
export function getBucket(buckets, id) {
  if (!id || !Array.isArray(buckets)) return null;
  return buckets.find(b => b?.id === id) || null;
}

// Decimal-position helper scoped to the bucket-column "manual sort" field.
// Thin wrapper over `computePosition` so reading bucket-view code makes the
// intent obvious. Both `above` and `below` are tasks with a `bucketPosition`
// field; either may be null (start/end of column).
export function computeBucketPosition(above, below) {
  // Adapt to computePosition's expectation that the field is named `position`.
  const a = above ? { position: above.bucketPosition } : null;
  const b = below ? { position: below.bucketPosition } : null;
  return computePosition(a, b);
}

// Returns a position guaranteed lower than every existing card in `columnTasks`.
// Used on assignment so newly-bucketed cards float to the top of the column
// (the user-chosen "most recently assigned first" default sort).
export function topOfColumnPosition(columnTasks) {
  const finitePositions = (columnTasks || [])
    .map(t => t?.bucketPosition)
    .filter(p => Number.isFinite(p));
  if (!finitePositions.length) return 1;
  const min = Math.min(...finitePositions);
  return min - 1;
}

// Sort a column's tasks by bucketPosition ascending. Tasks without a
// position fall to the bottom (treated as larger than any finite value).
export function sortByBucketPosition(tasks) {
  return (tasks || []).slice().sort((a, b) => {
    const pa = Number.isFinite(a?.bucketPosition) ? a.bucketPosition : Infinity;
    const pb = Number.isFinite(b?.bucketPosition) ? b.bucketPosition : Infinity;
    if (pa !== pb) return pa - pb;
    // Tie-break on createdAt so the order is stable.
    const ta = a?.createdAt || '';
    const tb = b?.createdAt || '';
    return ta < tb ? 1 : ta > tb ? -1 : 0;
  });
}

// Partition tasks into { byBucket: Map<bucketId, tasks[]>, unbucketed: tasks[] }.
// Tasks with a groupId that doesn't match any bucket in the valid list fall
// into `unbucketed` so a deleted bucket doesn't strand cards in a void.
export function partitionByBucket(tasks, buckets) {
  const valid = new Set((buckets || []).map(b => b?.id).filter(Boolean));
  const byBucket = new Map();
  const unbucketed = [];
  for (const t of tasks || []) {
    if (!t) continue;
    if (t.groupId && valid.has(t.groupId)) {
      if (!byBucket.has(t.groupId)) byBucket.set(t.groupId, []);
      byBucket.get(t.groupId).push(t);
    } else {
      unbucketed.push(t);
    }
  }
  return { byBucket, unbucketed };
}

// Mint a new bucket id. Lower-cased + timestamp-suffixed so it stays unique
// across rapid creates and never collides with the slug-style ids used by
// the old customGroups creator.
export function mkBucketId() {
  return `bk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
