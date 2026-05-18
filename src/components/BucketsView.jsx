// BucketsView — Trello-style Kanban over `tweaks.customGroups` (rebranded as
// "Buckets" in the UI). Sticky left column holds tasks with no bucket; the
// rest of the layout is one scrollable row of columns, one per bucket.
//
// v1 scope:
//  - render columns + unbucketed sidebar
//  - drag a card between columns (HTML5 DnD; sets task.groupId)
//  - manual sort within a column via drag (sets task.bucketPosition)
//  - drag a column header to reorder buckets (reorders tweaks.customGroups)
//  - inline rename / colour swatch / delete on each column header
//  - default sort: most-recently-assigned first (we put new arrivals at the
//    top by giving them a lower bucketPosition than the current minimum)
//  - completed tasks hidden by default, per-column toggle
//
// Drag-to-unbucket (drop on the sidebar) is intentionally NOT supported in
// v1 — use the drawer's bucket picker to clear a card's bucket.
//
// Out of scope here:
//  - real-time multi-user reconciliation (the global tasks sync handles it)
//  - integration with the global @dnd-kit DndContext (BucketsView uses plain
//    HTML5 DnD because the cards in a column are self-contained and the
//    cross-view DnD handlers don't fit this layout)

import React, { useMemo, useState, useCallback } from 'react';
import { TaskCard } from './TaskCard.jsx';
import {
  partitionByBucket,
  sortByBucketPosition,
  topOfColumnPosition,
  computeBucketPosition,
  mkBucketId,
} from '../utils/buckets.js';

const PRESET_BUCKET_COLORS = [
  '#fda4af', '#fcd34d', '#a7f3d0', '#86efac', '#67e8f9', '#a5b4fc',
  '#c4b5fd', '#f9a8d4', '#fdba74', '#94a3b8',
];

function BucketColumn({
  bucket,
  tasks,
  showCompleted,
  onToggleCompleted,
  onCardDragStart,
  onCardDrop,
  onCardDragOver,
  onColumnDragStart,
  onColumnDragOver,
  onColumnDrop,
  onRename,
  onChangeColor,
  onDelete,
  onOpenCard,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(bucket?.name || '');
  const sorted = useMemo(() => sortByBucketPosition(tasks || []), [tasks]);
  const visible = showCompleted ? sorted : sorted.filter(t => !t?.done);
  const completedCount = sorted.length - visible.length;

  const commitRename = () => {
    setRenaming(false);
    const trimmed = (draftName || '').trim();
    if (trimmed && trimmed !== bucket.name) onRename(bucket.id, trimmed);
    else setDraftName(bucket.name || '');
  };

  return (
    <div
      className="bk-col"
      draggable={!renaming}
      onDragStart={e => onColumnDragStart(e, bucket.id)}
      onDragOver={e => onColumnDragOver(e, bucket.id)}
      onDrop={e => onColumnDrop(e, bucket.id)}
    >
      <div className="bk-col-hdr">
        <span className="bk-col-swatch" style={{ background: bucket.color || '#94a3b8' }} aria-hidden />
        {renaming ? (
          <input
            className="bk-col-rename"
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setRenaming(false); setDraftName(bucket.name || ''); }
            }}
          />
        ) : (
          <span
            className="bk-col-title"
            onDoubleClick={() => { setDraftName(bucket.name || ''); setRenaming(true); }}
            title="Double-click to rename"
          >{bucket.name}</span>
        )}
        <span className="bk-col-count">{visible.length}</span>
        <button
          type="button"
          className="bk-col-kebab"
          aria-label="Bucket menu"
          onClick={() => setMenuOpen(v => !v)}
        >⋯</button>
        {menuOpen && (
          <div className="bk-col-menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
            <button type="button" onClick={() => { setMenuOpen(false); setDraftName(bucket.name || ''); setRenaming(true); }}>Rename</button>
            <div className="bk-col-menu-swatches">
              {PRESET_BUCKET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className="bk-col-menu-swatch"
                  style={{ background: c }}
                  aria-label={`Set colour ${c}`}
                  onClick={() => { onChangeColor(bucket.id, c); setMenuOpen(false); }}
                />
              ))}
            </div>
            <button type="button" className="bk-col-menu-danger" onClick={() => { setMenuOpen(false); onDelete(bucket.id); }}>Delete bucket</button>
          </div>
        )}
      </div>

      <div
        className="bk-col-body"
        onDragOver={e => onCardDragOver(e, bucket.id, null)}
        onDrop={e => onCardDrop(e, bucket.id, null)}
      >
        {visible.length === 0 && (
          <div className="bk-col-empty" aria-hidden>Drop cards here</div>
        )}
        {visible.map(task => (
          <div
            key={task.id}
            className="bk-card-slot"
            draggable
            onDragStart={e => onCardDragStart(e, task.id, bucket.id)}
            onDragOver={e => { e.stopPropagation(); onCardDragOver(e, bucket.id, task.id); }}
            onDrop={e => { e.stopPropagation(); onCardDrop(e, bucket.id, task.id); }}
            onClick={() => onOpenCard?.(task.id)}
          >
            <TaskCard task={task} />
          </div>
        ))}
        {completedCount > 0 && (
          <button type="button" className="bk-col-toggle-completed" onClick={() => onToggleCompleted(bucket.id)}>
            {showCompleted ? 'Hide completed' : `Show completed (${completedCount})`}
          </button>
        )}
      </div>
    </div>
  );
}

export function BucketsView({
  tasks,
  buckets,
  onUpdateTask,
  onReorderBuckets,
  onRenameBucket,
  onChangeBucketColor,
  onDeleteBucket,
  onCreateBucket,
  onOpenCard,
}) {
  // Per-column toggle for completed-task visibility. Local state — not
  // persisted to tweaks (acts like a UI toggle, not a preference).
  const [showCompleted, setShowCompleted] = useState(() => ({}));
  const toggleCompleted = useCallback((bucketId) => {
    setShowCompleted(prev => ({ ...prev, [bucketId]: !prev[bucketId] }));
  }, []);

  // Buckets is a triage surface. Filter out everything that doesn't belong
  // in a categorisation pass: archived, subtasks, snoozed, someday, blocked,
  // delegated parents, generated check-in tasks, routine instances. Matches
  // the canonical "real Inbox" filter in src/components/sidebar.jsx
  // (LeftNav counts.inbox) plus check-in + routine exclusions. Without this,
  // the Unbucketed sidebar gets polluted with auto-generated cards
  // (delegation check-ins, routine instances) that the user never expected
  // to triage manually.
  //
  // Applied to BOTH the sidebar AND bucket columns: routines belong in the
  // Routines view, check-ins in the Delegations view — never in a
  // categorisation Kanban.
  const isTriageCandidate = (t) =>
    t && !t.archived && !t.parentId
    && !t.snoozedUntil && !t.someday && !t.blocked
    && !t.delegatedTo && !t.checkInOf
    && !(t.recurrence && t.recurrence.isRoutine);

  const openTasks = useMemo(
    () => (tasks || []).filter(isTriageCandidate),
    [tasks]
  );
  const { byBucket, unbucketed } = useMemo(
    () => partitionByBucket(openTasks, buckets || []),
    [openTasks, buckets]
  );

  // Sidebar (unbucketed) additionally excludes completed cards entirely;
  // per-column "Show completed (n)" toggle handles them inside buckets.
  const sidebarTasks = useMemo(
    () => sortByBucketPosition(unbucketed.filter(t => !t.done)),
    [unbucketed]
  );

  // ── DnD handlers ─────────────────────────────────────────────────────
  // Cards: dataTransfer holds JSON {kind:'bucket-card', taskId, fromBucketId}.
  // Columns: dataTransfer holds JSON {kind:'bucket-column', bucketId}.
  // The handlers branch on `kind` to disambiguate when both fire.

  const handleCardDragStart = (e, taskId, fromBucketId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'bucket-card', taskId, fromBucketId }));
    // Stop the column handler from also kicking in
    e.stopPropagation();
  };

  const parsePayload = (e) => {
    try { return JSON.parse(e.dataTransfer.getData('application/json')) || {}; } catch { return {}; }
  };

  const handleCardDragOver = (e) => {
    // Always permit drop — fine-grained validation happens on drop.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Reassign a task to a bucket. If `nearTaskId` is set, place the dropped
  // card immediately above the near task (insert ordering). Otherwise the
  // dropped card lands at the top of the destination column.
  const handleCardDrop = (e, toBucketId, nearTaskId) => {
    e.preventDefault();
    const payload = parsePayload(e);
    if (payload?.kind !== 'bucket-card') return;
    const { taskId, fromBucketId } = payload;
    if (!taskId) return;

    const columnTasks = sortByBucketPosition(byBucket.get(toBucketId) || []);
    let newPosition;
    if (nearTaskId && nearTaskId !== taskId) {
      // Insert above `nearTaskId`. Find the card immediately above it in
      // the current order; new position = midpoint between that and the
      // near task.
      const idx = columnTasks.findIndex(t => t.id === nearTaskId);
      if (idx === -1) newPosition = topOfColumnPosition(columnTasks);
      else {
        const above = idx > 0 ? columnTasks[idx - 1] : null;
        const below = columnTasks[idx];
        newPosition = computeBucketPosition(above, below);
      }
    } else {
      newPosition = topOfColumnPosition(columnTasks);
    }

    onUpdateTask?.(taskId, { groupId: toBucketId, bucketPosition: newPosition });
  };

  const handleColumnDragStart = (e, bucketId) => {
    // Column header drag — only fires if the card handler didn't stopPropagation.
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'bucket-column', bucketId }));
  };
  const handleColumnDragOver = (e) => { e.preventDefault(); };
  const handleColumnDrop = (e, toBucketId) => {
    e.preventDefault();
    const payload = parsePayload(e);
    if (payload?.kind !== 'bucket-column') return;
    const { bucketId: fromId } = payload;
    if (!fromId || fromId === toBucketId) return;
    const order = (buckets || []).map(b => b.id);
    const fromIdx = order.indexOf(fromId);
    const toIdx = order.indexOf(toBucketId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = order.slice();
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromId);
    onReorderBuckets?.(next);
  };

  const handleCreateBucket = () => {
    const name = (window.prompt('New bucket name') || '').trim();
    if (!name) return;
    const color = PRESET_BUCKET_COLORS[(buckets?.length || 0) % PRESET_BUCKET_COLORS.length];
    onCreateBucket?.({ id: mkBucketId(), name, color });
  };

  return (
    <div className="bk-view">
      <aside className="bk-sidebar" aria-label="Unbucketed tasks">
        <div className="bk-sidebar-hdr">
          <span className="bk-sidebar-title">No bucket</span>
          <span className="bk-sidebar-count">{sidebarTasks.length}</span>
        </div>
        <div className="bk-sidebar-body">
          {sidebarTasks.length === 0 ? (
            <div className="bk-sidebar-empty">Nothing to triage</div>
          ) : (
            sidebarTasks.map(task => (
              <div
                key={task.id}
                className="bk-card-slot"
                draggable
                onDragStart={e => handleCardDragStart(e, task.id, null)}
                onClick={() => onOpenCard?.(task.id)}
              >
                <TaskCard task={task} />
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="bk-board">
        {(!buckets || buckets.length === 0) ? (
          <div className="bk-empty">
            <p>No buckets yet.</p>
            <button type="button" className="bk-empty-btn" onClick={handleCreateBucket}>
              Create your first bucket
            </button>
          </div>
        ) : (
          <>
            {(buckets || []).map(bucket => (
              <BucketColumn
                key={bucket.id}
                bucket={bucket}
                tasks={byBucket.get(bucket.id) || []}
                showCompleted={!!showCompleted[bucket.id]}
                onToggleCompleted={toggleCompleted}
                onCardDragStart={handleCardDragStart}
                onCardDrop={handleCardDrop}
                onCardDragOver={handleCardDragOver}
                onColumnDragStart={handleColumnDragStart}
                onColumnDragOver={handleColumnDragOver}
                onColumnDrop={handleColumnDrop}
                onRename={onRenameBucket}
                onChangeColor={onChangeBucketColor}
                onDelete={onDeleteBucket}
                onOpenCard={onOpenCard}
              />
            ))}
            <button type="button" className="bk-add-col" onClick={handleCreateBucket}>
              + New bucket
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default BucketsView;
