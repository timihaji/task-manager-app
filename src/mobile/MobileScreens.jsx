import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp, useData } from './contexts.js';
import { D, TODAY, TOMORROW, YESTER } from './dateUtil.js';
import {
  Header, HdrBtn, TaskCard, EmptyState, SectionHeader,
  CaptureBar, ProgressBar,
} from './MobileComponents.jsx';
import { useReschedule, DropTile, DragGhost } from './MobileReschedule.jsx';
import { useReorder, ReorderGhost, InsertionLine, ReorderScrim } from './MobileReorder.jsx';
import { DelegationsScreen, RoutinesScreen } from './MobileDetails.jsx';

export const Ic = {
  Search:   <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Plus:     <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Filter:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  ChevDown: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>,
  Arrow:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
};

// ── TodayScreen ───────────────────────────────────────────────────────────────
export function TodayScreen() {
  const { views, all, toggleTask, deleteTask, updateTask } = useData();
  const { openDetail, openQuickAdd, setSearchOpen, fabDefaultsRef } = useApp();
  const [selDay,   setSelDay]   = useState(TODAY);
  const [showDone, setShowDone] = useState(false);

  // Tell the persistent BottomNav FAB to pre-fill the date with whichever
  // day the user is currently browsing in the week strip. If they swipe to
  // tomorrow and tap +, the new task lands on tomorrow — not today.
  useEffect(() => {
    if (!fabDefaultsRef) return;
    fabDefaultsRef.current = { ...(fabDefaultsRef.current || {}), date: selDay };
    return () => {
      if (fabDefaultsRef.current?.date === selDay) fabDefaultsRef.current = {};
    };
  }, [selDay, fabDefaultsRef]);

  const days = useMemo(() => Array.from({ length:7 }, (_, i) => D.str(D.add(D.today(), i-3))), []);
  const { drag, startLongPress } = useReschedule({ updateTask, TODAY });
  const inDrag = !!drag;

  const dayTasks = useMemo(() => all.filter(t => t.date === selDay), [all, selDay]);
  const overdue  = useMemo(() => all.filter(t => D.isPst(t.date) && !t.done), [all]);
  const active   = dayTasks.filter(t => !t.done && !t.recurrence?.isRoutine);
  const routines = dayTasks.filter(t => t.recurrence?.isRoutine);
  const done     = dayTasks.filter(t => t.done);
  const isToday  = selDay === TODAY;

  const todayLabel = () => {
    if (selDay === TODAY)    return 'Today';
    if (selDay === D.str(D.add(D.today(), 1))) return 'Tomorrow';
    if (selDay === D.str(D.add(D.today(), -1))) return 'Yesterday';
    return D.parse(selDay).toLocaleDateString('en', { weekday:'long', month:'short', day:'numeric' });
  };
  const eyebrowLabel = D.parse(selDay).toLocaleDateString('en', { weekday:'long' });
  const secondaryLabel = D.parse(selDay).toLocaleDateString('en', { month:'short', day:'numeric' });
  const hasTasks = d => all.some(t => t.date === d);

  const tasksByDay = useMemo(() => {
    const m = {};
    days.forEach(d => { m[d] = all.filter(t => t.date === d); });
    return m;
  }, [all, days]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)', position:'relative', overflow:'hidden' }}>
      <Header large title={todayLabel()} eyebrow={eyebrowLabel} secondary={secondaryLabel} actions={<>
        <HdrBtn icon={Ic.Search} variant="outline" onPress={() => setSearchOpen(true)} label="Search"/>
        <HdrBtn icon={Ic.Plus}   variant="accent"  onPress={() => openQuickAdd({ date: selDay })} label="Add task"/>
      </>}/>

      <div style={{ background:'var(--surface)', borderBottom: inDrag ? '1px solid transparent' : '1px solid var(--border)', flexShrink:0, position:'relative', zIndex: inDrag ? 1000 : 'auto', transition:'border-color .25s ease' }}>
        {!inDrag && (
          <div style={{ display:'flex', padding:'10px 10px 10px', gap:4, overflowX:'auto' }}>
            {days.map(d => {
              const isTdy = d === TODAY;
              const isSel = d === selDay;
              const past  = d < TODAY;
              return (
                <button key={d} onClick={() => setSelDay(d)} className="tap-sm" style={{ flex:1, minWidth:38, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'7px 4px', borderRadius:12, border:'none', background: isSel ? 'var(--accent)' : 'transparent', cursor:'pointer', transition:'background .2s, transform .15s', boxShadow: isSel ? '0 2px 10px var(--accent-dim)' : 'none' }}>
                  <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color: isSel ? 'rgba(255,255,255,.78)' : isTdy ? 'var(--accent)' : 'var(--t4)' }}>
                    {D.dow(d).toUpperCase().slice(0,2)}
                  </span>
                  <span style={{ fontSize:17, fontWeight:700, color: isSel ? '#fff' : isTdy ? 'var(--t1)' : past ? 'var(--t4)' : 'var(--t2)', lineHeight:1, fontVariantNumeric:'tabular-nums', letterSpacing:'-.02em' }}>
                    {D.daynum(d)}
                  </span>
                  <div style={{ width:4, height:4, borderRadius:'50%', background: hasTasks(d) ? (isSel ? 'rgba(255,255,255,.7)' : 'var(--accent)') : 'transparent', transition:'background .2s' }}/>
                </button>
              );
            })}
          </div>
        )}
        {inDrag && (
          <div style={{ padding:'14px 10px 14px', background:'var(--surface)' }}>
            <div style={{ display:'flex', gap:5 }}>
              {days.map((d, i) => {
                const isHover = drag.hoverDay === d;
                const isOrigin = drag.originDay === d;
                const isTdyD = d === TODAY;
                const label = d === TODAY ? 'Today' : d === TOMORROW ? 'Tmrw' : d === YESTER ? 'Yest' : '';
                return (
                  <DropTile
                    key={d}
                    day={d}
                    dayTasks={tasksByDay[d] || []}
                    isOrigin={isOrigin}
                    isHover={isHover}
                    isToday={isTdyD}
                    label={label}
                    daynum={D.daynum(d)}
                    weekday={D.dow(d).toUpperCase().slice(0,2)}
                    openDelay={i * 28}
                  />
                );
              })}
            </div>
            <div style={{ marginTop:10, fontSize:11.5, color:'var(--t3)', textAlign:'center', letterSpacing:'.01em', animation:'mob-bannerIn .4s var(--ease-out) .15s both' }}>
              {drag.hoverDay && drag.hoverDay !== drag.originDay
                ? <>Release to move to <strong style={{ color:'var(--accent)' }}>{
                    drag.hoverDay === TODAY ? 'Today'
                    : drag.hoverDay === TOMORROW ? 'Tomorrow'
                    : drag.hoverDay === YESTER ? 'Yesterday'
                    : D.parse(drag.hoverDay).toLocaleDateString('en', { weekday:'long' })
                  }</strong></>
                : <>Drag to a day · release to cancel</>}
            </div>
          </div>
        )}
        {dayTasks.length > 0 && !inDrag && <ProgressBar done={done.length} total={dayTasks.length}/>}
      </div>

      {inDrag && (
        <div style={{
          position:'absolute', inset:0, zIndex:998, pointerEvents:'none',
          background:'rgba(13,23,20,.18)',
          animation:'mob-scrimIn .28s ease both'
        }}/>
      )}

      <div style={{
        flex:1, overflowY: inDrag ? 'hidden' : 'auto', WebkitOverflowScrolling:'touch', paddingBottom:100,
        transform: inDrag ? 'scale(.86) translateY(8px)' : 'scale(1)',
        transformOrigin:'50% 0%',
        transition:'transform .34s var(--ease-spring), opacity .25s ease',
        opacity: inDrag ? 0.55 : 1,
        pointerEvents: inDrag ? 'none' : 'auto',
      }}>
        {overdue.length > 0 && isToday && (
          <>
            <SectionHeader label="Overdue" count={overdue.length}/>
            <div style={{ padding:'0 16px' }}>
              {overdue.map(t => <TaskCard key={t.id} task={t} showDate hidden={drag?.task?.id===t.id} onLongPress={startLongPress} onOpen={openDetail} onToggle={toggleTask} onDelete={deleteTask}/>)}
            </div>
          </>
        )}
        {active.length > 0 && (
          <>
            <SectionHeader label={isToday ? 'Today' : D.parse(selDay).toLocaleDateString('en', { weekday:'long' })} count={active.length}/>
            <div style={{ padding:'0 16px' }}>
              {active.map(t => <TaskCard key={t.id} task={t} hidden={drag?.task?.id===t.id} onLongPress={startLongPress} onOpen={openDetail} onToggle={toggleTask} onDelete={deleteTask}/>)}
            </div>
          </>
        )}
        {routines.length > 0 && (
          <>
            <SectionHeader label="Routines" count={routines.length}/>
            <div style={{ padding:'0 16px' }}>
              {routines.map(t => <TaskCard key={t.id} task={t} hidden={drag?.task?.id===t.id} onLongPress={startLongPress} onOpen={openDetail} onToggle={toggleTask} onDelete={deleteTask}/>)}
            </div>
          </>
        )}
        {done.length > 0 && (
          <>
            <SectionHeader label="Done" count={done.length} onToggle={() => setShowDone(v => !v)} collapsed={!showDone}/>
            {showDone && <div style={{ padding:'0 16px' }}>{done.map(t => <TaskCard key={t.id} task={t} hidden={drag?.task?.id===t.id} onLongPress={startLongPress} onOpen={openDetail} onToggle={toggleTask} onDelete={deleteTask}/>)}</div>}
          </>
        )}
        {active.length === 0 && routines.length === 0 && (!isToday || overdue.length === 0) && (
          <EmptyState icon="🗓" title={isToday ? "All clear today" : "Nothing scheduled"} body="Tap + to add a task for this day."/>
        )}
      </div>

      {drag && (
        <DragGhost drag={drag}>
          <TaskCard task={drag.task} onLongPress={null} onOpen={()=>{}} onToggle={()=>{}} onDelete={()=>{}}/>
        </DragGhost>
      )}
    </div>
  );
}

// ── InboxScreen ───────────────────────────────────────────────────────────────
export function InboxScreen() {
  const { views, addTask, toggleTask, deleteTask, updateTask, PROJECTS } = useData();
  const { openDetail, setSearchOpen } = useApp();
  const [groupBy, setGroupBy] = useState('none');
  const tasks = views.inbox;
  const { drag, startReorder } = useReorder({ tasks, updateTask });

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key:'all', label:null, tasks }];
    if (groupBy === 'project') {
      const m = {};
      tasks.forEach(t => { const k = t.project || '__none'; (m[k]||(m[k]=[])).push(t); });
      return Object.entries(m).map(([k,v]) => ({
        key:k,
        label: PROJECTS.find(p => p.id===k)?.label || 'No project',
        color: PROJECTS.find(p => p.id===k)?.color,
        tasks:v,
      }));
    }
    return [{ key:'all', label:null, tasks }];
  }, [tasks, groupBy, PROJECTS]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)' }}>
      <Header large title="Inbox" eyebrow="Capture" subtitle={`${tasks.length} task${tasks.length===1?'':'s'}`} actions={<>
        <HdrBtn icon={Ic.Search} variant="outline" onPress={() => setSearchOpen(true)}/>
        <HdrBtn icon={Ic.Filter} variant={groupBy!=='none'?'accent':'outline'} onPress={() => setGroupBy(v => v==='none'?'project':'none')} badge={groupBy!=='none'?1:0}/>
      </>}/>
      <CaptureBar placeholder="Capture anything…" onSubmit={title => addTask({ title })}/>
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', paddingBottom:100 }}>
        {tasks.length === 0
          ? <EmptyState icon="📥" title="Inbox zero" body="Nice — everything is scheduled or filed away."/>
          : grouped.map(g => (
              <div key={g.key}>
                {g.label && (
                  <div style={{ display:'flex', alignItems:'center', gap:7, padding:'16px 20px 6px' }}>
                    {g.color && <span style={{ width:8, height:8, borderRadius:2, background:g.color, display:'inline-block' }}/>}
                    <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--t4)' }}>{g.label}</span>
                    <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--t3)', background:'var(--surface-2)', padding:'2px 7px', borderRadius:99, fontWeight:600 }}>{g.tasks.length}</span>
                  </div>
                )}
                <div style={{ padding:'0 16px' }}>
                  {g.tasks.map(t => <TaskCard key={t.id} task={t} showProject hidden={drag?.task?.id===t.id} onLongPress={startReorder} onOpen={openDetail} onToggle={toggleTask} onDelete={deleteTask}/>)}
                </div>
              </div>
            ))
        }
      </div>
      <ReorderScrim drag={drag}/>
      <InsertionLine drag={drag}/>
      {drag && <ReorderGhost drag={drag}><TaskCard task={drag.task} onLongPress={null} onOpen={()=>{}} onToggle={()=>{}} onDelete={()=>{}}/></ReorderGhost>}
    </div>
  );
}

// ── StackScreen ───────────────────────────────────────────────────────────────
export function StackScreen() {
  const { views, toggleTask, deleteTask, updateTask } = useData();
  const { openDetail, openQuickAdd, setSearchOpen } = useApp();
  const [collapsed, setCollapsed] = useState({ DECK:false, LATER:true });
  const { drag, startReorder } = useReorder({ tasks: views.stack, updateTask });

  const now   = useMemo(() => views.stack.filter(t => !t.blocked && !t.delegatedTo && (D.isTdy(t.date)||D.isPst(t.date)||(!t.date && (t.priority==='p1'||t.priority==='p2')))), [views.stack]);
  const deck  = useMemo(() => views.stack.filter(t => !now.includes(t) && t.date && D.isFut(t.date) && D.parse(t.date) <= D.add(D.today(), 7)), [views.stack, now]);
  const later = useMemo(() => views.stack.filter(t => !now.includes(t) && !deck.includes(t)), [views.stack, now, deck]);

  const Section = ({ tier, label, tasks, accent }) => {
    const isCollapsed = collapsed[tier];
    return (
      <div style={{ marginBottom:4 }}>
        <div onClick={() => tier!=='NOW' && setCollapsed(c=>({...c,[tier]:!c[tier]}))}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 20px 8px', cursor: tier!=='NOW'?'pointer':'default', userSelect:'none' }}>
          <span style={{ fontSize:10.5, fontWeight:800, letterSpacing:'.16em', textTransform:'uppercase', color: accent||'var(--t4)' }}>{label}</span>
          <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--t3)', background:'var(--surface-2)', padding:'2px 7px', borderRadius:99, fontWeight:600 }}>{tasks.length}</span>
          {tier==='NOW' && <span style={{ marginLeft:'auto', fontSize:11.5, color:'var(--accent)', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{tasks.filter(t=>t.done).length} done</span>}
          {tier!=='NOW' && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2.6" strokeLinecap="round" style={{ marginLeft:'auto', transform: isCollapsed?'rotate(-90deg)':'rotate(0)', transition:'transform .2s var(--ease-out)' }}><polyline points="6 9 12 15 18 9"/></svg>}
        </div>
        {!isCollapsed && (
          <div style={{ padding:'0 16px', marginBottom:6 }}>
            {tasks.length === 0
              ? <div style={{ textAlign:'center', padding:'18px 0', color:'var(--t4)', fontSize:12.5 }}>Nothing here</div>
              : tasks.map(t => <TaskCard key={t.id} task={t} showDate={tier!=='NOW'} showProject hidden={drag?.task?.id===t.id} onLongPress={startReorder} onOpen={openDetail} onToggle={toggleTask} onDelete={deleteTask}/>)
            }
          </div>
        )}
        {tier==='NOW' && <div style={{ height:1, background:'var(--border)', margin:'2px 16px 0' }}/>}
      </div>
    );
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)' }}>
      <Header large title="Stack" eyebrow="Priority" subtitle={`${views.stack.filter(t=>!t.done).length} open`} actions={<>
        <HdrBtn icon={Ic.Search} variant="outline" onPress={() => setSearchOpen(true)}/>
        <HdrBtn icon={Ic.Plus}   variant="accent"  onPress={() => openQuickAdd({})}/>
      </>}/>
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', paddingBottom:100 }}>
        <div style={{ margin:'14px 16px 4px', borderRadius:16, background:'var(--surface)', border:'1px solid var(--accent-border)', boxShadow:'0 1px 2px var(--accent-dim), 0 8px 24px var(--accent-dim)', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, transparent, var(--accent), transparent)', opacity:.6 }}/>
          <Section tier="NOW" label="Now" tasks={now} accent="var(--accent)"/>
        </div>
        <Section tier="DECK" label="Deck" tasks={deck}/>
        <Section tier="LATER" label="Later" tasks={later}/>
      </div>
      <ReorderScrim drag={drag}/>
      <InsertionLine drag={drag}/>
      {drag && <ReorderGhost drag={drag}><TaskCard task={drag.task} onLongPress={null} onOpen={()=>{}} onToggle={()=>{}} onDelete={()=>{}}/></ReorderGhost>}
    </div>
  );
}

// ── MoreScreen ────────────────────────────────────────────────────────────────
export function MoreScreen() {
  const { views, all, PROJECTS } = useData();
  const { push, setSearchOpen } = useApp();

  const navItems = [
    { id:'upcoming',   icon:'📅', label:'Upcoming',   count: views.upcoming.length,  color:'#6366f1' },
    { id:'backlog',    icon:'📦', label:'Backlog',     count: views.backlog.length,   color:'#f59e0b' },
    { id:'snoozed',    icon:'💤', label:'Snoozed',     count: views.snoozed.length,   color:'#94a3b8' },
    { id:'someday',    icon:'🌙', label:'Someday',     count: views.someday.length,   color:'#8b5cf6' },
    { id:'blocked',    icon:'⏸',  label:'Blocked',     count: views.blocked.length,   color:'#ef4444' },
    { id:'delegations',icon:'👥', label:'Delegations', count: views.delegated.length, color:'#10b981' },
  ];
  const moreItems = [
    { id:'routines',  icon:'↻',  label:'Routines',   count: [...new Set(views.routines.map(t=>t.recurrence?.recurrenceId).filter(Boolean))].length, color:'#6366f1' },
    { id:'completed', icon:'✓',  label:'Completed',  count: views.completed.length, color:'#10b981' },
    { id:'archived',  icon:'🗄', label:'Archived',   count: views.archived.length,  color:'#94a3b8' },
  ];

  const GridCard = ({ item }) => (
    <button onClick={() => push(item.id)} className="tap"
      style={{ display:'flex', flexDirection:'column', gap:8, padding:'14px 14px 13px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, cursor:'pointer', textAlign:'left', alignItems:'flex-start', position:'relative', boxShadow:'var(--shadow-sm)', transition:'transform .12s, box-shadow .15s' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%' }}>
        <span style={{ width:30, height:30, borderRadius:9, background:`${item.color}1a`, color:item.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, lineHeight:1 }}>{item.icon}</span>
        {item.count > 0 && <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--t3)', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{item.count}</span>}
      </div>
      <span style={{ fontSize:13.5, fontWeight:600, color:'var(--t1)', letterSpacing:'-.005em' }}>{item.label}</span>
    </button>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)' }}>
      <Header large title="More" eyebrow="Browse" actions={<HdrBtn icon={Ic.Search} variant="outline" onPress={() => setSearchOpen(true)}/>}/>
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', paddingBottom:100 }}>
        <div style={{ padding:'16px 16px 0' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {navItems.map(i => <GridCard key={i.id} item={i}/>)}
          </div>
        </div>

        <SectionHeader label="Archive"/>
        <div style={{ padding:'0 16px 0' }}>
          <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden', boxShadow:'var(--shadow-sm)' }}>
            {moreItems.map((item, idx) => (
              <button key={item.id} onClick={() => push(item.id)} className="tap"
                style={{ width:'100%', display:'flex', alignItems:'center', gap:13, padding:'14px 16px', border:'none', background:'transparent', cursor:'pointer', textAlign:'left', borderBottom: idx<moreItems.length-1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ width:30, height:30, borderRadius:8, background:`${item.color}1a`, color:item.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{item.icon}</span>
                <span style={{ flex:1, fontSize:14.5, fontWeight:500, color:'var(--t1)', letterSpacing:'-.005em' }}>{item.label}</span>
                <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--t4)', fontWeight:600 }}>{item.count}</span>
                {Ic.Arrow}
              </button>
            ))}
          </div>
        </div>

        <SectionHeader label="Projects"/>
        <div style={{ padding:'0 16px' }}>
          <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden', boxShadow:'var(--shadow-sm)' }}>
            {PROJECTS.map((p, idx) => {
              const cnt = all.filter(t => t.project===p.id && !t.done && !t.archived).length;
              return (
                <button key={p.id} onClick={() => push('project', { projectId: p.id })} className="tap"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px', border:'none', background:'transparent', cursor:'pointer', textAlign:'left', borderBottom: idx<PROJECTS.length-1?'1px solid var(--border)':'none' }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:p.color, display:'inline-block', flexShrink:0, boxShadow:`0 0 0 3px ${p.color}26` }}/>
                  <span style={{ flex:1, fontSize:14.5, color:'var(--t1)', letterSpacing:'-.005em' }}>{p.label}</span>
                  <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--t4)', fontWeight:600 }}>{cnt}</span>
                  {Ic.Arrow}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding:'20px 16px 0' }}>
          <button onClick={() => push('settings')} className="tap"
            style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, cursor:'pointer', textAlign:'left', boxShadow:'var(--shadow-sm)' }}>
            <span style={{ width:30, height:30, borderRadius:8, background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--t2)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </span>
            <span style={{ flex:1, fontSize:14.5, fontWeight:500, color:'var(--t1)' }}>Settings</span>
            {Ic.Arrow}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ListScreen ────────────────────────────────────────────────────────────────
export function ListScreen({ type, projectId, tagId }) {
  const { views, all, toggleTask, deleteTask, updateTask, PROJECTS, ALL_TAGS } = useData();
  const { openDetail, openQuickAdd, pop } = useApp();

  const config = {
    upcoming:    { title:'Upcoming',    icon:'📅', empty:'No upcoming tasks.', showDate:true, groupByDate:true },
    backlog:     { title:'Backlog',     icon:'📦', empty:'Backlog is clear.',   showDate:false },
    snoozed:     { title:'Snoozed',     icon:'💤', empty:'Nothing snoozed.',   showDate:false },
    someday:     { title:'Someday',     icon:'🌙', empty:'No someday tasks.',  showDate:false },
    blocked:     { title:'Blocked',     icon:'⏸',  empty:'Nothing blocked.' },
    completed:   { title:'Completed',   icon:'✓',  empty:'No completed tasks.' },
    archived:    { title:'Archived',    icon:'🗄', empty:'Nothing archived.' },
    delegations: { title:'Delegations', icon:'👥', empty:'No delegated tasks.', isDelegations:true },
    routines:    { title:'Routines',    icon:'↻',  empty:'No routines set up.', isRoutines:true },
    project:     { title: PROJECTS.find(p=>p.id===projectId)?.label||'Project', icon:'📁' },
    tag:         { title: ALL_TAGS[tagId]||tagId||'Tag', icon:'🏷' },
  }[type] || { title:'Tasks', icon:'📋' };

  if (config.isDelegations) return <DelegationsScreen onBack={pop}/>;
  if (config.isRoutines)    return <RoutinesScreen    onBack={pop}/>;

  const getTaskList = () => {
    if (type === 'project') return all.filter(t => t.project===projectId && !t.archived && !t.done);
    if (type === 'tag')     return all.filter(t => (t.tags||[]).includes(tagId) && !t.archived && !t.done);
    return views[type] || [];
  };
  const tasks = getTaskList();
  const { drag, startReorder } = useReorder({ tasks, updateTask });

  const groupedByDate = useMemo(() => {
    if (!config.groupByDate) return null;
    const m = {};
    tasks.forEach(t => {
      const k = t.date || '__none';
      (m[k]||(m[k]=[])).push(t);
    });
    return Object.entries(m).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => ({
      key:k, label: k==='__none' ? 'No date' : D.fmt(k), tasks:v,
    }));
  }, [tasks, config.groupByDate]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)' }}>
      <Header large title={config.title} onBack={pop} actions={
        type!=='completed'&&type!=='archived' ? <HdrBtn icon={Ic.Plus} variant="accent" onPress={() => openQuickAdd({})}/> : undefined
      }/>
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', paddingBottom:100 }}>
        {tasks.length === 0
          ? <EmptyState icon={config.icon} title={config.empty||'Nothing here'} body="Tap + to add a task."/>
          : config.groupByDate ? (
              groupedByDate.map(g => (
                <div key={g.key}>
                  <SectionHeader label={g.label} count={g.tasks.length}/>
                  <div style={{ padding:'0 16px' }}>
                    {g.tasks.map(t => <TaskCard key={t.id} task={t} showDate={false} showProject hidden={drag?.task?.id===t.id} onLongPress={startReorder} onOpen={openDetail} onToggle={toggleTask} onDelete={deleteTask}/>)}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding:'12px 16px' }}>
                {tasks.map(t => <TaskCard key={t.id} task={t} showDate={config.showDate||type==='completed'} showProject hidden={drag?.task?.id===t.id} onLongPress={startReorder} onOpen={openDetail} onToggle={toggleTask} onDelete={deleteTask}/>)}
              </div>
            )
        }
      </div>
      <ReorderScrim drag={drag}/>
      <InsertionLine drag={drag}/>
      {drag && <ReorderGhost drag={drag}><TaskCard task={drag.task} onLongPress={null} onOpen={()=>{}} onToggle={()=>{}} onDelete={()=>{}}/></ReorderGhost>}
    </div>
  );
}

// ── SearchScreen ──────────────────────────────────────────────────────────────
export function SearchScreen({ onClose }) {
  const { all, toggleTask, deleteTask } = useData();
  const { openDetail } = useApp();
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const lc = q.toLowerCase();
    return all.filter(t => (t.title||'').toLowerCase().includes(lc) || (t.description||'').toLowerCase().includes(lc)).slice(0, 50);
  }, [q, all]);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, background:'var(--bg)', display:'flex', flexDirection:'column', animation:'mob-fadeIn .2s ease both' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', background:'var(--surface)', flexShrink:0, paddingTop:'max(12px, env(safe-area-inset-top))' }}>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:12, padding:'0 14px', height:42 }}>
          {Ic.Search}
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search tasks…"
            style={{ flex:1, border:'none', background:'transparent', color:'var(--t1)', fontSize:15, outline:'none' }}/>
          {q && <button onClick={() => setQ('')} aria-label="Clear" style={{ border:'none', background:'transparent', color:'var(--t4)', cursor:'pointer', fontSize:18 }}>×</button>}
        </div>
        <button onClick={onClose} className="tap" style={{ border:'none', background:'transparent', color:'var(--accent)', fontSize:15, fontWeight:600, cursor:'pointer', padding:'0 4px', whiteSpace:'nowrap' }}>Cancel</button>
      </div>
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'8px 16px 40px' }}>
        {q && results.length === 0
          ? <EmptyState icon="🔍" title="No results" body={`Nothing matches "${q}". Try a different keyword.`}/>
          : results.length > 0 ? (
              <>
                <div style={{ padding:'10px 4px 6px', fontSize:10.5, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--t4)' }}>{results.length} result{results.length===1?'':'s'}</div>
                {results.map(t => <TaskCard key={t.id} task={t} showDate showProject onOpen={id => { openDetail(id); onClose(); }} onToggle={toggleTask} onDelete={deleteTask}/>)}
              </>
            ) : null
        }
        {!q && (
          <div style={{ paddingTop:60, textAlign:'center', color:'var(--t4)', fontSize:13.5 }}>Type to search across all tasks</div>
        )}
      </div>
    </div>
  );
}
