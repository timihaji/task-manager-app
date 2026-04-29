import React, { useState, useEffect, useRef } from 'react';
import { PROJ, ALL_TAGS, TAG_NAMES, D, DAY_S, LIFE_AREAS, LIFE_AREA_NAMES } from '../data.js';
import { I } from '../utils/icons.jsx';
import { lifeAreaPalette, UNASSIGNED_LIFE_AREA } from '../utils/colors.js';
import { groupTasksBy, getGLabel, getGColor } from '../utils/grouping.js';
import { TaskCard } from './TaskCard.jsx';

function Column({ date, tasks, focusedCardId, selectedIds, spawning, theme, groupBy, collapsedGrps, completedOpen, blockedOpen,
  onToggleGrp, onToggleCompleted, onToggleBlocked, onAdd, onOpen, onToggle, onDelete,
  onFocus, onSelect, renamingId, onRename, onRenameDone,
  onDragStart, onDragEnd, onDragOver, onDrop, onDragLeave, dragOver, draggingId,
  childrenOf, projectStats, collapsedProjects, onToggleProject, forceOpenProjects,
  onCardDragOver, onCardDragLeave, onCardDrop, cardDragOver, blockingCountFor, taskTitleById,
  cardExtras, className='', style }) {
  const dow = date.getDay();
  const colKey = D.str(date);
  const past = D.isPast(colKey);
  const today = D.isTdy(colKey);
  const active  = tasks.filter(t=>!t.done && !t.blocked);
  const blocked = tasks.filter(t=>!t.done &&  t.blocked);
  const done    = tasks.filter(t=>t.done);
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
  const groups = groupTasksBy(active, groupBy, cardExtras?.getEffectiveLifeArea);
  const gbLabel = {none:'None',project:'Location',lifeArea:'Life Area',tag:'Tag',priority:'Priority'}[groupBy]||'Location';

  return (
    <div className={`col${past?' is-past':''}${today?' is-today':''}${dragOver && !cardDragOver?' drag-over':''}${className?` ${className}`:''}`}
      style={style}
      onDragOver={e=>onDragOver(e,colKey)} onDrop={e=>onDrop(e,colKey)} onDragLeave={onDragLeave}
      data-screen-label={`${DAY_S[dow]} ${date.getDate()}`}>
      <div className="col-hdr">
        <div className="col-day">{DAY_S[dow]}</div>
        <div className="col-date-row">
          <div className="col-date">{date.getDate()}</div>
          {today && <span className="col-today-badge">Today</span>}
        </div>
        <div className="col-meta">
          <span className="col-cnt">{doneCount}/{totalCount}</span>
          <div className="col-prog"><div className="col-prog-fill" style={{width:`${pct}%`}}/></div>
        </div>
      </div>
      <div className="col-divider"/>
      <div className="col-body" onDoubleClick={e=>{ if(!e.target.closest('.card,.grp-hdr,.done-grp-hdr,.card-add-zone')) onAdd(colKey,date); }}>
        {dragOver && draggingId && active.length===0 && done.length===0 && <div className="drop-ph"/>}
        {groups.map(grp=>{
          const gKey=`${colKey}:${grp.key}`;
          const open=!collapsedGrps.has(gKey);
          return (
            <div key={grp.key} className={grp.label?'grp-box':'grp-free'}>
              {grp.label && (
                <div className="grp-hdr" onClick={()=>onToggleGrp(gKey)}>
                  <svg className={`grp-chv${open?' open':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                      <span className="grp-name" style={{color:getGColor(grp.key, groupBy, theme)}}>{grp.label}</span>
                  <span className="grp-cnt">{grp.tasks.length}</span>
                </div>
              )}
              {open && grp.tasks.map((task,i)=>(
                <React.Fragment key={task.id}>
                  {dragOver===colKey && draggingId && !cardDragOver && i===0 && <div className="drop-ph"/>}
                  <div className="card-add-zone" title="Add above" onClick={e=>{e.stopPropagation();onAdd(colKey,date,{beforeId:task.id});}}>
                    <button tabIndex={-1}>+</button>
                  </div>
                  <TaskCard task={task} colKey={colKey} theme={theme} focused={focusedCardId===task.id}
                    selected={selectedIds?.has(task.id)}
                    renaming={renamingId===task.id} spawning={spawning?.has(task.id)} onOpen={onOpen} onToggle={onToggle} onDelete={onDelete}
                    onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                    onDragStart={onDragStart} onDragEnd={onDragEnd} isDragging={draggingId===task.id}
                    childrenOf={childrenOf} projectStats={projectStats}
                    collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                    forceOpenProjects={forceOpenProjects}
                    onCardDragOver={onCardDragOver} onCardDragLeave={onCardDragLeave} onCardDrop={onCardDrop}
                    cardDragOver={cardDragOver}
                    selectedIds={selectedIds} renamingId={renamingId} spawningSet={spawning} focusedId={focusedCardId}
                    onAdd={onAdd}
                    blockingCountFor={blockingCountFor} taskTitleById={taskTitleById}
                    getEffectiveLifeArea={cardExtras?.getEffectiveLifeArea}
                    {...(cardExtras||{})}/>
                  {i===grp.tasks.length-1 && (
                    <div className="card-add-zone" title="Add below" onClick={e=>{e.stopPropagation();onAdd(colKey,date,{afterId:task.id});}}>
                      <button tabIndex={-1}>+</button>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          );
        })}
        {blocked.length>0 && (
          <>
            <div className="blocked-grp-hdr" onClick={()=>onToggleBlocked?.(colKey)}>
              <svg className={`grp-chv${blockedOpen?' open':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              <span className="grp-name">Blocked</span>
              <span className="grp-cnt">{blocked.length}</span>
            </div>
            {blockedOpen && blocked.map(task=>(
              <TaskCard key={task.id} task={task} colKey={colKey} theme={theme}
                focused={focusedCardId===task.id} renaming={renamingId===task.id} spawning={spawning?.has(task.id)}
                selected={selectedIds?.has(task.id)}
                onOpen={onOpen} onToggle={onToggle} onDelete={onDelete}
                onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                onDragStart={onDragStart} onDragEnd={onDragEnd} isDragging={draggingId===task.id}
                childrenOf={childrenOf} projectStats={projectStats}
                collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                forceOpenProjects={forceOpenProjects}
                onCardDragOver={onCardDragOver} onCardDragLeave={onCardDragLeave} onCardDrop={onCardDrop}
                cardDragOver={cardDragOver}
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
              <TaskCard key={task.id} task={task} colKey={colKey} theme={theme}
                focused={focusedCardId===task.id} renaming={renamingId===task.id} spawning={spawning?.has(task.id)}
                selected={selectedIds?.has(task.id)}
                onOpen={onOpen} onToggle={onToggle} onDelete={onDelete}
                onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                onDragStart={onDragStart} onDragEnd={onDragEnd} isDragging={draggingId===task.id}
                childrenOf={childrenOf} projectStats={projectStats}
                collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                forceOpenProjects={forceOpenProjects}
                onCardDragOver={onCardDragOver} onCardDragLeave={onCardDragLeave} onCardDrop={onCardDrop}
                cardDragOver={cardDragOver}
                selectedIds={selectedIds} renamingId={renamingId} spawningSet={spawning} focusedId={focusedCardId}
                onAdd={onAdd}
                blockingCountFor={blockingCountFor} taskTitleById={taskTitleById}
                getEffectiveLifeArea={cardExtras?.getEffectiveLifeArea}
                {...(cardExtras||{})}/>
            ))}
          </>
        )}
      </div>
      <button className="col-add" onClick={()=>onAdd(colKey,date)}>
        <I.Plus/> Add task
      </button>
    </div>
  );
}

// ── InboxColumn ──────────────────────────────────────────────────────────
function InboxCol({ tasks, theme, focusedCardId, selectedIds, renamingId, spawning, width, collapsed, panelView, onPanelView, onCollapse, onResizeStart, onAdd, onOpen, onToggle, onDelete, onFocus, onSelect, onRename, onRenameDone,
  onDragStart, onDragEnd, onDragOver, onDrop, onDragLeave, dragOver, draggingId,
  childrenOf, projectStats, collapsedProjects, onToggleProject, forceOpenProjects,
  onCardDragOver, onCardDragLeave, onCardDrop, cardDragOver, colDropIndex,
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
  const views = [
    ['timeline','Timeline'],['inbox','Inbox'],['upcoming','Upcoming'],['backlog','Backlog'],
    ['snoozed','Snoozed'],['someday','Someday'],['blocked','Blocked'],['completed','Completed'],['archived','Archived'],
  ];
  const activeLabel = views.find(([v])=>v===panelView)?.[1] || 'Inbox';
  return (
    <div className={`side-panel inbox-col${collapsed?' collapsed':''}${dragOver==='inbox'&&draggingId&&!cardDragOver?' drag-over-inbox':''}`} style={{width, minWidth:collapsed?34:132, left:0}}
      onDragOver={e=>onDragOver(e,'inbox')} onDrop={e=>onDrop(e,'inbox')} onDragLeave={onDragLeave}>
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
        <div className="inbox-cnt">{tasks.length}</div>
      </div>
      <div className="inbox-capture">
        <input placeholder="Capture…" value={cap} onChange={e=>setCap(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&submit()}/>
        <button onClick={submit}>+</button>
      </div>
      <div className="col-body" style={{flex:1}} onDoubleClick={e=>{ if(insertable && !e.target.closest('.card,.card-add-zone,.grp-hdr')) onAdd(null,null,'Untitled'); }}>
        {dragOver==='inbox' && draggingId && inboxTasks.length===0 && <div className="drop-ph"/>}
        {tasks.length===0 && <div className="list-empty">Nothing here yet.</div>}
        {(()=>{
          const useGroups = inboxGroupBy && inboxGroupBy!=='none';
          const groups = useGroups ? groupTasksBy(visibleInboxTasks, inboxGroupBy, cardExtras?.getEffectiveLifeArea) : [{key:'_all',label:null,tasks:visibleInboxTasks}];
          return groups.map(grp=>{
            const gKey = `inbox:${grp.key}`;
            const open = !collapsedGrps?.has(gKey);
            return (
              <div key={grp.key} className={grp.label?'grp-box':'grp-free'}>
                {grp.label && (
                  <div className="grp-hdr" onClick={()=>onToggleGrp?.(gKey)}>
                    <svg className={`grp-chv${open?' open':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                    <span className="grp-name" style={{color:getGColor(grp.key, inboxGroupBy, theme)}}>{grp.label}</span>
                    <span className="grp-cnt">{grp.tasks.length}</span>
                  </div>
                )}
                {open && grp.tasks.map((task,i)=>(
                  <React.Fragment key={task.id}>
                    {!useGroups && dragOver==='inbox' && draggingId && !cardDragOver && colDropIndex?.col==='inbox' && colDropIndex?.index===i && <div className="drop-ph drop-ph-sm"/>}
                    {insertable && <div className="card-add-zone" title="Add above" onClick={e=>{e.stopPropagation();onAdd(null,null,'Untitled',{beforeId:task.id});}}>
                      <button tabIndex={-1}>+</button>
                    </div>}
                    <TaskCard task={task} colKey={task.date||'inbox'} theme={theme} focused={focusedCardId===task.id}
                      selected={selectedIds?.has(task.id)}
                      renaming={renamingId===task.id} spawning={spawning?.has(task.id)} onOpen={onOpen} onToggle={onToggle}
                      onDelete={onDelete} onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                      onDragStart={onDragStart} onDragEnd={onDragEnd} isDragging={draggingId===task.id}
                      childrenOf={childrenOf} projectStats={projectStats}
                      collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                      forceOpenProjects={forceOpenProjects}
                      onCardDragOver={onCardDragOver} onCardDragLeave={onCardDragLeave} onCardDrop={onCardDrop}
                      cardDragOver={cardDragOver}
                      selectedIds={selectedIds} renamingId={renamingId} spawningSet={spawning} focusedId={focusedCardId}
                      onAdd={onAdd}
                      getEffectiveLifeArea={cardExtras?.getEffectiveLifeArea}
                      {...(cardExtras||{})}/>
                    {insertable && i===grp.tasks.length-1 && <div className="card-add-zone" title="Add below" onClick={e=>{e.stopPropagation();onAdd(null,null,'Untitled',{afterId:task.id});}}>
                      <button tabIndex={-1}>+</button>
                    </div>}
                    {!useGroups && i===grp.tasks.length-1 && dragOver==='inbox' && draggingId && !cardDragOver && colDropIndex?.col==='inbox' && colDropIndex?.index===grp.tasks.length && <div className="drop-ph drop-ph-sm"/>}
                  </React.Fragment>
                ))}
              </div>
            );
          });
        })()}
        {doneTasks.length>0 && (
          <div style={{marginTop:6,paddingTop:6,borderTop:'1px solid var(--border)'}}>
            {visibleDoneTasks.map(task=>(
              <TaskCard key={task.id} task={task} colKey={task.date||'inbox'} theme={theme} focused={focusedCardId===task.id}
                selected={selectedIds?.has(task.id)}
                renaming={renamingId===task.id} spawning={false} onOpen={onOpen} onToggle={onToggle} onDelete={onDelete}
                onFocus={onFocus} onSelect={onSelect} onRename={onRename} onRenameDone={onRenameDone}
                onDragStart={onDragStart} onDragEnd={onDragEnd} isDragging={draggingId===task.id}
                childrenOf={childrenOf} projectStats={projectStats}
                collapsedProjects={collapsedProjects} onToggleProject={onToggleProject}
                forceOpenProjects={forceOpenProjects}
                onCardDragOver={onCardDragOver} onCardDragLeave={onCardDragLeave} onCardDrop={onCardDrop}
                cardDragOver={cardDragOver}
                selectedIds={selectedIds} renamingId={renamingId} spawningSet={spawning} focusedId={focusedCardId}
                onAdd={onAdd}
                getEffectiveLifeArea={cardExtras?.getEffectiveLifeArea}
                {...(cardExtras||{})}/>
            ))}
          </div>
        )}
        {tasks.length>panelLimit && <div className="list-note">Showing first {panelLimit} of {tasks.length}. Search or filter to narrow this panel.</div>}
      </div>
      {!collapsed && <div className="side-resizer" onMouseDown={e=>onResizeStart(e,'inbox')}/>}
    </div>
  );
}

// ── LeftNav ──────────────────────────────────────────────────────────────

export { Column, InboxCol };
