// TagsView — tree on the left, filtered task list on the right.
//
// Built over `tweaks.tagTree`, a flat list of `{ id, name, color, parentId }`
// nodes. Clicking a tag in the tree filters the right pane to tasks tagged
// with that tag OR any descendant (so picking a parent shows the union).
//
// v1 scope:
//  - render the tree (collapsible per parent)
//  - select a tag → right pane lists matching tasks (uses TaskCard)
//  - add child tag inline ("+" affordance on each node)
//  - add top-level tag via header button
//  - rename inline (double-click)
//  - colour swatch picker per tag
//  - delete tag with promote-vs-cascade choice for parents with children
//
// Out of scope (v2): drag to reparent, search box, multi-select.

import React, { useMemo, useState, useCallback } from 'react';
import { TaskCard } from './TaskCard.jsx';
import {
  indexTree,
  descendantsOf,
  resolveTagColor,
  deleteTagCascade,
  deleteTagPromote,
  mkTagId,
  isAncestor,
} from '../utils/tagTree.js';

const PRESET_TAG_COLORS = [
  '#fda4af', '#fcd34d', '#a7f3d0', '#86efac', '#67e8f9', '#a5b4fc',
  '#c4b5fd', '#f9a8d4', '#fdba74', '#94a3b8',
];

// Build a parentId -> child[] map for tree rendering.
function buildChildrenMap(tree) {
  const map = new Map();
  for (const node of tree || []) {
    const key = node?.parentId || '__root__';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(node);
  }
  for (const [, list] of map) {
    list.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }
  return map;
}

function TagNode({
  node, depth, childrenMap, tree, selectedId, onSelect,
  collapsed, onToggleCollapse,
  onRename, onChangeColor, onAddChild, onDelete,
}) {
  const kids = childrenMap.get(node.id) || [];
  const isCollapsed = !!collapsed[node.id];
  const isSelected = selectedId === node.id;
  const resolvedColor = node.color || resolveTagColor(tree, node.id) || '#94a3b8';
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [menuOpen, setMenuOpen] = useState(false);

  const commit = () => {
    setRenaming(false);
    const trimmed = (draft || '').trim();
    if (trimmed && trimmed !== node.name) onRename(node.id, trimmed);
    else setDraft(node.name);
  };

  return (
    <div className="tg-node" style={{ '--tg-depth': depth }}>
      <div className={`tg-row${isSelected ? ' is-selected' : ''}`}>
        <button
          type="button"
          className="tg-twirl"
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          onClick={() => onToggleCollapse(node.id)}
          disabled={!kids.length}
          aria-expanded={!isCollapsed}
        >{kids.length ? (isCollapsed ? '▸' : '▾') : '·'}</button>
        <span className="tg-swatch" style={{ background: resolvedColor }} aria-hidden />
        {renaming ? (
          <input
            className="tg-rename"
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setRenaming(false); setDraft(node.name); }
            }}
          />
        ) : (
          <button
            type="button"
            className="tg-name"
            onClick={() => onSelect(node.id)}
            onDoubleClick={() => { setDraft(node.name); setRenaming(true); }}
          >{node.name}</button>
        )}
        <button
          type="button"
          className="tg-kebab"
          aria-label="Tag menu"
          onClick={() => setMenuOpen(v => !v)}
        >⋯</button>
        {menuOpen && (
          <div className="tg-menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
            <button type="button" onClick={() => { setMenuOpen(false); onAddChild(node.id); }}>Add child tag</button>
            <button type="button" onClick={() => { setMenuOpen(false); setDraft(node.name); setRenaming(true); }}>Rename</button>
            <div className="tg-menu-swatches">
              {PRESET_TAG_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className="tg-menu-swatch"
                  style={{ background: c }}
                  aria-label={`Set colour ${c}`}
                  onClick={() => { onChangeColor(node.id, c); setMenuOpen(false); }}
                />
              ))}
              <button
                type="button"
                className="tg-menu-inherit"
                onClick={() => { onChangeColor(node.id, null); setMenuOpen(false); }}
                title="Inherit from parent"
              >Inherit</button>
            </div>
            <button type="button" className="tg-menu-danger" onClick={() => { setMenuOpen(false); onDelete(node.id); }}>Delete tag</button>
          </div>
        )}
      </div>
      {!isCollapsed && kids.length > 0 && (
        <div className="tg-kids">
          {kids.map(child => (
            <TagNode
              key={child.id}
              node={child}
              depth={depth + 1}
              childrenMap={childrenMap}
              tree={tree}
              selectedId={selectedId}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              onRename={onRename}
              onChangeColor={onChangeColor}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TagsView({
  tasks,
  tagTree,
  onUpdateTagTree,
  onOpenCard,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const tree = Array.isArray(tagTree) ? tagTree : [];
  const childrenMap = useMemo(() => buildChildrenMap(tree), [tree]);
  const roots = childrenMap.get('__root__') || [];

  const toggleCollapse = useCallback((id) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const onRename = useCallback((id, name) => {
    onUpdateTagTree?.(prev => (prev || []).map(n => n?.id === id ? { ...n, name } : n));
  }, [onUpdateTagTree]);

  const onChangeColor = useCallback((id, color) => {
    onUpdateTagTree?.(prev => (prev || []).map(n => n?.id === id ? { ...n, color } : n));
  }, [onUpdateTagTree]);

  const onAddChild = useCallback((parentId) => {
    const name = (window.prompt('New tag name') || '').trim();
    if (!name) return;
    onUpdateTagTree?.(prev => {
      const existing = new Set((prev || []).map(n => n?.id));
      const id = mkTagId(name, existing);
      return (prev || []).concat({ id, name, color: null, parentId });
    });
  }, [onUpdateTagTree]);

  const onAddRoot = useCallback(() => {
    onAddChild(null);
  }, [onAddChild]);

  const onDelete = useCallback((id) => {
    const node = tree.find(n => n?.id === id);
    if (!node) return;
    const kids = childrenMap.get(id) || [];
    if (kids.length) {
      const choice = window.confirm(`"${node.name}" has ${kids.length} child tag${kids.length===1?'':'s'}.\n\nOK = delete children too\nCancel = promote them up one level`);
      onUpdateTagTree?.(prev => choice ? deleteTagCascade(prev || [], id) : deleteTagPromote(prev || [], id));
    } else {
      if (window.confirm(`Delete tag "${node.name}"?`)) {
        onUpdateTagTree?.(prev => deleteTagCascade(prev || [], id));
      }
    }
    if (selectedId === id) setSelectedId(null);
  }, [tree, childrenMap, onUpdateTagTree, selectedId]);

  // Right pane: tasks tagged with the selected tag OR any of its descendants.
  const filteredTasks = useMemo(() => {
    if (!selectedId) return [];
    const allowed = new Set([selectedId, ...descendantsOf(tree, selectedId).map(n => n.id)]);
    return (tasks || []).filter(t => !t?.archived && Array.isArray(t?.tags) && t.tags.some(id => allowed.has(id)));
  }, [tasks, tree, selectedId]);

  const selectedNode = selectedId ? indexTree(tree).get(selectedId) : null;

  return (
    <div className="tg-view">
      <aside className="tg-tree" aria-label="Tag tree">
        <div className="tg-tree-hdr">
          <span className="tg-tree-title">Tags</span>
          <button type="button" className="tg-tree-add" onClick={onAddRoot}>+ Tag</button>
        </div>
        <div className="tg-tree-body">
          {roots.length === 0 ? (
            <div className="tg-tree-empty">No tags yet. Create one to start organising.</div>
          ) : (
            roots.map(r => (
              <TagNode
                key={r.id}
                node={r}
                depth={0}
                childrenMap={childrenMap}
                tree={tree}
                selectedId={selectedId}
                onSelect={setSelectedId}
                collapsed={collapsed}
                onToggleCollapse={toggleCollapse}
                onRename={onRename}
                onChangeColor={onChangeColor}
                onAddChild={onAddChild}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </aside>
      <section className="tg-pane">
        {!selectedNode ? (
          <div className="tg-pane-empty">Select a tag to see its tasks.</div>
        ) : (
          <>
            <header className="tg-pane-hdr">
              <span className="tg-pane-title">{selectedNode.name}</span>
              <span className="tg-pane-count">{filteredTasks.length}</span>
            </header>
            <div className="tg-pane-body">
              {filteredTasks.length === 0 ? (
                <div className="tg-pane-empty">No tasks have this tag (or any descendant).</div>
              ) : (
                filteredTasks.map(t => (
                  <div key={t.id} className="tg-card-slot" onClick={() => onOpenCard?.(t.id)}>
                    <TaskCard task={t} />
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default TagsView;
