// BucketsView — Trello-style Kanban over `tweaks.customGroups` (rebranded as
// "Buckets" in the UI). Mirrors the Cards/Timeline (`view === 'week'`) layout
// verbatim: `.timeline-scroll` + sticky `.side-panel.inbox-col` + horizontal
// row of `.col` columns. dnd-kit drives drag (cards + column reorder); the
// global DndContext at App.jsx routes drops via dndOnDragEnd's `bucket-task`
// / `bucket-col` / `bucket-column-handle` branches.
//
// Card → bucket: drop on a `.col-body` or another card → updateTask sets
// groupId + bucketPosition. Card → No-bucket sidebar: drop sets groupId:null.
// Header → header: arrayMove on tweaks.customGroups.
//
// Sort: tweaks.bucketsSort applies globally (columns + sidebar). Within-column
// drag silently flips back to 'manual' so the new order is visible.

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { TaskCard } from './TaskCard.jsx';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  partitionByBucket,
  sortBucketTasks,
  mkBucketId,
} from '../utils/buckets.js';

const PRESET_BUCKET_COLORS = [
  '#fda4af', '#fcd34d', '#a7f3d0', '#86efac', '#67e8f9', '#a5b4fc',
  '#c4b5fd', '#f9a8d4', '#fdba74', '#94a3b8',
];

// Mix a bucket colour with the surface to produce the soft column tint.
// Alpha hex `1c` (~11%) keeps the wash readable in both light and dark themes.
const tintFor = (color) => color ? `${color}1c` : 'transparent';

function BucketColumn({
  bucket, tasks, columnTaskIds, columnTint,
  showCompleted, onToggleCompleted,
  tweaks, theme, selectedIds, focusedId, renamingId, spawningSet, recents,
  onOpenCard, onSelect, onFocus, onRename, onRenameDone,
  onComplete, onDelete, onContextMenu, onBulkUpdate,
  onRecentTag, onRecentProj, onStartRename,
  onRenameBucket, onChangeBucketColor, onDeleteBucket, onAddCard,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(bucket?.name || '');
  const [addingCard, setAddingCard] = useState(false);
  const [addDraft, setAddDraft] = useState('');
  const addInputRef = useRef(null);

  // Plain column wrapper — NO useSortable. Wrapping the .col in useSortable was
  // the source of the click-and-hold lift animation (Timeline doesn't do this;
  // its date columns are static divs). Drag-to-reorder buckets is achieved
  // instead by:
  //   1. A useDraggable on the grip `<span>` (drag SOURCE)
  //   2. A useDroppable on the column header (drop TARGET)
  // This sidesteps nested SortableContexts, which were also interfering with
  // within-column card reorder.
  const gripDrag = useDraggable({
    id: `bkgrip:${bucket.id}`,
    data: { kind: 'bucket-column-handle', bucketId: bucket.id },
    disabled: renaming,
  });
  const headerDrop = useDroppable({
    id: `bkhdr:${bucket.id}`,
    data: { kind: 'bucket-column-target', bucketId: bucket.id },
  });
  // Column body acts as the drop target for cards. Stamping data-bucket-col-key
  // on the wrapper lets dndOnDragOver light up `.col-armed` via the body's
  // outer `.col`.
  const bodyDrop = useDroppable({
    id: `bkbody:${bucket.id}`,
    data: { kind: 'bucket-col', bucketId: bucket.id },
  });

  const visible = showCompleted ? tasks : tasks.filter(t => !t?.done);
  const completedCount = tasks.length - visible.length;

  const commitRename = () => {
    setRenaming(false);
    const trimmed = (draftName || '').trim();
    if (trimmed && trimmed !== bucket.name) onRenameBucket(bucket.id, trimmed);
    else setDraftName(bucket.name || '');
  };

  useEffect(() => {
    if (addingCard) {
      requestAnimationFrame(() => addInputRef.current?.focus());
    }
  }, [addingCard]);

  const commitAdd = (keepOpen) => {
    const title = (addDraft || '').trim();
    setAddDraft('');
    if (title) onAddCard(bucket.id, title);
    if (!keepOpen) setAddingCard(false);
  };

  const colStyle = {
    background: tintFor(columnTint),
  };

  return (
    <div
      className="col bk-col"
      style={colStyle}
      data-bucket-col-key={bucket.id}
    >
      <div
        className={`col-hdr bk-col-hdr${headerDrop.isOver ? ' drag-over-col-target' : ''}`}
        ref={headerDrop.setNodeRef}
      >
        <span
          className="col-hdr-grip bk-col-grip"
          ref={gripDrag.setNodeRef}
          title="Drag to reorder bucket"
          {...gripDrag.listeners}
          {...gripDrag.attributes}
        >⋮⋮</span>
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
          >{bucket.name || 'Untitled'}</span>
        )}
        <span className="bk-col-count">{visible.length}</span>
        <button
          type="button"
          className="bk-col-kebab"
          aria-label="Bucket menu"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
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
                  onClick={() => { onChangeBucketColor(bucket.id, c); setMenuOpen(false); }}
                />
              ))}
            </div>
            <button type="button" className="bk-col-menu-danger" onClick={() => { setMenuOpen(false); onDeleteBucket(bucket.id); }}>Delete bucket</button>
          </div>
        )}
      </div>

      <div
        className={`col-body bk-col-body${bodyDrop.isOver ? ' drag-over' : ''}`}
        ref={bodyDrop.setNodeRef}
      >
        <SortableContext items={columnTaskIds} strategy={verticalListSortingStrategy}>
          {visible.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              colKey={`bk:${bucket.id}`}
              theme={theme}
              tweaks={tweaks}
              hideBucketChip
              focused={focusedId === task.id}
              selected={selectedIds?.has(task.id)}
              renaming={renamingId === task.id}
              spawning={spawningSet?.has(task.id)}
              sortableData={{ kind: 'bucket-task', bucketId: bucket.id, taskId: task.id }}
              selectedIds={selectedIds}
              renamingId={renamingId}
              spawningSet={spawningSet}
              focusedId={focusedId}
              recents={recents}
              onRecentTag={onRecentTag}
              onRecentProj={onRecentProj}
              onOpen={onOpenCard}
              onSelect={onSelect}
              onFocus={onFocus}
              onRename={onRename}
              onRenameDone={onRenameDone}
              onToggle={onComplete}
              onDelete={onDelete}
              onContextMenu={onContextMenu}
              onBulkUpdate={onBulkUpdate}
              onStartRename={onStartRename}
            />
          ))}
        </SortableContext>
        {visible.length === 0 && !bodyDrop.isOver && (
          <div className="bk-col-empty" aria-hidden>Drop cards here</div>
        )}
        {addingCard ? (
          <div className="bk-col-addcard-row">
            <input
              ref={addInputRef}
              className="bk-col-addcard-input"
              value={addDraft}
              onChange={e => setAddDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitAdd(e.shiftKey); }
                if (e.key === 'Escape') { e.preventDefault(); setAddingCard(false); setAddDraft(''); }
              }}
              onBlur={() => commitAdd(false)}
              placeholder="New card title"
            />
          </div>
        ) : null}
        {completedCount > 0 && (
          <button type="button" className="bk-col-toggle-completed" onClick={() => onToggleCompleted(bucket.id)}>
            {showCompleted ? 'Hide completed' : `Show completed (${completedCount})`}
          </button>
        )}
      </div>

      <button
        type="button"
        className="col-add bk-col-add"
        onClick={() => setAddingCard(v => !v)}
        title="Add a card to this bucket"
      >
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add card
      </button>
    </div>
  );
}

// The No-bucket sidebar. Sticky-left, droppable, sortable inside.
function NoBucketSidebar({
  sidebarTasks, sidebarTaskIds, tweaks, theme,
  selectedIds, focusedId, renamingId, spawningSet, recents,
  onOpenCard, onSelect, onFocus, onRename, onRenameDone,
  onComplete, onDelete, onContextMenu, onBulkUpdate,
  onRecentTag, onRecentProj, onStartRename,
  activeDragFromBucket,
}) {
  const drop = useDroppable({
    id: 'bkbody:nobucket',
    data: { kind: 'bucket-col', bucketId: null },
  });
  // Show the "Move out of bucket" label only when the cursor is over the
  // sidebar AND the in-flight drag originated from a bucket (i.e. dropping
  // here would actually do something — clear groupId).
  const showLabel = drop.isOver && activeDragFromBucket;
  return (
    <aside
      className="side-panel inbox-col bk-sidebar"
      data-col-key="bk:none"
      data-bucket-col-key="none"
      aria-label="Unbucketed tasks"
    >
      <div className="col-hdr bk-sidebar-hdr">
        <span className="bk-sidebar-title">No bucket</span>
        <span className="bk-sidebar-count">{sidebarTasks.length}</span>
      </div>
      <div
        className={`col-body bk-sidebar-body${drop.isOver ? ' drag-over' : ''}`}
        ref={drop.setNodeRef}
      >
        {showLabel && (
          <div className="bk-sidebar-droplabel" aria-live="polite">Move out of bucket</div>
        )}
        <SortableContext items={sidebarTaskIds} strategy={verticalListSortingStrategy}>
          {sidebarTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              colKey="bk:none"
              theme={theme}
              tweaks={tweaks}
              focused={focusedId === task.id}
              selected={selectedIds?.has(task.id)}
              renaming={renamingId === task.id}
              spawning={spawningSet?.has(task.id)}
              sortableData={{ kind: 'bucket-task', bucketId: null, taskId: task.id }}
              selectedIds={selectedIds}
              renamingId={renamingId}
              spawningSet={spawningSet}
              focusedId={focusedId}
              recents={recents}
              onRecentTag={onRecentTag}
              onRecentProj={onRecentProj}
              onOpen={onOpenCard}
              onSelect={onSelect}
              onFocus={onFocus}
              onRename={onRename}
              onRenameDone={onRenameDone}
              onToggle={onComplete}
              onDelete={onDelete}
              onContextMenu={onContextMenu}
              onBulkUpdate={onBulkUpdate}
              onStartRename={onStartRename}
            />
          ))}
        </SortableContext>
        {sidebarTasks.length === 0 && (
          <div className="bk-sidebar-empty">Nothing to triage</div>
        )}
      </div>
    </aside>
  );
}

export function BucketsView({
  tasks, buckets, applyFilters,
  tweaks, theme,
  selectedIds, onSelect, onMarqueeStart,
  focusedId, setFocusedId, renamingId, setRenamingId, spawningSet,
  recents, onRecentTag, onRecentProj,
  onUpdateTask, onAddTask, onOpenCard, onContextMenu, onComplete, onDelete, onBulkUpdate,
  onReorderBuckets, onRenameBucket, onChangeBucketColor, onDeleteBucket, onCreateBucket,
  activeDrag,
  bucketColumnsMissing,
}) {
  // Per-column toggle for completed-task visibility (local — not persisted).
  const [showCompleted, setShowCompleted] = useState(() => ({}));
  const toggleCompleted = useCallback((bucketId) => {
    setShowCompleted(prev => ({ ...prev, [bucketId]: !prev[bucketId] }));
  }, []);

  // Inline "new bucket" column at the end of the row.
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState('');
  const createInputRef = useRef(null);
  useEffect(() => {
    if (creating) requestAnimationFrame(() => createInputRef.current?.focus());
  }, [creating]);
  const commitCreate = () => {
    const name = (createDraft || '').trim();
    setCreateDraft('');
    setCreating(false);
    if (!name) return;
    const color = PRESET_BUCKET_COLORS[(buckets?.length || 0) % PRESET_BUCKET_COLORS.length];
    onCreateBucket?.({ id: mkBucketId(), name, color });
  };

  // Board ref + pan handler. Self-contained copy of App.jsx:4177 onBoardMouseDown
  // so the bucket board pans identically to Timeline without sharing state.
  const boardRef = useRef(null);
  const panState = useRef({ isPanning: false, startX: 0, scrollLeft: 0 });
  const onBoardMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.card,.col-add,.bk-col-addcard-row,.bk-col-addcard-input,.bk-col-rename,.bk-col-menu,.side-panel,.col-hdr,.bk-col-grip,.tb-btn,.lnav-item,.drawer,.bk-col-kebab,.bk-col-toggle-completed,.bk-mig-banner')) return;
    const el = boardRef.current; if (!el) return;
    if (e.shiftKey && onMarqueeStart) { onMarqueeStart(e, el); return; }
    panState.current = { isPanning: true, startX: e.clientX, scrollLeft: el.scrollLeft };
    el.classList.add('panning');
    const onMove = (ev) => {
      if (!panState.current.isPanning) return;
      el.scrollLeft = panState.current.scrollLeft - (ev.clientX - panState.current.startX);
    };
    const onUp = () => {
      panState.current.isPanning = false;
      el.classList.remove('panning');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [onMarqueeStart]);

  // Triage filter — same predicate the original Buckets view used (no
  // routines, check-ins, snoozed, someday, blocked, delegated parents,
  // subtasks). Then global filters/search via applyFilters.
  const isTriageCandidate = (t) =>
    t && !t.archived && !t.parentId
    && !t.snoozedUntil && !t.someday && !t.blocked
    && !t.delegatedTo && !t.checkInOf
    && !(t.recurrence && t.recurrence.isRoutine);

  const triagedTasks = useMemo(() => {
    const filtered = (tasks || []).filter(isTriageCandidate);
    return applyFilters ? applyFilters(filtered) : filtered;
  }, [tasks, applyFilters]);

  const { byBucket, unbucketed } = useMemo(
    () => partitionByBucket(triagedTasks, buckets || []),
    [triagedTasks, buckets]
  );

  const sortMode = tweaks?.bucketsSort || 'manual';

  // Sidebar tasks: also respect the global sort. Completed cards are hidden
  // entirely in the sidebar (per-bucket "Show completed" handles them in
  // their column).
  const sidebarTasks = useMemo(
    () => sortBucketTasks(unbucketed.filter(t => !t?.done), sortMode),
    [unbucketed, sortMode]
  );
  const sidebarTaskIds = useMemo(() => sidebarTasks.map(t => t.id), [sidebarTasks]);

  // For the sidebar's "Move out of bucket" label: only show when the
  // in-flight drag came from a bucket (groupId is set), not when dragging
  // from the sidebar itself.
  const activeDragFromBucket = !!(activeDrag && activeDrag.kind === 'bucket-task' && activeDrag.fromCol && activeDrag.fromCol !== 'bk:none');

  // Inline-add a card into a bucket via the per-column +Add. Match Timeline's
  // pattern: title only, groupId pre-set, bucketPosition at top of column.
  const handleAddCard = (bucketId, title) => {
    if (onAddTask) onAddTask({ title, groupId: bucketId });
  };

  return (
    <div className="bk-view-shell">
      {bucketColumnsMissing && (
        <div className="bk-mig-banner" role="status">
          Apply migration 0011 to enable bucket persistence — changes are in-memory only until applied.
        </div>
      )}
      <div
        className="timeline-scroll bk-board"
        ref={boardRef}
        onMouseDown={onBoardMouseDown}
        data-bk-board
      >
        <NoBucketSidebar
          sidebarTasks={sidebarTasks}
          sidebarTaskIds={sidebarTaskIds}
          tweaks={tweaks}
          theme={theme}
          selectedIds={selectedIds}
          focusedId={focusedId}
          renamingId={renamingId}
          spawningSet={spawningSet}
          recents={recents}
          onOpenCard={onOpenCard}
          onSelect={onSelect}
          onFocus={setFocusedId}
          onRename={onUpdateTask}
          onRenameDone={() => setRenamingId(null)}
          onComplete={onComplete}
          onDelete={onDelete}
          onContextMenu={onContextMenu}
          onBulkUpdate={onBulkUpdate}
          onRecentTag={onRecentTag}
          onRecentProj={onRecentProj}
          onStartRename={(id) => setRenamingId(id)}
          activeDragFromBucket={activeDragFromBucket}
        />

        {(buckets || []).length === 0 ? (
          <div className="bk-empty-board">
            <p>No buckets yet.</p>
            <p className="bk-empty-hint">
              Create a bucket to start filing the cards on the left into a category.
            </p>
            <button type="button" className="bk-empty-btn" onClick={() => setCreating(true)}>
              + New bucket
            </button>
          </div>
        ) : (
          (buckets || []).map(bucket => {
            const colTasks = sortBucketTasks(byBucket.get(bucket.id) || [], sortMode);
            const colTaskIds = colTasks.map(t => t.id);
            return (
              <BucketColumn
                key={bucket.id}
                bucket={bucket}
                tasks={colTasks}
                columnTaskIds={colTaskIds}
                columnTint={bucket.color}
                showCompleted={!!showCompleted[bucket.id]}
                onToggleCompleted={toggleCompleted}
                tweaks={tweaks}
                theme={theme}
                selectedIds={selectedIds}
                focusedId={focusedId}
                renamingId={renamingId}
                spawningSet={spawningSet}
                recents={recents}
                onOpenCard={onOpenCard}
                onSelect={onSelect}
                onFocus={setFocusedId}
                onRename={onUpdateTask}
                onRenameDone={() => setRenamingId(null)}
                onComplete={onComplete}
                onDelete={onDelete}
                onContextMenu={onContextMenu}
                onBulkUpdate={onBulkUpdate}
                onRecentTag={onRecentTag}
                onRecentProj={onRecentProj}
                onStartRename={(id) => setRenamingId(id)}
                onRenameBucket={onRenameBucket}
                onChangeBucketColor={onChangeBucketColor}
                onDeleteBucket={onDeleteBucket}
                onAddCard={handleAddCard}
              />
            );
          })
        )}

        {/* Inline "create bucket" trailing column */}
        {creating ? (
          <div className="col bk-col bk-col-creating">
            <div className="col-hdr bk-col-hdr">
              <span className="bk-col-swatch" aria-hidden style={{ background: PRESET_BUCKET_COLORS[(buckets?.length || 0) % PRESET_BUCKET_COLORS.length] }} />
              <input
                ref={createInputRef}
                className="bk-col-rename"
                value={createDraft}
                placeholder="Bucket name"
                onChange={e => setCreateDraft(e.target.value)}
                onBlur={commitCreate}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitCreate(); }
                  if (e.key === 'Escape') { e.preventDefault(); setCreating(false); setCreateDraft(''); }
                }}
              />
            </div>
            <div className="col-body bk-col-body bk-col-body-creating" />
          </div>
        ) : (
          (buckets || []).length > 0 && (
            <button type="button" className="bk-add-col" onClick={() => setCreating(true)}>
              + New bucket
            </button>
          )
        )}
      </div>
    </div>
  );
}

export default BucketsView;
