import React, { useState, useEffect, useRef } from 'react';
import { PROJ, ALL_TAGS, TAG_NAMES, TAG_DARK, TAG_LIGHT, fmtTimeEst, daysSince, isStale, D, recurrenceLabel } from '../data.js';
import { I } from '../utils/icons.jsx';
import { PRI_INFO } from '../utils/constants.js';
import { tagPath, formatTagChip, resolveTagColor } from '../utils/tagTree.js';
// Life-area imports removed in the Buckets redesign polish pass. The
// life-area chip is gone; bucket chip resolves task.groupId against
// tweaks.customGroups (passed via the `tweaks` prop). Tag chips now
// honour tweaks.tagChipFormat and tweaks.tagTree for nesting + colour.
import { cardColorVars } from '../utils/cardColor.js';
import { groupTasksBy, getGLabel, getGColor } from '../utils/grouping.js';
import { CardPopover } from './CardPopover.jsx';
import { TagPicker, ProjPicker, TimePicker, DatePicker, PriPicker, SnoozePicker } from './pickers.jsx';
import { PriBars } from './PriBars.jsx';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CheckGlyph } from './CheckGlyph.jsx';

const fmtStartDate = (s) => {
  if (!s) return '';
  const today = D.str(D.today());
  const tomorrow = D.str(D.add(D.today(), 1));
  if (s === today) return 'Starts Today';
  if (s === tomorrow) return 'Starts Tomorrow';
  const d = D.parse(s);
  const diff = Math.round((d - D.today()) / 86400000);
  if (diff > 1 && diff <= 6) return d.toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'});
  return d.toLocaleDateString(undefined, {month:'short', day:'numeric'});
};

const fmtDueDate = (s) => {
  if (!s) return '';
  const today = D.str(D.today());
  const tomorrow = D.str(D.add(D.today(), 1));
  if (s < today) return `Overdue ${D.parse(s).toLocaleDateString(undefined, {month:'short', day:'numeric'})}`;
  if (s === today) return 'Due Today';
  if (s === tomorrow) return 'Due Tomorrow';
  return `Due ${D.parse(s).toLocaleDateString(undefined, {month:'short', day:'numeric'})}`;
};

// ── TaskCard ─────────────────────────────────────────────────────────────
function TaskCard({ task, colKey, theme, tweaks, focused, selected, renaming, spawning, onOpen, onToggle, onDelete, onFocus, onSelect, onRename, onRenameDone,
  sortableData,
  childrenOf, projectStats, collapsedProjects, onToggleProject, forceOpenProjects,
  selectedIds, renamingId, spawningSet, focusedId, onAdd, depth=0, blockingCountFor, taskTitleById,
  onContextMenu, onBulkUpdate, recents, onRecentTag, onRecentProj, openPopRequest, onPopHandled, getEffectiveLifeArea, onAddTaxonomy, onStartRename, onExternalDrag,
  hideBucketChip }) {
  const tagPalette = theme==='dark'?TAG_DARK:TAG_LIGHT;
  const tp = tagPalette[task.tags?.[0]] || tagPalette.admin;
  const proj = PROJ.find(p=>p.id===task.project);
  // Bucket chip — resolve task.groupId against tweaks.customGroups. The
  // bucket's color drives both bg (soft) and fg (legible). Hidden when
  // no bucket assigned.
  const bucket = task.groupId
    ? (tweaks?.customGroups || []).find(g => g.id === task.groupId) || null
    : null;
  const [draft,setDraft] = useState(task.title || '');
  const [openPop, setOpenPop] = useState(null);
  const tagRef = useRef(null);
  const projRef = useRef(null);
  const timeRef = useRef(null);
  const dateRef = useRef(null);
  const priRef = useRef(null);
  const snoozeRef = useRef(null);
  const editRef = useRef(null);
  // Tracks whether THIS card's `focused` state was set by mouse hover. Used by
  // onMouseLeave to clear focus only for hover-induced focus, leaving focus
  // set by click or keyboard nav alone.
  const hoverFocusRef = useRef(false);

  // External keyboard-driven popover open requests
  useEffect(() => {
    if (openPopRequest && openPopRequest.id === task.id) {
      setOpenPop(openPopRequest.field);
      onPopHandled?.();
    }
  }, [openPopRequest, task.id]);

  const isBulkEdit = (selectedIds && selectedIds.size > 1 && selectedIds.has(task.id)) ? selectedIds.size : 0;
  const applyChange = (patch, recentVal) => {
    if (isBulkEdit && onBulkUpdate) onBulkUpdate([...selectedIds], patch);
    else onRename(task.id, patch);
    if (recentVal) {
      if ('tags' in patch) onRecentTag?.(recentVal);
      if ('project' in patch && recentVal) onRecentProj?.(recentVal);
    } else {
      if (patch.project) onRecentProj?.(patch.project);
    }
  };
  useEffect(()=>setDraft(task.title || ''),[task.id,task.title]);
  useEffect(()=>{
    if(renaming) {
      requestAnimationFrame(()=>{ editRef.current?.focus(); editRef.current?.select(); });
    }
  },[renaming]);
  const finishRename = (save=true) => {
    if(save && draft.trim() && draft.trim()!==task.title) onRename(task.id,{title:draft.trim()});
    else setDraft(task.title || '');
    onRenameDone();
  };

  const isProject = task.cardType === 'project';
  // Recursion guard: a project nested inside a project should never render its body.
  const renderAsProject = isProject && depth === 0;
  // A project can only render its body / act as a nest drop target when the
  // host view provides a children source. Buckets renders projects flat
  // (no body, no nest drops) and so omits childrenOf — without this gate,
  // every Buckets project registers a project-body droppable that
  // compositeCollisionDetection step 0 routes drops to, breaking reorder.
  const projectHasBody = renderAsProject && typeof childrenOf === 'function';
  const stats = renderAsProject && projectStats ? projectStats(task) : null;
  const isCollapsed = collapsedProjects?.has(task.id) && !forceOpenProjects?.has(task.id);
  const open = projectHasBody && !isCollapsed;
  const kids = projectHasBody ? (childrenOf(task.id) || []) : [];
  const projTimeStr = renderAsProject && stats?.mins ? fmtTimeEst(stats.mins) : '';
  const pct = stats && stats.total>0 ? (stats.done/stats.total)*100 : 0;

  // dnd-kit wiring. useSortable runs unconditionally (hook rules); when no
  // sortableData is supplied (e.g. in non-draggable views) we set disabled,
  // so the card is rendered without listeners and behaves as plain content.
  const sortable = useSortable({
    id: task.id,
    data: sortableData,
    disabled: !sortableData || renaming,
  });
  const projectDrop = useDroppable({
    id: 'proj:' + task.id,
    data: { kind: 'project-body', targetId: task.id },
    disabled: !projectHasBody,
  });
  const isSortable = !!sortableData && !renaming;
  // When the calendar drawer is open, inbox/standalone task cards initiate
  // the prototype's external-drag system instead of @dnd-kit's pointer
  // sensor. We only switch for top-level cards (subtasks inside a project
  // body keep @dnd-kit reordering).
  const useExtDrag = !!onExternalDrag && !renaming && depth === 0;
  const isDragging = sortable.isDragging;
  const isProjectDropTarget = projectHasBody && projectDrop.isOver;
  const dragStyle = isSortable ? {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  } : undefined;

  const isStaleCard = isStale(task);
  return (
    <div className={`card${focused?' focused':''}${selected?' selected':''}${isDragging?' dragging':''}${spawning?' spawning':''}${renderAsProject?' card-project':''}${isProjectDropTarget?' card-drop-target':''}${task.blocked?' blocked':''}${isStaleCard?' card-stale':''}${task.checkInOf?' card-checkin':''}`}
      ref={isSortable ? sortable.setNodeRef : undefined}
      style={{...dragStyle, ...cardColorVars(task.cardColor, tweaks, theme)}}
      data-card-id={task.id}
      title={task.blocked ? (task.blockedReason || 'Blocked') + ((task.blockedBy||[]).length && taskTitleById ? '\nWaiting on: ' + (task.blockedBy||[]).map(id=>taskTitleById(id)).filter(Boolean).join(', ') : '') : undefined}
      onClick={()=>{ if(renaming) return; hoverFocusRef.current=false; onFocus(task.id); }}
      onDoubleClick={()=>!renaming&&!openPop&&onOpen(task.id)}
      onContextMenu={e=>{ if(onContextMenu){ e.preventDefault(); e.stopPropagation(); onContextMenu(task, e.clientX, e.clientY); } }}
      onMouseEnter={()=>{ if(renaming) return; if(!focused) hoverFocusRef.current=true; onFocus(task.id); }}
      onMouseLeave={()=>{ if(hoverFocusRef.current && focused) onFocus(null); hoverFocusRef.current=false; }}
      onMouseDown={useExtDrag ? (e)=>onExternalDrag(e, task) : undefined}
      {...(isSortable ? sortable.attributes : {})}
      {...(isSortable && !useExtDrag ? sortable.listeners : {})}
    >
      <div className="card-top">
        <button className={`bulk-check${selected?' on':''}`} title={selected?'Deselect task':'Select task'}
          onClick={e=>{e.stopPropagation();onSelect(task.id);}}>{selected?'✓':''}</button>
        <span className={`card-chk cg-host${task.done?' done':''}`} onClick={e=>{e.stopPropagation();onToggle(task.id,colKey);}} style={{display:'inline-flex',marginTop:1,cursor:'pointer'}}>
          <CheckGlyph done={!!task.done} size={13}/>
        </span>
        {renaming ? (
          <input ref={editRef} className="card-title-input" value={draft}
            onClick={e=>e.stopPropagation()}
            onChange={e=>setDraft(e.target.value)}
            onBlur={()=>finishRename(true)}
            onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();finishRename(true);} if(e.key==='Escape'){e.preventDefault();finishRename(false);} }}/>
        ) : (
          <div className={`card-title${task.done?' done':''}`}>
            <span className="card-title-text"
              onDoubleClick={e=>{ e.stopPropagation(); onStartRename?.(task.id); }}
              title="Double-click to rename">{task.title}</span>
          </div>
        )}
        {projectHasBody && (
          <button className="card-proj-chv" title={open?'Collapse project':'Expand project'}
            onClick={e=>{e.stopPropagation();onToggleProject?.(task.id);}}>
            <svg className={`grp-chv${open?' open':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        )}
      </div>
      {renderAsProject && stats?.total>0 && (
        <div className="card-proj-stat">
          <svg className="proj-ring" viewBox="0 0 20 20" width="16" height="16" aria-hidden>
            <circle className="proj-ring-track" cx="10" cy="10" r="8"/>
            <circle className="proj-ring-fill"  cx="10" cy="10" r="8"
              style={{strokeDashoffset: 50.27 * (1 - pct/100)}}/>
          </svg>
          <span className="card-proj-cnt">{stats.done}/{stats.total}</span>
        </div>
      )}
      <div className="card-bottom">
        {task.delegatedTo && (
          <span className="card-tag" style={{background:'rgba(99,102,241,.15)',color:'#a5b4fc'}}
            title={`Delegated to ${task.delegatedTo}${task.delegationStatus?` · ${task.delegationStatus}`:''}`}>
            → {task.delegatedTo}
          </span>
        )}
        {task.checkInOf && (
          <span className="card-tag" style={{background:'rgba(245,158,11,.15)',color:'#fcd34d'}}
            title="Check-in task">
            ↺ d{task.checkInDayOffset ?? '?'}
          </span>
        )}
        {bucket && !hideBucketChip && (
          <span className="card-tag card-tag-bucket"
            style={{ background: `${bucket.color || '#94a3b8'}22`, color: bucket.color || '#94a3b8' }}
            title={`Bucket: ${bucket.name}`}>
            {bucket.name}
          </span>
        )}
        {/* Tag */}
        {(() => {
          // Tag chips honour the user's tagChipFormat setting + tagTree.
          // - Label: formatTagChip(parentLeaf|leaf|fullPath) over the tree path.
          // - Colour: resolveTagColor walks ancestors to find the first
          //   non-null colour (children inherit by default).
          // - Fallbacks: tasks may carry tag IDs that aren't in the tree
          //   yet (e.g. before tagTreeBuilt fires). Use the legacy
          //   TAG_DARK/TAG_LIGHT palette + TAG_NAMES as a graceful fallback.
          const tree = tweaks?.tagTree || [];
          const format = tweaks?.tagChipFormat || 'parentLeaf';
          const treeIds = new Set(tree.map(n => n?.id).filter(Boolean));
          const allTagIds = (task.tags || []).filter(Boolean);
          // Hide orphan IDs that aren't in either the tree or the legacy
          // palette (so a deleted tag doesn't leave a dangling chip).
          const visibleTags = allTagIds.filter(tg => treeIds.has(tg) || tagPalette[tg]);
          const fullTitle = visibleTags.length
            ? `Tags: ${visibleTags.map(tg => {
                const path = tagPath(tree, tg);
                return path.length ? path.map(n => n.name).join(' / ') : (TAG_NAMES[tg] || tg);
              }).join(', ')}`
            : 'Set tag';
          return (
            <span ref={tagRef} className={`card-meta-btn${openPop==='tag'?' act':''}`}
              title={fullTitle}
              onClick={e=>{e.stopPropagation(); setOpenPop(o=>o==='tag'?null:'tag');}}>
              {visibleTags.length ? (
                visibleTags.map((tg) => {
                  const path = tagPath(tree, tg);
                  const label = path.length
                    ? formatTagChip(path, format)
                    : (TAG_NAMES[tg] || tg);
                  const treeColor = resolveTagColor(tree, tg);
                  const legacy = tagPalette[tg];
                  const fg = treeColor || legacy?.fg || '#94a3b8';
                  const bg = treeColor ? `${treeColor}22` : (legacy?.bg || `${fg}22`);
                  return <span key={tg} className="card-tag" style={{background: bg, color: fg}}>{label}</span>;
                })
              ) : (
                <span className="card-meta empty"><I.Tag/></span>
              )}
              <CardPopover open={openPop==='tag'} onClose={()=>setOpenPop(null)} anchorRef={tagRef}>
                <TagPicker task={task} theme={theme} recents={recents?.tags} isBulk={isBulkEdit}
                  onChange={(p,rv)=>applyChange(p,rv)} onAddTaxonomy={onAddTaxonomy} onClose={()=>setOpenPop(null)}/>
              </CardPopover>
            </span>
          );
        })()}
        {/* Project / Location — hidden on cards by default per the buckets
            redesign. Users who want it visible flip `showLocationOnCards`
            in Settings. We still render the chip if the popover is open
            (so opening it from elsewhere doesn't make it disappear). */}
        {(tweaks?.showLocationOnCards || openPop==='proj') && (
        <span ref={projRef} className={`card-meta-btn${openPop==='proj'?' act':''}`}
          title={proj?`Location: ${proj.label}`:'Set location'}
          onClick={e=>{e.stopPropagation(); setOpenPop(o=>o==='proj'?null:'proj');}}>
          {proj ? (
            <span className="card-loc" style={{color:proj.color+'cc'}}><I.Pin/>{proj.id}</span>
          ) : (
            <span className="card-meta empty"><I.Pin/></span>
          )}
          <CardPopover open={openPop==='proj'} onClose={()=>setOpenPop(null)} anchorRef={projRef}>
            <ProjPicker task={task} recents={recents?.projects} isBulk={isBulkEdit}
              onChange={(p,rv)=>applyChange(p,rv)} onAddTaxonomy={onAddTaxonomy} onClose={()=>setOpenPop(null)}/>
          </CardPopover>
        </span>
        )}
        {/* Time estimate (read-only on project cards) */}
        {renderAsProject ? (
          <span className={`card-meta${projTimeStr?'':' empty'}`} title={projTimeStr?`Sum of children: ${projTimeStr}`:'No time'}>
            <I.Clock/>{projTimeStr||''}
          </span>
        ) : (
          <span ref={timeRef} className={`card-meta-btn${openPop==='time'?' act':''}`}
            title={task.timeEstimate?`Time estimate: ${task.timeEstimate}`:'Set time estimate'}
            onClick={e=>{e.stopPropagation(); setOpenPop(o=>o==='time'?null:'time');}}>
            <span className={`card-meta${task.timeEstimate?'':' empty'}`}><I.Clock/>{task.timeEstimate||''}</span>
            <CardPopover open={openPop==='time'} onClose={()=>setOpenPop(null)} anchorRef={timeRef}>
              <TimePicker task={task} isBulk={isBulkEdit}
                onChange={(p)=>applyChange(p)} onClose={()=>setOpenPop(null)}/>
            </CardPopover>
          </span>
        )}
        {/* Start Date */}
        {!renderAsProject && (
          <span ref={dateRef} className={`card-meta-btn${openPop==='date'?' act':''}`}
            title={task.date?`Start Date: ${task.date}`:'Set Start Date'}
            onClick={e=>{e.stopPropagation(); setOpenPop(o=>o==='date'?null:'date');}}>
            <span className={`card-meta${task.date?'':' empty'}`}><I.Cal/>{task.date ? fmtStartDate(task.date) : ''}</span>
            <CardPopover open={openPop==='date'} onClose={()=>setOpenPop(null)} anchorRef={dateRef}>
              <DatePicker task={task} isBulk={isBulkEdit}
                onChange={(p)=>applyChange(p)} onClose={()=>setOpenPop(null)}/>
            </CardPopover>
          </span>
        )}
        {!renderAsProject && task.dueDate && (() => {
          const lbl = fmtDueDate(task.dueDate);
          const today = D.str(D.today());
          const urgent = task.dueDate <= today;
          return (
            <span className="card-tag" title={`Due Date: ${task.dueDate}`}
              style={{background: urgent ? 'rgba(239,68,68,.18)' : 'rgba(239,68,68,.10)', color:'#ef4444', fontWeight: urgent ? 600 : undefined}}>
              {lbl}
            </span>
          );
        })()}
        {/* Recurrence pill — blue for routines, purple for tasks-with-cadence.
            Visible on every card in Timeline (and via TaskCard reuse, anywhere
            this component renders) per the visual-consistency rule. */}
        {task.recurrence && (
          <span className={`schip ${task.recurrence.isRoutine ? 'schip-routine' : 'schip-recurring'}`}
                title={`Repeats: ${recurrenceLabel(task.recurrence)}${task.recurrence.isRoutine ? ' (routine)' : ''}`}>
            ↻ {recurrenceLabel(task.recurrence)}
          </span>
        )}
        {/* Snooze (visible only when set; reachable via right-click / shortcut otherwise) */}
        {task.snoozedUntil && (
          <span ref={snoozeRef} className={`card-meta-btn${openPop==='snooze'?' act':''}`}
            title={`Snoozed until ${task.snoozedUntil}`}
            onClick={e=>{e.stopPropagation(); setOpenPop(o=>o==='snooze'?null:'snooze');}}>
            <span className="card-meta" style={{color:'#f59e0b'}}><I.Snooze/>{task.snoozedUntil}</span>
            <CardPopover open={openPop==='snooze'} onClose={()=>setOpenPop(null)} anchorRef={snoozeRef}>
              <SnoozePicker task={task} isBulk={isBulkEdit}
                onChange={(p)=>applyChange(p)} onClose={()=>setOpenPop(null)}/>
            </CardPopover>
          </span>
        )}
        {/* Priority */}
        <span ref={priRef} className={`card-meta-btn${openPop==='pri'?' act':''}`}
          title={task.priority||task.pri ? `Priority: ${PRI_INFO[task.priority||task.pri]?.l}` : 'Set priority'}
          onClick={e=>{e.stopPropagation(); setOpenPop(o=>o==='pri'?null:'pri');}}
          style={{marginLeft:'auto'}}>
          <PriBars pri={task.pri||task.priority}/>
          <CardPopover open={openPop==='pri'} onClose={()=>setOpenPop(null)} anchorRef={priRef}>
            <PriPicker task={task} isBulk={isBulkEdit}
              onChange={(p)=>applyChange(p)} onClose={()=>setOpenPop(null)}/>
          </CardPopover>
        </span>
        {/* Snooze popover when snoozedUntil is unset — anchored to the priority button */}
        {!task.snoozedUntil && openPop==='snooze' && (
          <CardPopover open={true} onClose={()=>setOpenPop(null)} anchorRef={priRef}>
            <SnoozePicker task={task} isBulk={isBulkEdit}
              onChange={(p)=>applyChange(p)} onClose={()=>setOpenPop(null)}/>
          </CardPopover>
        )}
        {(() => {
          const n = blockingCountFor ? blockingCountFor(task.id) : 0;
          if(!n) return null;
          return <span className="card-blocking-n" title={`Completing this would unblock ${n} task${n===1?'':'s'}`}>blocks {n}</span>;
        })()}
        {task.blocked && task.blockedSince && (() => {
          const d = daysSince(task.blockedSince);
          const cls = d>=7 ? 'crit' : d>=3 ? 'warn' : '';
          return <span className={`card-aging ${cls}`} title={`Blocked ${d} day${d===1?'':'s'}`}>{d}d</span>;
        })()}
      </div>
      {open && (
        <div className="card-project-body" ref={projectDrop.setNodeRef} onClick={e=>e.stopPropagation()}>
          {kids.length === 0 && (
            <div className="card-proj-empty">Drop or add cards</div>
          )}
          <SortableContext items={kids.map(k => k.id)} strategy={verticalListSortingStrategy}>
            {kids.map((child)=>(
              <React.Fragment key={child.id}>
                <div className="card-add-zone" title="Add above"
                  onClick={e=>{e.stopPropagation();onAdd?.(task.id,null,{beforeId:child.id, parentId:task.id});}}>
                  <button tabIndex={-1}>+</button>
                </div>
                <TaskCard task={child} colKey={task.id} theme={theme} tweaks={tweaks}
                  focused={focusedId===child.id}
                  selected={selectedIds?.has(child.id)}
                  renaming={renamingId===child.id}
                  spawning={spawningSet?.has(child.id)}
                  onOpen={onOpen} onToggle={onToggle} onDelete={onDelete}
                  onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                  sortableData={{ kind: 'task', date: colKey, parentId: task.id }}
                  childrenOf={childrenOf} projectStats={projectStats}
                  collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                  forceOpenProjects={forceOpenProjects}
                  selectedIds={selectedIds} renamingId={renamingId} spawningSet={spawningSet} focusedId={focusedId}
                  onAdd={onAdd}
                  depth={depth+1}
                  blockingCountFor={blockingCountFor} taskTitleById={taskTitleById}
                  onContextMenu={onContextMenu} onBulkUpdate={onBulkUpdate}
                  recents={recents} onRecentTag={onRecentTag} onRecentProj={onRecentProj}
                  openPopRequest={openPopRequest} onPopHandled={onPopHandled}
                  getEffectiveLifeArea={getEffectiveLifeArea}
                  onAddTaxonomy={onAddTaxonomy}
                  onStartRename={onStartRename}
                  />
              </React.Fragment>
            ))}
          </SortableContext>
          <div className="card-add-zone" title="Add card to project"
            onClick={e=>{e.stopPropagation();onAdd?.(task.id,null,{parentId:task.id});}}>
            <button tabIndex={-1}>+</button>
          </div>
        </div>
      )}
      <button className="card-del" onClick={e=>{e.stopPropagation();onDelete(task.id,colKey);}}>×</button>
    </div>
  );
}

export { TaskCard };
