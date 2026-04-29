import React, { useState, useEffect, useRef } from 'react';
import { PROJ, ALL_TAGS, TAG_NAMES, TAG_DARK, TAG_LIGHT, LIFE_AREAS, LIFE_AREA_NAMES, fmtTimeEst, daysSince, isStale } from '../data.js';
import { I } from '../utils/icons.jsx';
import { PRI_INFO } from '../utils/constants.js';
import { lifeAreaPalette, UNASSIGNED_LIFE_AREA } from '../utils/colors.js';
import { groupTasksBy, getGLabel, getGColor } from '../utils/grouping.js';
import { CardPopover } from './CardPopover.jsx';
import { TagPicker, ProjPicker, TimePicker, DatePicker, PriPicker, SnoozePicker } from './pickers.jsx';
import { PriBars } from './PriBars.jsx';

// ── TaskCard ─────────────────────────────────────────────────────────────
function TaskCard({ task, colKey, theme, focused, selected, renaming, spawning, onOpen, onToggle, onDelete, onFocus, onSelect, onRename, onRenameDone, onDragStart, onDragEnd, isDragging,
  childrenOf, projectStats, collapsedProjects, onToggleProject, forceOpenProjects,
  onCardDragOver, onCardDragLeave, onCardDrop, cardDragOver,
  selectedIds, renamingId, spawningSet, focusedId, onAdd, depth=0, blockingCountFor, taskTitleById,
  onContextMenu, onBulkUpdate, recents, onRecentTag, onRecentProj, openPopRequest, onPopHandled, getEffectiveLifeArea }) {
  const tagPalette = theme==='dark'?TAG_DARK:TAG_LIGHT;
  const tp = tagPalette[task.tags?.[0]] || tagPalette.admin;
  const proj = PROJ.find(p=>p.id===task.project);
  const effectiveLifeArea = getEffectiveLifeArea ? getEffectiveLifeArea(task) : task.lifeArea;
  const effectiveLifeAreaMeta = effectiveLifeArea ? lifeAreaPalette(effectiveLifeArea, theme) : null;
  const [draft,setDraft] = useState(task.title || '');
  const [openPop, setOpenPop] = useState(null);
  const tagRef = useRef(null);
  const projRef = useRef(null);
  const timeRef = useRef(null);
  const dateRef = useRef(null);
  const priRef = useRef(null);
  const snoozeRef = useRef(null);
  const editRef = useRef(null);

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
  const stats = renderAsProject && projectStats ? projectStats(task) : null;
  const isCollapsed = collapsedProjects?.has(task.id) && !forceOpenProjects?.has(task.id);
  const open = renderAsProject && !isCollapsed;
  const kids = renderAsProject ? (childrenOf?.(task.id) || []) : [];
  const isDropTarget = cardDragOver?.targetId === task.id;
  const dropIndex = (cardDragOver?.targetId === task.id) ? cardDragOver.index : -1;
  const projTimeStr = renderAsProject && stats?.mins ? fmtTimeEst(stats.mins) : '';
  const pct = stats && stats.total>0 ? (stats.done/stats.total)*100 : 0;

  const isStaleCard = isStale(task);
  return (
    <div className={`card${focused?' focused':''}${selected?' selected':''}${isDragging?' dragging':''}${spawning?' spawning':''}${renderAsProject?' card-project':''}${isDropTarget?' card-drop-target':''}${task.blocked?' blocked':''}${isStaleCard?' card-stale':''}${task.checkInOf?' card-checkin':''}`}
      data-card-id={task.id}
      title={task.blocked ? (task.blockedReason || 'Blocked') + ((task.blockedBy||[]).length && taskTitleById ? '\nWaiting on: ' + (task.blockedBy||[]).map(id=>taskTitleById(id)).filter(Boolean).join(', ') : '') : undefined}
      draggable={!renaming} onClick={()=>!renaming&&!openPop&&onOpen(task.id)}
      onContextMenu={e=>{ if(onContextMenu){ e.preventDefault(); e.stopPropagation(); onContextMenu(task, e.clientX, e.clientY); } }}
      onMouseEnter={()=>onFocus(task.id)}
      onMouseLeave={()=>onFocus(null)}
      onDragStart={e=>{e.stopPropagation();onDragStart(e,task.id,colKey);}}
      onDragEnd={onDragEnd}
      onDragOver={onCardDragOver?e=>onCardDragOver(e,task):undefined}
      onDragLeave={onCardDragLeave?e=>onCardDragLeave(e,task):undefined}
      onDrop={onCardDrop?e=>onCardDrop(e,task):undefined}
    >
      <div className="card-top">
        <button className={`bulk-check${selected?' on':''}`} title={selected?'Deselect task':'Select task'}
          onClick={e=>{e.stopPropagation();onSelect(task.id);}}>{selected?'✓':''}</button>
        <div className={`card-chk${task.done?' done':''}`} onClick={e=>{e.stopPropagation();onToggle(task.id,colKey);}}/>
        {renaming ? (
          <input ref={editRef} className="card-title-input" value={draft}
            onClick={e=>e.stopPropagation()}
            onChange={e=>setDraft(e.target.value)}
            onBlur={()=>finishRename(true)}
            onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();finishRename(true);} if(e.key==='Escape'){e.preventDefault();finishRename(false);} }}/>
        ) : (
          <div className={`card-title${task.done?' done':''}`}>{task.title}</div>
        )}
        {renderAsProject && (
          <button className="card-proj-chv" title={open?'Collapse project':'Expand project'}
            onClick={e=>{e.stopPropagation();onToggleProject?.(task.id);}}>
            <svg className={`grp-chv${open?' open':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        )}
      </div>
      {renderAsProject && stats?.total>0 && (
        <div className="card-proj-stat">
          <span className="card-proj-prog"><span className="card-proj-prog-fill" style={{width:`${pct}%`}}/></span>
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
        {effectiveLifeArea && effectiveLifeAreaMeta && (
          <span className="card-tag card-tag-life" style={{background:effectiveLifeAreaMeta.bg,color:effectiveLifeAreaMeta.fg}}
            title={`Life Area: ${LIFE_AREA_NAMES[effectiveLifeArea] || effectiveLifeArea}`}>
            {LIFE_AREA_NAMES[effectiveLifeArea] || effectiveLifeArea}
          </span>
        )}
        {/* Tag */}
        <span ref={tagRef} className={`card-meta-btn${openPop==='tag'?' act':''}`}
          title={task.tags?.length ? `Tags: ${task.tags.map(t=>TAG_NAMES[t]||t).join(', ')}` : 'Set tag'}
          onClick={e=>{e.stopPropagation(); setOpenPop(o=>o==='tag'?null:'tag');}}>
          {task.tags?.length ? (
            task.tags.map((tg,i)=>{
              const p = tagPalette[tg] || tagPalette.admin;
              return <span key={tg} className="card-tag" style={{background:p.bg,color:p.fg}}>{i===0 && <I.Tag/>}{TAG_NAMES[tg]||tg}</span>;
            })
          ) : (
            <span className="card-meta empty"><I.Tag/></span>
          )}
          <CardPopover open={openPop==='tag'} onClose={()=>setOpenPop(null)} anchorRef={tagRef}>
            <TagPicker task={task} theme={theme} recents={recents?.tags} isBulk={isBulkEdit}
              onChange={(p,rv)=>applyChange(p,rv)} onClose={()=>setOpenPop(null)}/>
          </CardPopover>
        </span>
        {/* Project */}
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
              onChange={(p,rv)=>applyChange(p,rv)} onClose={()=>setOpenPop(null)}/>
          </CardPopover>
        </span>
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
        {/* Date */}
        {!renderAsProject && (
          <span ref={dateRef} className={`card-meta-btn${openPop==='date'?' act':''}`}
            title={task.date?`Date: ${task.date}`:'Set date'}
            onClick={e=>{e.stopPropagation(); setOpenPop(o=>o==='date'?null:'date');}}>
            <span className={`card-meta${task.date?'':' empty'}`}><I.Cal/>{task.date||''}</span>
            <CardPopover open={openPop==='date'} onClose={()=>setOpenPop(null)} anchorRef={dateRef}>
              <DatePicker task={task} isBulk={isBulkEdit}
                onChange={(p)=>applyChange(p)} onClose={()=>setOpenPop(null)}/>
            </CardPopover>
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
        <div className="card-project-body" onClick={e=>e.stopPropagation()}>
          {kids.length === 0 && (
            <div className="card-proj-empty">Drop or add cards</div>
          )}
          {kids.map((child,i)=>(
            <React.Fragment key={child.id}>
              {isDropTarget && dropIndex===i && <div className="drop-ph drop-ph-sm"/>}
              <div className="card-add-zone" title="Add above"
                onClick={e=>{e.stopPropagation();onAdd?.(task.id,null,{beforeId:child.id, parentId:task.id});}}>
                <button tabIndex={-1}>+</button>
              </div>
              <TaskCard task={child} colKey={task.id} theme={theme}
                focused={focusedId===child.id}
                selected={selectedIds?.has(child.id)}
                renaming={renamingId===child.id}
                spawning={spawningSet?.has(child.id)}
                onOpen={onOpen} onToggle={onToggle} onDelete={onDelete}
                onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                onDragStart={onDragStart} onDragEnd={onDragEnd}
                isDragging={false}
                childrenOf={childrenOf} projectStats={projectStats}
                collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                forceOpenProjects={forceOpenProjects}
                onCardDragOver={onCardDragOver} onCardDragLeave={onCardDragLeave} onCardDrop={onCardDrop}
                cardDragOver={cardDragOver}
                selectedIds={selectedIds} renamingId={renamingId} spawningSet={spawningSet} focusedId={focusedId}
                onAdd={onAdd}
                depth={depth+1}
                blockingCountFor={blockingCountFor} taskTitleById={taskTitleById}
                onContextMenu={onContextMenu} onBulkUpdate={onBulkUpdate}
                recents={recents} onRecentTag={onRecentTag} onRecentProj={onRecentProj}
                openPopRequest={openPopRequest} onPopHandled={onPopHandled}
                getEffectiveLifeArea={getEffectiveLifeArea}
                />
            </React.Fragment>
          ))}
          {isDropTarget && dropIndex===kids.length && <div className="drop-ph drop-ph-sm"/>}
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
