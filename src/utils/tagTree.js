// Tag-tree helpers — `tweaks.tagTree` is a flat list of `{ id, name, color,
// parentId }` nodes. Tags on tasks are still stored as a `string[]` of tag
// ids on `task.tags`; the tree only adds hierarchy + managed metadata
// (rename / colour / nesting). A null `parentId` means top-level. A null
// `color` means inherit from the nearest ancestor with a non-null colour.
//
// We render tag chips on cards using `formatTagChip` honouring the
// `tweaks.tagChipFormat` setting ('parentLeaf' | 'leaf' | 'fullPath').

// Build a quick {id -> node} index. Returns a Map for O(1) lookup.
export function indexTree(tree) {
  const idx = new Map();
  for (const node of tree || []) {
    if (node?.id) idx.set(node.id, node);
  }
  return idx;
}

// Resolve the chain of ancestors from a tag's root down to the tag itself.
// Returns an array of nodes ordered [root, ..., leaf]. Returns [] if the id
// isn't found. Defends against parentId cycles by capping iterations.
export function tagPath(tree, id) {
  const idx = indexTree(tree);
  const path = [];
  let cur = idx.get(id);
  const seen = new Set();
  for (let safety = 0; safety < 64 && cur; safety += 1) {
    if (seen.has(cur.id)) break; // cycle guard
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? idx.get(cur.parentId) : null;
  }
  return path;
}

// Walk up the parent chain to find the first node with a non-null colour.
// Returns null if nothing in the chain has one (let the caller pick a default).
export function resolveTagColor(tree, id) {
  const path = tagPath(tree, id);
  for (let i = path.length - 1; i >= 0; i -= 1) {
    if (path[i]?.color) return path[i].color;
  }
  return null;
}

// Format a tag's display string per the user's chosen format setting.
// `path` is the array returned by `tagPath`.
export function formatTagChip(path, format = 'parentLeaf') {
  if (!path?.length) return '';
  const names = path.map(n => n?.name || n?.id || '');
  if (format === 'leaf') return names[names.length - 1];
  if (format === 'fullPath') return names.join(' / ');
  // 'parentLeaf' (default): parent + leaf, or just leaf if depth ≤ 1.
  if (names.length <= 1) return names[0];
  return `${names[names.length - 2]} / ${names[names.length - 1]}`;
}

// All descendants of a tag (depth-first, not including the node itself).
// Used by the Tags view's right pane (selecting a parent shows tasks tagged
// with the parent OR any descendant) and by cascade-delete.
export function descendantsOf(tree, id) {
  const result = [];
  const stack = [id];
  const idx = indexTree(tree);
  while (stack.length) {
    const cur = stack.pop();
    for (const node of tree || []) {
      if (node?.parentId === cur && idx.has(node.id)) {
        result.push(node);
        stack.push(node.id);
      }
    }
  }
  return result;
}

// Delete a tag plus all its descendants. Returns a new tree array.
export function deleteTagCascade(tree, id) {
  const doomed = new Set([id, ...descendantsOf(tree, id).map(n => n.id)]);
  return (tree || []).filter(n => !doomed.has(n?.id));
}

// Delete a tag but promote its direct children to the deleted tag's parent
// (so the grandchildren keep their place in the hierarchy). Returns a new
// tree array.
export function deleteTagPromote(tree, id) {
  const node = (tree || []).find(n => n?.id === id);
  if (!node) return tree || [];
  const newParentId = node.parentId ?? null;
  return (tree || [])
    .filter(n => n?.id !== id)
    .map(n => (n?.parentId === id ? { ...n, parentId: newParentId } : n));
}

// Returns true if `ancestorId` is a strict ancestor of `descendantId` in
// the tree. Used by the tag-tree editor to prevent making a tag a child of
// itself or one of its own descendants (which would create a cycle).
export function isAncestor(tree, ancestorId, descendantId) {
  if (!ancestorId || !descendantId) return false;
  const path = tagPath(tree, descendantId);
  return path.some(n => n.id === ancestorId && n.id !== descendantId);
}

// Stable, lowercase id generator for new tags. Slugifies the name; on
// collision (or empty input) falls back to a random suffix.
export function mkTagId(name, existingIds = new Set()) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base && !existingIds.has(base)) return base;
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'tag'}-${suffix}`;
}
