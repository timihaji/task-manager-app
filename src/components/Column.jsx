import React, { useState, useEffect, useRef } from 'react';
import { PROJ, ALL_TAGS, TAG_NAMES, D, DAY_S, LIFE_AREAS, LIFE_AREA_NAMES } from '../data.js';
import { I } from '../utils/icons.jsx';
import { lifeAreaPalette, UNASSIGNED_LIFE_AREA } from '../utils/colors.js';
import { groupTasksBy, getGLabel, getGColor } from '../utils/grouping.js';
import { TaskCard } from './TaskCard.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Tick } from './Tick.jsx';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useTapSpring } from '../hooks/useTapSpring.js';
import { useMagnet } from '../hooks/useMagnet.js';

// Wraps a column or group body so dnd-kit can resolve drops onto empty/padded
// areas (where there's no card under the cursor) to a useful target. Splats
// any extra DOM props (onDoubleClick, style, etc.) so the host can keep the
// element behaving like the original .col-body it replaces.
function ColDroppable({ id, data, className, children, ...rest }) {
  const { setNodeRef, isOver } = useDroppable({ id, data });
  return (
    <div ref={setNodeRef} className={`${className||''}${isOver ? ' drag-over' : ''}`} {...rest}>{children}</div>
  );
}
function GrpDroppable({ id, data, baseClass, isCustom, children }) {
  const { setNodeRef, isOver } = useDroppable({ id, data, disabled: !isCustom });
  return (
    <div ref={isCustom ? setNodeRef : undefined} className={`${baseClass}${isOver && isCustom ? ' grp-drop-into' : ''}`}>{children}</div>
  );
}

// Routine strip pill — draggable so the user can move a routine instance to
// another day. Drop on any part of a target column (body, strip, card)
// reschedules the instance to that date and keeps it as a routine.
// Done pills are not draggable and shake on pointerdown (Q4-A).
function RoutineStripItem({ task, colKey, onToggle, onOpen, onContextMenu }) {
  const btnRef = useRef(null);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `routine:${task.id}`,
    data: { kind: 'routine-instance', taskId: task.id, date: colKey },
    disabled: !!task.done,
  });
  const setRefs = (el) => { btnRef.current = el; setNodeRef(el); };
  const onPointerDownDone = (e) => {
    if (!task.done) return;
    const el = btnRef.current;
    if (!el) return;
    el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(-2px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 240, easing: 'ease-out' }
    );
  };
  // Click semantics:
  //   • Click the dot → toggle done (stopPropagation so body doesn't react).
  //   • Click the body (name) → open drawer. Single-click for speed; no
  //     double-click required. This means body-clicks NEVER toggle complete,
  //     which avoids the "double-click marks complete then unmarks then opens
  //     drawer" flicker the previous wiring produced.
  //   • Right-click → ContextMenu.
  //   • Enter (when focused) → open drawer.
  return (
    <button
      ref={setRefs}
      className={`crs-item${task.done ? ' done' : ''}${isDragging ? ' is-dragging' : ''}`}
      data-routine-id={task.id}
      onClick={(e) => { e.stopPropagation(); onOpen?.(task.id); }}
      onContextMenu={(e) => { if (onContextMenu) { e.preventDefault(); e.stopPropagation(); onContextMenu(task, e.clientX, e.clientY); } }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onOpen?.(task.id); } }}
      onPointerDown={onPointerDownDone}
      title={`${task.title} — click name to edit · click ○ to ${task.done ? 'undo' : 'complete'} · ${task.done ? 'undo first to move' : 'drag to another day to reschedule'}`}
      {...(task.done ? {} : listeners)}
      {...(task.done ? {} : attributes)}>
      <span className="crs-dot" role="button" aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
        onClick={(e) => { e.stopPropagation(); onToggle?.(task.id); }}
        onPointerDown={(e) => e.stopPropagation()}/>
      <span className="crs-name">{task.title}</span>
    </button>
  );
}

// Drop target wrapping the routine strip — gives the strip its own
// highlight when hovered during a routine-pill drag, but reschedule
// semantics are identical to dropping anywhere else on the column.
function RoutineStripDropZone({ colKey, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-strip:${colKey}`,
    data: { kind: 'routine-strip', date: colKey },
  });
  return (
    <div ref={setNodeRef} className={`col-routines-strip${isOver ? ' strip-drop-target' : ''}`} role="group" aria-label="Routines for this day">
      {children}
    </div>
  );
}

function Column({ date, tasks, focusedCardId, selectedIds, spawning, theme, tweaks, groupBy, collapsedGrps, completedOpen, blockedOpen,
  onToggleGrp, onToggleCompleted, onToggleBlocked, onAdd, onOpen, onToggle, onDelete,
  onFocus, onSelect, renamingId, onRename, onRenameDone,
  childrenOf, projectStats, collapsedProjects, onToggleProject, forceOpenProjects,
  blockingCountFor, taskTitleById,
  showRoutines=true,
  todayPinned=true, onToggleTodayPin,
  cardExtras, className='', style }) {
  const addTap = useTapSpring();
  const [addBtnRef, addMagnet] = useMagnet({ range: 80, pull: 0.4 });
  const dow = date.getDay();
  const colKey = D.str(date);
  const past = D.isPast(colKey);
  const today = D.isTdy(colKey);
  // Routines: pull out into their own folded section so daily routines don't
  // clutter the day's active flow. Include both done + active so the user
  // can see "2/4 routines done today" at a glance via the header counter.
  const routines = tasks.filter(t => t.recurrence?.isRoutine && !t.blocked);
  const routineIds = new Set(routines.map(t => t.id));
  const routinesDone = routines.filter(t => t.done).length;
  const active  = tasks.filter(t=>!t.done && !t.blocked && !routineIds.has(t.id));
  const blocked = tasks.filter(t=>!t.done &&  t.blocked);
  const done    = tasks.filter(t=>t.done && !routineIds.has(t.id));
  // Flatten counter: count children inside project shells, not the shells themselves.
  // Blocked tasks (and blocked children of projects) are excluded from the day's progress math.
  const flatten = (list) => list.flatMap(t => t.cardType==='project' ? (childrenOf?.(t.id)||[]).filter(k=>!k.blocked) : [t]);
  const flatActive = flatten(active);
  const flatDone   = flatten(done).concat((childrenOf? active.filter(t=>t.cardType==='project').flatMap(p=>(childrenOf(p.id)||[]).filter(k=>k.done && !k.blocked)):[]));
  const flatActiveSet = new Set(flatActive.filter(t=>!t.done && !t.blocked).map(t=>t.id));
  const flatDoneSet   = new Set(flatActive.filter(t=>t.done && !t.blocked).map(t=>t.id).concat(flatDone.map(t=>t.id)));
  const totalCount = flatActiveSet.size + flatDoneSet.size;
  const doneCount  = flatDoneSet.size;
  const pct = totalCount>0 ? (doneCount/totalCount)*100 : 0;
  const groups = groupTasksBy(active, groupBy, cardExtras?.getEffectiveLifeArea, cardExtras?.customGroups);
  const renamingGroupId = cardExtras?.renamingGroupId;
  const onStartGroupRename = cardExtras?.onStartGroupRename;
  const onGroupRenameDone = cardExtras?.onGroupRenameDone;
  const onRenameGroup = cardExtras?.onRenameGroup;
  const gbLabel = {none:'None',project:'Location',lifeArea:'Life Area',tag:'Tag',priority:'Priority'}[groupBy]||'Location';
  // grpKey carried in sortable data so dndOnDragEnd's same-context check
  // can distinguish cards in different groups of the same column. Without
  // it, cross-group drops within one column wouldn't get the manual drop-
  // line gap (because date+parent match), and the user would have no
  // visual cue for the destination slot — dnd-kit's per-group
  // SortableContext doesn't shift cards across context boundaries.
  const cardSortable = (task, grpKey) => ({ kind: 'task', date: colKey, parentId: task.parentId || null, grpKey });

  return (
    <div className={`col${past?' is-past':''}${today?' is-today':''}${className?` ${className}`:''}`}
      style={style}
      data-col-key={colKey}
      data-screen-label={`${DAY_S[dow]} ${date.getDate()}`}>
      <div className="col-hdr">
        <div className="col-day">{DAY_S[dow]}</div>
        {today && onToggleTodayPin && (
          <button
            className={`col-today-pin${todayPinned ? ' pinned' : ''}`}
            onClick={onToggleTodayPin}
            title={todayPinned ? 'Unpin today column' : 'Pin today column'}
            aria-pressed={!!todayPinned}
          ><I.Tack/></button>
        )}
        <div className="col-date-row">
          <div className="col-date">{date.getDate()}</div>
          {today && <span className="col-today-badge">Today</span>}
        </div>
        <div className="col-meta">
          <span className="col-cnt"><Tick value={doneCount}/>/<Tick value={totalCount}/></span>
          <div className="col-prog"><div className="col-prog-fill" style={{width:`${pct}%`}}/></div>
        </div>
      </div>
      <div className="col-divider"/>
      <ColDroppable id={`col:${colKey}`} data={{ kind: 'column', date: colKey }} className="col-body"
        onDoubleClick={e=>{ if(!e.target.closest('.card,.grp-hdr,.done-grp-hdr,.routines-grp-hdr,.card-add-zone,.col-routines-strip,.crs-item,.crs-hdr')) onAdd(colKey,date); }}>
        {/* Routines strip — pinned at the top of each day column. Wrapped in
            a .grp-free + phantom .card-add-zone so its TOP sits at the same
            y as a regular first card in adjacent columns (the card-add-zone
            contributes ~17px of vertical offset that an unwrapped strip
            would otherwise miss). Strip is chrome — it never participates in
            drag/FLIP and is filtered out of the priority/active card list. */}
        {showRoutines && routines.length > 0 && (
          <div className="grp-free col-routines-grp">
            <div className="card-add-zone col-routines-spacer" aria-hidden="true"/>
            <RoutineStripDropZone colKey={colKey}>
              <div className="crs-hdr">
                <span className="crs-label">ROUTINES</span>
                <span className="crs-count">{routinesDone}/{routines.length}</span>
              </div>
              <div className="crs-items">
                {routines.map(t => (
                  <RoutineStripItem key={t.id}
                    task={t}
                    colKey={colKey}
                    onToggle={onToggle}
                    onOpen={onOpen}
                    onContextMenu={cardExtras?.onContextMenu}/>
                ))}
              </div>
            </RoutineStripDropZone>
          </div>
        )}
        {/* Per-group SortableContext (was a single context wrapping every group).
            With one flat context, dnd-kit's verticalListSortingStrategy treated
            the whole column as a flat list and visibly pushed cards across
            group boundaries during a drag. Each group now has its own context,
            so transforms stay within the group. Cross-group reorders still
            work via the existing group-target droppable. */}
        {groups.map(grp=>{
          const gKey=`${colKey}:${grp.key}`;
          const open=!collapsedGrps.has(gKey);
          const isCustom = !!grp.custom;
          const grpSortableIds = open ? grp.tasks.map(t => t.id) : [];
          return (
            <GrpDroppable
              key={grp.key}
              id={`grp:${colKey}:${grp.groupId || grp.key}`}
              data={{ kind: 'group-target', groupId: grp.groupId, colKey }}
              baseClass={grp.label?'grp-box':'grp-free'}
              isCustom={isCustom}
            >
              {grp.label && (
                <div className={`grp-hdr${grp.custom?' grp-hdr-custom':''}`} onClick={()=>onToggleGrp(gKey)}>
                  <svg className={`grp-chv${open?' open':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  {grp.custom && grp.groupId === renamingGroupId ? (
                    <input
                      className="grp-name-edit"
                      autoFocus
                      defaultValue={grp.label}
                      onClick={e=>e.stopPropagation()}
                      onBlur={e=>{ onRenameGroup?.(grp.groupId, e.target.value); onGroupRenameDone?.(); }}
                      onKeyDown={e=>{
                        if (e.key==='Enter') e.target.blur();
                        if (e.key==='Escape') { e.target.value=grp.label; onGroupRenameDone?.(); }
                      }}
                    />
                  ) : (
                    <span className="grp-name"
                          style={{color: grp.custom ? grp.color : getGColor(grp.key, groupBy, theme)}}
                          onDoubleClick={e=>{ if (grp.custom) { e.stopPropagation(); onStartGroupRename?.(grp.groupId); } }}
                          title={grp.custom ? 'Double-click to rename' : undefined}>
                      {grp.label}
                    </span>
                  )}
                  <span className="grp-cnt">{grp.tasks.length}</span>
                  {grp.custom && (
                    <button className="grp-add-btn"
                            title="Add task to this group"
                            onClick={e=>{e.stopPropagation();onAdd(colKey,date,{groupId:grp.groupId});}}>+</button>
                  )}
                </div>
              )}
              <SortableContext items={grpSortableIds} strategy={verticalListSortingStrategy}>
              {open && grp.tasks.map((task,i)=>(
                <React.Fragment key={task.id}>
                  <div className="card-add-zone" title="Add above" onClick={e=>{e.stopPropagation();onAdd(colKey,date,{beforeId:task.id, ...(grp.custom?{groupId:grp.groupId}:{})});}}>
                    <button tabIndex={-1}>+</button>
                  </div>
                  <TaskCard task={task} colKey={colKey} theme={theme} tweaks={tweaks} focused={focusedCardId===task.id}
                    selected={selectedIds?.has(task.id)}
                    renaming={renamingId===task.id} spawning={spawning?.has(task.id)} onOpen={onOpen} onToggle={onToggle} onDelete={onDelete}
                    onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                    sortableData={cardSortable(task, grp.key)}
                    childrenOf={childrenOf} projectStats={projectStats}
                    collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                    forceOpenProjects={forceOpenProjects}
                    selectedIds={selectedIds} renamingId={renamingId} spawningSet={spawning} focusedId={focusedCardId}
                    onAdd={onAdd}
                    blockingCountFor={blockingCountFor} taskTitleById={taskTitleById}
                    getEffectiveLifeArea={cardExtras?.getEffectiveLifeArea}
                    {...(cardExtras||{})}/>
                  {i===grp.tasks.length-1 && (
                    <div className="card-add-zone" title="Add below" onClick={e=>{e.stopPropagation();onAdd(colKey,date,{afterId:task.id, ...(grp.custom?{groupId:grp.groupId}:{})});}}>
                      <button tabIndex={-1}>+</button>
                    </div>
                  )}
                </React.Fragment>
              ))}
              </SortableContext>
            </GrpDroppable>
          );
        })}
        {/* "All done for today" celebratory empty state — appears only when
            today's column has no active or blocked tasks left AND there are
            completed tasks to celebrate. Avoids showing on empty future/past days. */}
        {today && active.length===0 && blocked.length===0 && done.length>0 && (
          <div className="col-empty-celebrate">
            <div className="cec-icon"><I.Check/></div>
            <h4>All done for today</h4>
            <p>Take a break, or capture the next thing.</p>
          </div>
        )}
        {blocked.length>0 && (
          <>
            <div className="blocked-grp-hdr" onClick={()=>onToggleBlocked?.(colKey)}>
              <svg className={`grp-chv${blockedOpen?' open':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              <span className="grp-name">Blocked</span>
              <span className="grp-cnt">{blocked.length}</span>
            </div>
            {blockedOpen && blocked.map(task=>(
              <TaskCard key={task.id} task={task} colKey={colKey} theme={theme} tweaks={tweaks}
                focused={focusedCardId===task.id} renaming={renamingId===task.id} spawning={spawning?.has(task.id)}
                selected={selectedIds?.has(task.id)}
                onOpen={onOpen} onToggle={onToggle} onDelete={onDelete}
                onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                childrenOf={childrenOf} projectStats={projectStats}
                collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                forceOpenProjects={forceOpenProjects}
                selectedIds={selectedIds} renamingId={renamingId} spawningSet={spawning} focusedId={focusedCardId}
                onAdd={onAdd}
                blockingCountFor={blockingCountFor} taskTitleById={taskTitleById}
                getEffectiveLifeArea={cardExtras?.getEffectiveLifeArea}
                {...(cardExtras||{})}/>
            ))}
          </>
        )}
        {done.length>0 && (
          <>
            <div className="done-grp-hdr" onClick={()=>onToggleCompleted(colKey)}>
              <svg className={`grp-chv${completedOpen?' open':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              <span className="grp-name" style={{color:'var(--t4)'}}>Completed</span>
              <span className="grp-cnt">{done.length}</span>
            </div>
            {completedOpen && done.map(task=>(
              <TaskCard key={task.id} task={task} colKey={colKey} theme={theme} tweaks={tweaks}
                focused={focusedCardId===task.id} renaming={renamingId===task.id} spawning={spawning?.has(task.id)}
                selected={selectedIds?.has(task.id)}
                onOpen={onOpen} onToggle={onToggle} onDelete={onDelete}
                onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                sortableData={{ kind: 'completed-task', date: colKey, parentId: task.parentId || null }}
                childrenOf={childrenOf} projectStats={projectStats}
                collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                forceOpenProjects={forceOpenProjects}
                selectedIds={selectedIds} renamingId={renamingId} spawningSet={spawning} focusedId={focusedCardId}
                onAdd={onAdd}
                blockingCountFor={blockingCountFor} taskTitleById={taskTitleById}
                getEffectiveLifeArea={cardExtras?.getEffectiveLifeArea}
                {...(cardExtras||{})}/>
            ))}
          </>
        )}
      </ColDroppable>
      <div className="col-add-magnet-zone"
           onPointerMove={addMagnet.onPointerMove}
           onPointerLeave={addMagnet.onPointerLeave}>
        <button className="col-add no-press"
                ref={addBtnRef}
                {...addTap.props}
                style={{ transform: `${addMagnet.transform} scale(${addTap.scale})` }}
                onClick={()=>onAdd(colKey,date)}>
          <I.Plus/> Add task
        </button>
      </div>
    </div>
  );
}

// ── InboxColumn ──────────────────────────────────────────────────────────
function InboxCol({ tasks, theme, tweaks, focusedCardId, selectedIds, renamingId, spawning, width, collapsed, panelView, onPanelView, onCollapse, onResizeStart, onAdd, onOpen, onToggle, onDelete, onFocus, onSelect, onRename, onRenameDone,
  childrenOf, projectStats, collapsedProjects, onToggleProject, forceOpenProjects,
  inboxFilters, onCycleInboxFilter, onClearInboxFilters, inboxFilterCount,
  inboxGroupBy, onInboxGroupBy, collapsedGrps, onToggleGrp, cardExtras }) {
  const [cap, setCap] = useState('');
  const [viewOpen, setViewOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const filterRef = useRef(null);
  const groupRef = useRef(null);
  useEffect(()=>{
    if(!groupOpen) return;
    const fn = e => { if(groupRef.current && !groupRef.current.contains(e.target)) setGroupOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [groupOpen]);
  useEffect(()=>{
    if(!filterOpen) return;
    const fn = e => { if(filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [filterOpen]);
  const FilterRow = ({kind,val,label,color}) => {
    const state = inboxFilters?.[kind]?.[val];
    const sym = state==='inc' ? '+' : state==='exc' ? '−' : '';
    const symColor = state==='inc' ? 'var(--accent)' : state==='exc' ? '#ef4444' : 'var(--t4)';
    return (
      <div className="fdd-item" onClick={e=>{e.stopPropagation();onCycleInboxFilter(kind,val);}} style={{justifyContent:'flex-start'}}>
        <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:14,height:14,border:'1px solid var(--border-s)',borderRadius:2,fontFamily:'var(--mono)',fontSize:11,fontWeight:700,color:symColor,background:state?'var(--surface-2)':'transparent',flexShrink:0}}>{sym}</span>
        {color && <span style={{width:6,height:6,borderRadius:1,background:color,flexShrink:0}}/>}
        <span style={{flex:1}}>{label}</span>
      </div>
    );
  };
  const submit = () => { if(!cap.trim())return; onAdd(null,null,cap.trim()); setCap(''); };
  const insertable = panelView==='inbox' || panelView==='backlog';
  const splitDone = panelView==='inbox' || panelView==='backlog' || panelView==='timeline';
  const inboxTasks = splitDone ? tasks.filter(t=>!t.done) : tasks;
  const doneTasks  = splitDone ? tasks.filter(t=>t.done) : [];
  const panelLimit = 250;
  const visibleInboxTasks = inboxTasks.slice(0, panelLimit);
  const remainingSlots = Math.max(0, panelLimit - visibleInboxTasks.length);
  const visibleDoneTasks = doneTasks.slice(0, remainingSlots);
  const cardSortable = (task, grpKey) => ({ kind: 'task', date: null, parentId: task.parentId || null, grpKey });
  const views = [
    ['timeline','Timeline'],['inbox','Inbox'],['upcoming','Upcoming'],['backlog','Backlog'],
    ['snoozed','Snoozed'],['someday','Someday'],['blocked','Blocked'],['completed','Completed'],['archived','Archived'],
  ];
  const activeLabel = views.find(([v])=>v===panelView)?.[1] || 'Inbox';
  return (
    <div className={`side-panel inbox-col${collapsed?' collapsed':''}`} data-col-key="inbox" style={{width, minWidth:collapsed?34:132, left:0}}>
      <div className="inbox-hdr">
        <div className="side-panel-tools">
          <div style={{position:'relative'}}>
            <button className="inbox-title" onClick={()=>setViewOpen(o=>!o)}
              style={{border:'none',background:'transparent',padding:0,cursor:'pointer'}}>{activeLabel}</button>
            {viewOpen && (
              <div className="filter-dd" style={{left:0,right:'auto',top:'calc(100% + 4px)',minWidth:130}}>
                {views.map(([v,label])=><div key={v} className="fdd-item" onClick={()=>{onPanelView(v);setViewOpen(false);}}>{label}</div>)}
              </div>
            )}
          </div>
          <div style={{flex:1}}/>
          {!collapsed && (
            <div ref={groupRef} style={{position:'relative'}}>
              <button className="side-collapse" onClick={e=>{e.stopPropagation();setGroupOpen(o=>!o);}} title="Group inbox"
                style={inboxGroupBy && inboxGroupBy!=='none'?{color:'var(--accent)'}:undefined}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>
              </button>
              {groupOpen && (
                <div className="filter-dd" onClick={e=>e.stopPropagation()} style={{left:'auto',right:0,top:'calc(100% + 4px)',minWidth:140}}>
                  <div style={{padding:'5px 12px 6px',fontSize:9.5,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',borderBottom:'1px solid var(--border)'}}>Group by</div>
                  {[{v:'none',l:'None'},{v:'project',l:'Location'},{v:'lifeArea',l:'Life Area'},{v:'tag',l:'Tag'},{v:'priority',l:'Priority'}].map(o=>(
                    <div key={o.v} className={`fdd-item${inboxGroupBy===o.v?' active':''}`}
                      onClick={()=>{onInboxGroupBy(o.v);setGroupOpen(false);}}
                      style={inboxGroupBy===o.v?{color:'var(--accent)'}:undefined}>{o.l}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!collapsed && (
            <div ref={filterRef} style={{position:'relative'}}>
              <button className="side-collapse" onClick={e=>{e.stopPropagation();setFilterOpen(o=>!o);}} title="Filter inbox"
                style={inboxFilterCount>0?{color:'var(--accent)'}:undefined}>
                <I.Filter/>
              </button>
              {inboxFilterCount>0 && <span style={{position:'absolute',top:-2,right:-2,minWidth:12,height:12,padding:'0 3px',borderRadius:6,background:'var(--accent)',color:'#fff',fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1,pointerEvents:'none'}}>{inboxFilterCount}</span>}
              {filterOpen && (
                <div className="filter-dd" onClick={e=>e.stopPropagation()} style={{left:'auto',right:0,top:'calc(100% + 4px)',minWidth:200,maxHeight:'60vh',overflowY:'auto'}}>
                  <div style={{padding:'5px 12px 6px',display:'flex',alignItems:'center',gap:6,borderBottom:'1px solid var(--border)'}}>
                    <span style={{fontSize:9.5,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--t4)',flex:1}}>Inbox filter</span>
                    <button onClick={onClearInboxFilters} disabled={!inboxFilterCount}
                      style={{border:'none',background:'transparent',color:inboxFilterCount?'var(--t3)':'var(--t4)',font:'10px var(--font)',cursor:inboxFilterCount?'pointer':'default',padding:'2px 4px'}}>Clear</button>
                  </div>
                  <div style={{padding:'4px 12px',fontSize:9.5,color:'var(--t4)',lineHeight:1.4}}>Click to cycle: + include · − exclude · off</div>
                  <div className="fdd-section">
                    <div className="fdd-label">Location</div>
                    {PROJ.map(p=><FilterRow key={p.id} kind="projects" val={p.id} label={p.label} color={p.color}/>)}
                  </div>
                  <div className="fdd-sep"/>
                  <div className="fdd-section">
                    <div className="fdd-label">Priority</div>
                    {['p1','p2','p3'].map(p=><FilterRow key={p} kind="priorities" val={p} label={p.toUpperCase()}/>)}
                  </div>
                  <div className="fdd-sep"/>
                  <div className="fdd-section">
                    <div className="fdd-label">Life Area</div>
                    {LIFE_AREAS.map(id=><FilterRow key={id} kind="lifeAreas" val={id} label={LIFE_AREA_NAMES[id]||id} color={lifeAreaPalette(id, theme).fg}/>)}
                    <FilterRow kind="lifeAreas" val={UNASSIGNED_LIFE_AREA} label="Unassigned"/>
                  </div>
                  <div className="fdd-sep"/>
                  <div className="fdd-section">
                    <div className="fdd-label">Tag</div>
                    {ALL_TAGS.map(t=><FilterRow key={t} kind="tags" val={t} label={TAG_NAMES[t]||t}/>)}
                  </div>
                </div>
              )}
            </div>
          )}
          <button className="side-collapse" onClick={onCollapse} title={collapsed?'Expand inbox':'Collapse inbox'}><I.Chv d={collapsed?'r':'l'}/></button>
        </div>
        <div className="inbox-cnt"><Tick value={tasks.length}/></div>
      </div>
      <div className="inbox-capture">
        <input placeholder="Capture…" value={cap} onChange={e=>setCap(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&submit()}/>
        <button onClick={submit}>+</button>
      </div>
      <ColDroppable id="col:inbox" data={{ kind: 'column', date: null }} className="col-body"
        style={{flex:1}}
        onDoubleClick={e=>{ if(insertable && !e.target.closest('.card,.card-add-zone,.grp-hdr')) onAdd(null,null,'Untitled'); }}>
        {tasks.length===0 && <EmptyState kind="inbox" title="Inbox is clear" hint={<>Capture anything — type above, or press <kbd>Ctrl</kbd>+<kbd>Space</kbd> from anywhere.</>}/>}
        {/* Per-group SortableContext (was a single context wrapping every group). */}
        {(()=>{
          const customGroups = cardExtras?.customGroups || [];
          const renamingGroupId = cardExtras?.renamingGroupId;
          const onStartGroupRename = cardExtras?.onStartGroupRename;
          const onGroupRenameDone = cardExtras?.onGroupRenameDone;
          const onRenameGroup = cardExtras?.onRenameGroup;
          const useGroups = (inboxGroupBy && inboxGroupBy!=='none') || customGroups.length>0;
          const groups = useGroups
            ? groupTasksBy(visibleInboxTasks, inboxGroupBy, cardExtras?.getEffectiveLifeArea, customGroups)
            : [{key:'_all',label:null,tasks:visibleInboxTasks}];
          return groups.map(grp=>{
            const gKey = `inbox:${grp.key}`;
            const open = !collapsedGrps?.has(gKey);
            const isCustom = !!grp.custom;
            const grpSortableIds = open ? grp.tasks.map(t => t.id) : [];
            return (
              <GrpDroppable
                key={grp.key}
                id={`grp:inbox:${grp.groupId || grp.key}`}
                data={{ kind: 'group-target', groupId: grp.groupId, colKey: 'inbox' }}
                baseClass={grp.label?'grp-box':'grp-free'}
                isCustom={isCustom}
              >
                {grp.label && (
                  <div className={`grp-hdr${grp.custom?' grp-hdr-custom':''}`} onClick={()=>onToggleGrp?.(gKey)}>
                    <svg className={`grp-chv${open?' open':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                    {grp.custom && grp.groupId === renamingGroupId ? (
                      <input className="grp-name-edit" autoFocus defaultValue={grp.label}
                        onClick={e=>e.stopPropagation()}
                        onBlur={e=>{ onRenameGroup?.(grp.groupId, e.target.value); onGroupRenameDone?.(); }}
                        onKeyDown={e=>{ if(e.key==='Enter') e.target.blur(); if(e.key==='Escape'){ e.target.value=grp.label; onGroupRenameDone?.(); } }}/>
                    ) : (
                      <span className="grp-name"
                        style={{color: grp.custom ? grp.color : getGColor(grp.key, inboxGroupBy, theme)}}
                        onDoubleClick={e=>{ if(grp.custom){ e.stopPropagation(); onStartGroupRename?.(grp.groupId); } }}
                        title={grp.custom ? 'Double-click to rename' : undefined}>
                        {grp.label}
                      </span>
                    )}
                    <span className="grp-cnt">{grp.tasks.length}</span>
                    {grp.custom && (
                      <button className="grp-add-btn"
                              title="Add task to this group"
                              onClick={e=>{e.stopPropagation();onAdd(null,null,'Untitled',{groupId:grp.groupId});}}>+</button>
                    )}
                  </div>
                )}
                <SortableContext items={grpSortableIds} strategy={verticalListSortingStrategy}>
                {open && grp.tasks.map((task,i)=>(
                  <React.Fragment key={task.id}>
                    {insertable && <div className="card-add-zone" title="Add above" onClick={e=>{e.stopPropagation();onAdd(null,null,'Untitled',{beforeId:task.id, ...(grp.custom?{groupId:grp.groupId}:{})});}}>
                      <button tabIndex={-1}>+</button>
                    </div>}
                    <TaskCard task={task} colKey={task.date||'inbox'} theme={theme} tweaks={tweaks} focused={focusedCardId===task.id}
                      selected={selectedIds?.has(task.id)}
                      renaming={renamingId===task.id} spawning={spawning?.has(task.id)} onOpen={onOpen} onToggle={onToggle}
                      onDelete={onDelete} onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                      sortableData={cardSortable(task, grp.key)}
                      childrenOf={childrenOf} projectStats={projectStats}
                      collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                      forceOpenProjects={forceOpenProjects}
                      selectedIds={selectedIds} renamingId={renamingId} spawningSet={spawning} focusedId={focusedCardId}
                      onAdd={onAdd}
                      getEffectiveLifeArea={cardExtras?.getEffectiveLifeArea}
                      {...(cardExtras||{})}/>
                    {insertable && i===grp.tasks.length-1 && <div className="card-add-zone" title="Add below" onClick={e=>{e.stopPropagation();onAdd(null,null,'Untitled',{afterId:task.id});}}>
                      <button tabIndex={-1}>+</button>
                    </div>}
                  </React.Fragment>
                ))}
                </SortableContext>
              </GrpDroppable>
            );
          });
        })()}
        {doneTasks.length>0 && (
          <div style={{marginTop:6,paddingTop:6,borderTop:'1px solid var(--border)'}}>
            {visibleDoneTasks.map(task=>(
              <TaskCard key={task.id} task={task} colKey={task.date||'inbox'} theme={theme} tweaks={tweaks} focused={focusedCardId===task.id}
                selected={selectedIds?.has(task.id)}
                renaming={renamingId===task.id} spawning={false} onOpen={onOpen} onToggle={onToggle} onDelete={onDelete}
                onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                childrenOf={childrenOf} projectStats={projectStats}
                collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                forceOpenProjects={forceOpenProjects}
                selectedIds={selectedIds} renamingId={renamingId} spawningSet={spawning} focusedId={focusedCardId}
                onAdd={onAdd}
                getEffectiveLifeArea={cardExtras?.getEffectiveLifeArea}
                {...(cardExtras||{})}/>
            ))}
          </div>
        )}
        {tasks.length>panelLimit && <div className="list-note">Showing first {panelLimit} of {tasks.length}. Search or filter to narrow this panel.</div>}
      </ColDroppable>
      {!collapsed && <div className="side-resizer" onMouseDown={e=>onResizeStart(e,'inbox')}/>}
    </div>
  );
}

// ── LeftNav ──────────────────────────────────────────────────────────────

export { Column, InboxCol };
