// Task Manager — right drawer task editor (560px)
// Requires: tm-data.jsx loaded first (PROJ, ALL_TAGS, TAG_NAMES, TAG_DARK, TAG_LIGHT, LIFE_AREAS, LIFE_AREA_NAMES, LIFE_AREA_DARK, LIFE_AREA_LIGHT, D on window)

const { useState, useEffect, useRef } = React;

function DrSection({ title, open, onToggle, children }) {
  return (
    <div className="drs">
      <div className="drs-hd" onClick={onToggle}>
        <svg className="drs-chv" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{transform:open?'rotate(90deg)':'none',transition:'transform .15s'}}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span className="drs-ttl">{title}</span>
      </div>
      {open && <div className="drs-body">{children}</div>}
    </div>
  );
}

function DRow({ label, children }) {
  return (
    <div className="dr-row">
      <div className="dr-row-lbl">{label}</div>
      <div className="dr-row-val">{children}</div>
    </div>
  );
}

function TaskDrawer({ task, theme, tasks, onUpdate, onClose, onDelete, onDuplicate, onMoveToInbox, fromLeft, onSetBlocked, onClearBlocked, recentBlockReasons, blockingCountFor, onJumpTo, onCheckIn, onGoToCard }) {
  const [localTitle, setLocalTitle] = useState('');
  const [localDesc,  setLocalDesc]  = useState('');
  const [localReason,setLocalReason]= useState('');
  const [newSub,     setNewSub]     = useState('');
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [timeMoreOpen, setTimeMoreOpen] = useState(false);
  const [blockerQuery,setBlockerQuery] = useState('');
  const [secs, setSecs] = useState({ props:true, sched:true, dele:true, notes:true, subs:true, log:false, block:true });
  const [cadenceCustom, setCadenceCustom] = useState('');
  const [delegateName, setDelegateName] = useState('');
  const titleRef = useRef(null);
  const timeMoreRef = useRef(null);
  useEffect(() => {
    if (!timeMoreOpen) return;
    const fn = e => { if (timeMoreRef.current && !timeMoreRef.current.contains(e.target)) setTimeMoreOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [timeMoreOpen]);

  useEffect(() => {
    if (task) {
      setLocalTitle(task.title||'');
      setLocalDesc(task.description||'');
      setLocalReason(task.blockedReason||'');
      setDelegateName(task.delegatedTo || '');
      setCadenceCustom('');
      // Auto-open Delegation section if delegated
      if (task.delegatedTo || task.checkInOf) setSecs(s => ({...s, dele:true}));
    }
  }, [task?.id]);
  useEffect(() => {
    // Sync local reason draft when the task's reason changes externally.
    if (task) setLocalReason(task.blockedReason || '');
  }, [task?.blockedReason]);
  useEffect(() => {
    // Auto-open the Blocked section when a task is blocked.
    if (task?.blocked) setSecs(s => ({...s, block:true}));
  }, [task?.id, task?.blocked]);

  if (!task) return null;

  const tp  = theme==='dark' ? TAG_DARK : TAG_LIGHT;
  const lap = theme==='dark' ? LIFE_AREA_DARK : LIFE_AREA_LIGHT;
  const tog = k => setSecs(s => ({...s,[k]:!s[k]}));
  const upd = ch => onUpdate(task.id, ch);
  const resolveLifeArea = (item, seen=new Set()) => {
    if (!item) return null;
    if (item.lifeArea !== null && item.lifeArea !== undefined) return item.lifeArea;
    if (!item.parentId || seen.has(item.id)) return null;
    seen.add(item.id);
    return resolveLifeArea((tasks||[]).find(t=>t.id===item.parentId), seen);
  };
  const effectiveLifeArea = resolveLifeArea(task);
  const inheritedLifeArea = task.lifeArea == null && effectiveLifeArea ? effectiveLifeArea : null;
  const suggestedLifeArea = task.lifeArea == null && !inheritedLifeArea ? suggestLifeAreaFromTitle(task.title || localTitle) : null;

  const SNOOZE_OPTS = [
    {l:'Tomorrow',    fn:()=>D.str(D.add(D.today(),1))},
    {l:'Next week',   fn:()=>D.str(D.add(D.today(),7))},
    {l:'In 2 weeks',  fn:()=>D.str(D.add(D.today(),14))},
    {l:'Next month',  fn:()=>{ const d=new Date(D.today()); d.setMonth(d.getMonth()+1); return D.str(d); }},
    {l:'In 2 months', fn:()=>{ const d=new Date(D.today()); d.setMonth(d.getMonth()+2); return D.str(d); }},
    {l:'In 3 months', fn:()=>{ const d=new Date(D.today()); d.setMonth(d.getMonth()+3); return D.str(d); }},
    {l:'In 6 months', fn:()=>{ const d=new Date(D.today()); d.setMonth(d.getMonth()+6); return D.str(d); }},
    {l:'Next year',   fn:()=>{ const d=new Date(D.today()); d.setFullYear(d.getFullYear()+1); return D.str(d); }},
  ];
  const FREQ_OPTS = [
    {v:'none',l:'Does not repeat'},{v:'daily',l:'Daily'},
    {v:'weekdays',l:'Every weekday'},{v:'weekly',l:'Weekly'},{v:'monthly',l:'Monthly'},
  ];
  const TIME_PRESETS = ['5m','15m','30m','45m','1h','1.5h','2h'];
  const TIME_MORE = ['10m','20m','25m','40m','50m','1h 15m','1h 30m','1h 45m','2h 30m','3h','4h','5h','6h','8h'];

  const addSub    = () => { if(!newSub.trim())return; upd({subtasks:[...(task.subtasks||[]),{id:`s${Date.now()}`,title:newSub.trim(),done:false,lifeArea:task.lifeArea}]}); setNewSub(''); };
  const togSub    = id => upd({subtasks:(task.subtasks||[]).map(s=>s.id===id?{...s,done:!s.done}:s)});
  const delSub    = id => upd({subtasks:(task.subtasks||[]).filter(s=>s.id!==id)});
  const removeTag = t  => upd({tags:(task.tags||[]).filter(x=>x!==t)});
  const addTag    = t  => { if(t&&!(task.tags||[]).includes(t)) upd({tags:[...(task.tags||[]),t]}); };

  const priInfo = { p1:{l:'Urgent',c:'#ef4444'}, p2:{l:'Normal',c:'#f59e0b'}, p3:{l:'Low',c:'#71717a'} };
  const doneCount = (task.subtasks||[]).filter(s=>s.done).length;
  const subCount  = (task.subtasks||[]).length;

  return (
    <div className={`drawer open${fromLeft?' from-left':''}`} onClick={e=>e.stopPropagation()}>

      {/* ── header ── */}
      <div className="dr-hdr">
        <textarea ref={titleRef} className="dr-title"
          value={localTitle}
          onChange={e=>setLocalTitle(e.target.value)}
          onBlur={()=>localTitle.trim()&&upd({title:localTitle.trim()})}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();titleRef.current?.blur();}}}
          rows={1}
        />
        <div className="dr-hdr-acts">
          {onGoToCard && (
            <button className="dr-act-btn" onClick={()=>onGoToCard(task.id)} title="Go to card location">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="12" y1="2" x2="12" y2="5"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="2" y1="12" x2="5" y2="12"/>
                <line x1="19" y1="12" x2="22" y2="12"/>
                <circle cx="12" cy="12" r="2" fill="currentColor"/>
              </svg>
            </button>
          )}
          <div style={{position:'relative'}}>
            <button className="dr-act-btn" onClick={()=>setMenuOpen(o=>!o)}>···</button>
            {menuOpen && (
              <div className="dr-dd" style={{position:'absolute',right:0,top:'calc(100% + 4px)',zIndex:200}}>
                <div className="dr-dd-item" onClick={()=>{onDuplicate(task.id);setMenuOpen(false);}}>Duplicate</div>
                <div className="dr-dd-item" onClick={()=>{onMoveToInbox(task.id);setMenuOpen(false);}}>Move to inbox</div>
                <div className="dr-dd-sep"/>
                <div className="dr-dd-item danger" onClick={()=>{onDelete(task.id);setMenuOpen(false);}}>Delete task</div>
              </div>
            )}
          </div>
          <button className="dr-act-btn dr-close" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* ── status chips ── */}
      <div className="dr-chips">
        <div className="dr-status-seg" role="group" aria-label="Status">
          <button
            className={`dr-status-seg-btn${!task.done && !task.blocked ? ' act' : ''}`}
            onClick={()=>{
              if (task.done) upd({done:false, completedAt:null});
              if (task.blocked) onClearBlocked?.(task.id);
            }}
          >
            <span className="seg-dot" style={{background:'#737373'}}/>In progress
          </button>
          <button
            className={`dr-status-seg-btn${task.blocked ? ' act blocked' : ''}`}
            onClick={()=>{
              if (task.blocked) { onClearBlocked?.(task.id); return; }
              if (task.done) upd({done:false, completedAt:null});
              onSetBlocked?.(task.id, {reason: task.blockedReason||'', blockedBy: task.blockedBy||[], followUpAt: task.followUpAt||null});
            }}
          >
            <span className="seg-dot" style={{background:'#f59e0b'}}/>Blocked
          </button>
          <button
            className={`dr-status-seg-btn${task.done ? ' act done' : ''}`}
            onClick={()=>upd({done:!task.done, completedAt: task.done?null:new Date().toISOString()})}
          >
            <span className="seg-dot" style={{background:'#22c55e'}}/>Completed
          </button>
        </div>
        {task.recurrence && (
          <div className="dr-chip">↻ {FREQ_OPTS.find(f=>f.v===task.recurrence.freq)?.l||'Recurring'}</div>
        )}
        {task.snoozedUntil && (
          <div className="dr-chip snooze">⏸ Snoozed until {task.snoozedUntil}</div>
        )}
        {task.someday && (
          <div className="dr-chip someday">☾ Someday</div>
        )}
      </div>

      {/* ── body ── */}
      <div className="dr-body">

        {/* BLOCKED DETAILS */}
        {task.blocked && (
          <DrSection title="Blocked details" open={secs.block} onToggle={()=>tog('block')}>
            {/* Reason */}
            <DRow label="Reason">
              <div style={{display:'flex',flexDirection:'column',gap:6,width:'100%'}}>
                {(recentBlockReasons||[]).length>0 && (
                  <div className="dr-reason-recents">
                    {(recentBlockReasons||[]).slice(0,5).map((r,i) => (
                      <span key={i} className="dr-reason-chip" title={r}
                        onClick={()=>{ setLocalReason(r); upd({blockedReason:r}); }}>{r}</span>
                    ))}
                  </div>
                )}
                <textarea
                  className="dr-desc"
                  rows={2}
                  value={localReason}
                  placeholder="What's blocking this?"
                  onChange={e=>setLocalReason(e.target.value)}
                  onBlur={()=>{ if((task.blockedReason||'') !== localReason) upd({blockedReason: localReason}); }}
                />
              </div>
            </DRow>

            {/* Waiting on tasks */}
            <DRow label="Waiting on">
              <div style={{display:'flex',flexDirection:'column',gap:4,width:'100%'}}>
                {(task.blockedBy||[]).length>0 && (
                  <div className="dr-blockers-list">
                    {(task.blockedBy||[]).map(bid => {
                      const bt = (tasks||[]).find(x=>x.id===bid);
                      if (!bt) {
                        return <span key={bid} className="dr-blocker-chip" style={{opacity:.55}}>
                          (deleted)
                          <span className="dr-blocker-chip-x" onClick={()=>upd({blockedBy:(task.blockedBy||[]).filter(x=>x!==bid)})}>×</span>
                        </span>;
                      }
                      return <span key={bid} className={`dr-blocker-chip${bt.done?' done':''}`} title={bt.title}
                        onClick={()=>onJumpTo?.(bid)}>
                        {bt.done ? '✓ ' : ''}{bt.title}
                        <span className="dr-blocker-chip-x" onClick={e=>{e.stopPropagation();upd({blockedBy:(task.blockedBy||[]).filter(x=>x!==bid)});}}>×</span>
                      </span>;
                    })}
                  </div>
                )}
                <div className="dr-blocker-search">
                  <input className="dr-desc" type="text" value={blockerQuery}
                    placeholder="Search to add a blocker..."
                    style={{padding:'5px 8px',font:'12px var(--font)'}}
                    onChange={e=>setBlockerQuery(e.target.value)}/>
                  {blockerQuery.trim() && (() => {
                    const q = blockerQuery.trim().toLowerCase();
                    const exclude = new Set([task.id, ...(task.blockedBy||[])]);
                    const matches = (tasks||[])
                      .filter(t => !exclude.has(t.id) && !t.archived && (t.title||'').toLowerCase().includes(q))
                      .slice(0,8);
                    if (!matches.length) return <div className="dr-blocker-results"><div className="dr-blocker-result" style={{color:'var(--t4)'}}>No matches</div></div>;
                    return <div className="dr-blocker-results">
                      {matches.map(m => (
                        <div key={m.id} className="dr-blocker-result"
                          onClick={()=>{
                            const next = [...(task.blockedBy||[]), m.id];
                            // Re-call setBlocked so the cycle guard runs.
                            onSetBlocked?.(task.id, {reason: task.blockedReason||localReason||'', blockedBy: next, followUpAt: task.followUpAt||null});
                            setBlockerQuery('');
                          }}>
                          {m.title}
                          <span className="dr-blocker-result-meta">{m.date || (m.parentId?'in project':'inbox')}</span>
                        </div>
                      ))}
                    </div>;
                  })()}
                </div>
              </div>
            </DRow>

            {/* Follow up date */}
            <DRow label="Follow up">
              <input type="date" className="dr-desc" style={{padding:'5px 8px',font:'12px var(--font)',width:160}}
                value={task.followUpAt || ''}
                onChange={e=>upd({followUpAt: e.target.value || null})}/>
            </DRow>

            {/* Aging readout */}
            {task.blockedSince && (
              <DRow label="Blocked since">
                <span style={{color:'var(--t3)',font:'12px var(--font)'}}>
                  {task.blockedSince.slice(0,10)} · {daysSince(task.blockedSince)}d ago
                </span>
              </DRow>
            )}

            {/* Mini graph: 1-tier blockers ← self → blocking */}
            {(() => {
              const blockers = (task.blockedBy||[]).map(id => (tasks||[]).find(t=>t.id===id)).filter(Boolean);
              const blocking = (tasks||[]).filter(t => (t.blockedBy||[]).includes(task.id));
              if (!blockers.length && !blocking.length) return null;
              const Chip = ({t, self}) => (
                <span className={`dr-graph-chip${self?' self':t.done?' done':t.blocked?' blocked':''}`}
                  onClick={self?undefined:()=>onJumpTo?.(t.id)}>
                  <span className="dr-graph-chip-dot"/>{t.title}
                </span>
              );
              return (
                <div className="dr-graph">
                  {blockers.length > 0 && (
                    <div className="dr-graph-row">
                      <span className="dr-graph-tier-lbl">Waiting on</span>
                      {blockers.map(b => <Chip key={b.id} t={b}/>)}
                    </div>
                  )}
                  <div className="dr-graph-row">
                    <span className="dr-graph-tier-lbl">This</span>
                    <Chip t={task} self/>
                  </div>
                  {blocking.length > 0 && (
                    <div className="dr-graph-row">
                      <span className="dr-graph-tier-lbl">Blocks</span>
                      {blocking.map(b => <Chip key={b.id} t={b}/>)}
                    </div>
                  )}
                </div>
              );
            })()}
          </DrSection>
        )}

        {/* PROPERTIES */}
        <DrSection title="Properties" open={secs.props} onToggle={()=>tog('props')}>
          <DRow label="Type">
            <div className="dr-pri-grp">
              <button className={`dr-pri-btn${task.cardType!=='project'?' act':''}`}
                disabled={!!task.parentId}
                title={task.parentId ? "This card is already inside a project" : ""}
                onClick={()=>upd({cardType:'task'})}>Task</button>
              <button className={`dr-pri-btn${task.cardType==='project'?' act':''}`}
                disabled={!!task.parentId}
                title={task.parentId ? "This card is already inside a project" : ""}
                onClick={()=>upd({cardType:'project'})}>Project</button>
            </div>
          </DRow>
          <DRow label="Location">
            <div className="dr-pickrow">
              {PROJ.map(p=>{
                const act = task.project===p.id;
                return <button key={p.id} className={`dr-pick${act?' act':''}`}
                  style={act?{background:p.color+'22',color:p.color,borderColor:p.color+'66'}:{}}
                  onClick={()=>upd({project:act?null:p.id})}>
                  <span className="dr-pick-dot" style={{background:p.color}}/>{p.label}
                </button>;
              })}
              {task.project && <button className="dr-time-clear" onClick={()=>upd({project:null})}>Clear</button>}
            </div>
          </DRow>
          <DRow label="Life Area">
            <div>
              {suggestedLifeArea && (
                <div className="dr-pickrow" style={{marginBottom:6}}>
                  <span style={{fontSize:10,color:'var(--t4)',textTransform:'uppercase',letterSpacing:'.06em'}}>Suggested</span>
                  <button className="dr-pick"
                    style={{borderStyle:'dashed',borderColor:(lap[suggestedLifeArea]||lap.admin).fg+'66',color:(lap[suggestedLifeArea]||lap.admin).fg,background:(lap[suggestedLifeArea]||lap.admin).bg,opacity:.8}}
                    onClick={()=>upd({lifeArea:suggestedLifeArea})}>
                    {LIFE_AREA_NAMES[suggestedLifeArea] || suggestedLifeArea}
                  </button>
                </div>
              )}
              <div className="dr-pickrow">
                {LIFE_AREAS.map(id=>{
                  const c = lap[id] || lap.admin;
                  const explicit = task.lifeArea===id;
                  const inherited = inheritedLifeArea===id;
                  return <button key={id} className={`dr-pick${explicit?' act':''}`}
                    style={explicit
                      ? {background:c.bg,color:c.fg,borderColor:c.fg+'55'}
                      : inherited
                        ? {color:c.fg,borderColor:c.fg+'44',boxShadow:`inset 0 0 0 1px ${c.fg}22`}
                        : {}}
                    onClick={()=>upd({lifeArea: explicit ? null : id})}>
                    {LIFE_AREA_NAMES[id] || id}
                  </button>;
                })}
                {task.lifeArea && <button className="dr-time-clear" onClick={()=>upd({lifeArea:null})}>Clear</button>}
              </div>
              {inheritedLifeArea && (
                <div style={{marginTop:6,fontSize:11,color:'var(--t4)'}}>
                  Inheriting {LIFE_AREA_NAMES[inheritedLifeArea] || inheritedLifeArea} from parent
                </div>
              )}
            </div>
          </DRow>
          <DRow label="Priority">
            <div className="dr-pri-grp">
              {['p1','p2','p3'].map(v=>{
                const inf=priInfo[v]; const act=task.priority===v;
                return <button key={v} className={`dr-pri-btn${act?' act':''}`}
                  style={act?{background:`${inf.c}22`,color:inf.c,borderColor:`${inf.c}44`}:{}}
                  onClick={()=>upd({priority:v})}>{inf.l}</button>;
              })}
            </div>
          </DRow>
          <DRow label="Tags">
            <div className="dr-pickrow">
              {ALL_TAGS.map(t=>{
                const c = tp[t] || tp['admin'];
                const act = (task.tags||[]).includes(t);
                return <button key={t} className={`dr-pick${act?' act':''}`}
                  style={act?{background:c.bg,color:c.fg,borderColor:c.fg+'55'}:{}}
                  onClick={()=>act?removeTag(t):addTag(t)}>
                  {TAG_NAMES[t]||t}
                </button>;
              })}
            </div>
          </DRow>
          <DRow label="Date">
            <input type="date" className="dr-inp" value={task.date||''} onChange={e=>upd({date:e.target.value||null})}/>
          </DRow>
          <DRow label="Time est.">
            <div className="dr-time-grp">
              {TIME_PRESETS.map(p=>{
                const act = task.timeEstimate===p;
                return <button key={p} className={`dr-pick${act?' act':''}`}
                  style={act?{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}:{}}
                  onClick={()=>upd({timeEstimate:act?null:p})}>{p}</button>;
              })}
              <div className="dr-time-more" ref={timeMoreRef}>
                <button className="dr-pick" onClick={()=>setTimeMoreOpen(o=>!o)}>More ▾</button>
                {timeMoreOpen && (
                  <div className="dr-time-dd">
                    {TIME_MORE.map(p=>(
                      <div key={p} className="dr-time-dd-item"
                        onClick={()=>{ upd({timeEstimate:p}); setTimeMoreOpen(false); }}>{p}</div>
                    ))}
                  </div>
                )}
              </div>
              {task.timeEstimate && !TIME_PRESETS.includes(task.timeEstimate) && (
                <span className="dr-pick act" style={{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}}>{task.timeEstimate}</span>
              )}
              {task.timeEstimate && <button className="dr-time-clear" onClick={()=>upd({timeEstimate:null})}>Clear</button>}
            </div>
          </DRow>
        </DrSection>

        {/* SCHEDULE */}
        <DrSection title="Schedule" open={secs.sched} onToggle={()=>tog('sched')}>
          <DRow label="Snooze">
            <div style={{position:'relative'}}>
              <button className="dr-sel dr-sel-btn" onClick={()=>setSnoozeOpen(o=>!o)}>
                {task.snoozedUntil?`Until ${task.snoozedUntil}`:'Not snoozed'} ▾
              </button>
              {snoozeOpen && (
                <div className="dr-dd" style={{position:'absolute',left:0,top:'calc(100% + 4px)',zIndex:200,minWidth:160}}>
                  {task.snoozedUntil && <div className="dr-dd-item" onClick={()=>{upd({snoozedUntil:null});setSnoozeOpen(false);}}>Remove snooze</div>}
                  {SNOOZE_OPTS.map(o=><div key={o.l} className="dr-dd-item" onClick={()=>{upd({snoozedUntil:o.fn()});setSnoozeOpen(false);}}>{o.l}</div>)}
                </div>
              )}
            </div>
          </DRow>
          <DRow label="Recurrence">
            <select className="dr-sel" value={task.recurrence?.freq||'none'}
              onChange={e=>{ const v=e.target.value; upd({recurrence:v==='none'?null:{freq:v,interval:1}}); }}>
              {FREQ_OPTS.map(f=><option key={f.v} value={f.v}>{f.l}</option>)}
            </select>
          </DRow>
          <DRow label="Someday">
            <button className={`dr-pick${task.someday?' act':''}`}
              style={task.someday?{background:'rgba(139,92,246,.12)',color:'#8b5cf6',borderColor:'rgba(139,92,246,.45)'}:{}}
              onClick={()=>upd({someday:!task.someday})}>
              {task.someday ? '☾ In Someday' : 'Move to Someday'}
            </button>
          </DRow>
        </DrSection>

        {/* DELEGATION (delegation parent OR a check-in task) */}
        {(task.cardType !== 'project') && (
          <DrSection title={task.checkInOf ? 'Check-in' : 'Delegation'} open={secs.dele} onToggle={()=>tog('dele')}>
            {task.checkInOf ? (() => {
              const parent = (tasks||[]).find(t => t.id === task.checkInOf);
              if (!parent) return <div className="dr-empty">Parent task no longer exists</div>;
              const status = parent.delegationStatus || 'waiting';
              const statusColor = status === 'heard-back' ? '#22c55e' : status === 'sent' ? '#f59e0b' : '#71717a';
              return (
                <>
                  <DRow label="For">
                    <button className="dr-pick" onClick={()=>onJumpTo?.(parent.id)} title="Open parent task">
                      → {parent.title}
                    </button>
                  </DRow>
                  <DRow label="Day">
                    <span className="dr-pick" style={{cursor:'default'}}>day {task.checkInDayOffset ?? '?'}</span>
                  </DRow>
                  <DRow label="Status">
                    <span className="dr-pick" style={{cursor:'default',color:statusColor,borderColor:statusColor+'66',background:statusColor+'18'}}>
                      {status}
                    </span>
                  </DRow>
                  <DRow label="Action">
                    <div className="dr-pickrow">
                      <button className="dr-pick" style={{borderColor:'#f59e0b66',color:'#f59e0b',background:'rgba(245,158,11,.10)'}}
                        onClick={()=>onCheckIn?.(task.id, 'sent-nudge')}>
                        Sent nudge
                      </button>
                      <button className="dr-pick" style={{borderColor:'#22c55e66',color:'#22c55e',background:'rgba(34,197,94,.10)'}}
                        onClick={()=>onCheckIn?.(task.id, 'heard-back')}>
                        Heard back
                      </button>
                      <button className="dr-time-clear" onClick={()=>onDelete(task.id)} title="Skip — delete this check-in only">
                        Skip
                      </button>
                    </div>
                  </DRow>
                </>
              );
            })() : (() => {
              const sched = task.checkInSchedule;
              const matched = matchPreset(sched);
              const presets = ['standard','gentle','tight','weekly4'];
              const todayStr = D.str(D.today());
              const upcoming = (task.checkInTaskIds||[])
                .map(cid => (tasks||[]).find(t => t.id === cid))
                .filter(t => t && !t.done)
                .sort((a,b) => (a.date||'').localeCompare(b.date||''));
              const status = task.delegationStatus;
              const statusColor = status === 'heard-back' ? '#22c55e' : status === 'sent' ? '#f59e0b' : status === 'waiting' ? '#71717a' : null;
              const lastContact = task.lastContactAt
                ? `${Math.max(0, Math.floor((Date.now() - new Date(task.lastContactAt).getTime())/(86400000)))}d ago`
                : 'no contact yet';
              const peopleNames = Object.values(loadPeople()).map(p => p.displayName).filter(Boolean);
              return (
                <>
                  <DRow label="Delegated to">
                    <input className="dr-inp" list="dr-people-list" placeholder="Type a name…"
                      value={delegateName}
                      onChange={e=>setDelegateName(e.target.value)}
                      onBlur={()=>{
                        const v = delegateName.trim();
                        if (v !== (task.delegatedTo || '')) upd({delegatedTo: v || null});
                      }}/>
                    <datalist id="dr-people-list">
                      {peopleNames.map(n => <option key={n} value={n}/>)}
                    </datalist>
                  </DRow>
                  {task.delegatedTo && (
                    <>
                      <DRow label="Cadence">
                        <div className="dr-pickrow">
                          {presets.map(p => {
                            const act = matched === p;
                            return <button key={p} className={`dr-pick${act?' act':''}`}
                              style={act?{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}:{}}
                              onClick={()=>upd({checkInSchedule: CHECKIN_PRESETS[p].slice()})}>
                              {CHECKIN_PRESET_LABELS[p]}
                            </button>;
                          })}
                          <input className="dr-inp" style={{maxWidth:120}} placeholder="custom: 2,5,10"
                            value={cadenceCustom}
                            onChange={e=>setCadenceCustom(e.target.value)}
                            onBlur={()=>{
                              const v = cadenceCustom.trim();
                              if (!v) return;
                              const arr = v.split(/[\s,]+/).map(x=>parseInt(x,10)).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);
                              if (arr.length) upd({checkInSchedule: arr});
                              setCadenceCustom('');
                            }}/>
                        </div>
                      </DRow>
                      <DRow label="Expiry">
                        <input type="date" className="dr-inp" value={task.expiryDate||''}
                          onChange={e=>upd({expiryDate: e.target.value || null})}/>
                      </DRow>
                      <DRow label="Status">
                        <span className="dr-pick" style={{cursor:'default',color:statusColor||'var(--t3)',borderColor:(statusColor||'#71717a')+'66',background:(statusColor||'#71717a')+'18'}}>
                          {status || 'waiting'} · {lastContact}
                        </span>
                      </DRow>
                      <DRow label="Upcoming">
                        {upcoming.length === 0 ? <span className="dr-empty">No pending check-ins</span> : (
                          <div style={{display:'flex',flexDirection:'column',gap:4}}>
                            {upcoming.map(c => (
                              <div key={c.id} style={{display:'flex',alignItems:'center',gap:6}}>
                                <button className="dr-pick" onClick={()=>onJumpTo?.(c.id)}>
                                  d{c.checkInDayOffset} · {c.date}
                                </button>
                                <button className="dr-time-clear" onClick={()=>onDelete(c.id)} title="Skip this one">Skip</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </DRow>
                      <DRow label="Take back">
                        <button className="dr-pick" style={{borderColor:'#ef444466',color:'#ef4444'}}
                          onClick={()=>{ if(confirm(`Take back from ${task.delegatedTo}? Pending check-ins will be removed.`)) upd({delegatedTo:null}); }}>
                          ↶ Reclaim
                        </button>
                      </DRow>
                      {(task.delegationHistory||[]).length > 0 && (
                        <DRow label="History">
                          <div style={{fontSize:11,color:'var(--t3)'}}>
                            {(task.delegationHistory||[]).map((h,i) => (
                              <div key={i}>{h.to} · {h.at ? new Date(h.at).toLocaleDateString() : ''}</div>
                            ))}
                          </div>
                        </DRow>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </DrSection>
        )}

        {/* NOTES */}
        <DrSection title="Notes" open={secs.notes} onToggle={()=>tog('notes')}>
          <textarea className="dr-notes" placeholder="Add notes, links, context…"
            value={localDesc} onChange={e=>setLocalDesc(e.target.value)} onBlur={()=>upd({description:localDesc})} rows={5}/>
        </DrSection>

        {/* SUBTASKS — hidden for project cards (children are used instead) */}
        {task.cardType !== 'project' && <DrSection title={`Subtasks${subCount?` (${doneCount}/${subCount})`:''}`} open={secs.subs} onToggle={()=>tog('subs')}>
          {(task.subtasks||[]).map(s=>(
            <div key={s.id} className="dr-sub">
              <div className={`dr-sub-chk${s.done?' done':''}`} onClick={()=>togSub(s.id)}/>
              <span className={`dr-sub-ttl${s.done?' done':''}`}>{s.title}</span>
              <span className="dr-sub-del" onClick={()=>delSub(s.id)}>×</span>
            </div>
          ))}
          <div className="dr-sub-add">
            <input className="dr-inp" placeholder="+ Add subtask" value={newSub}
              onChange={e=>setNewSub(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addSub()}/>
          </div>
        </DrSection>}

        {/* ACTIVITY */}
        <DrSection title="Activity" open={secs.log} onToggle={()=>tog('log')}>
          {!(task.activity?.length) && <div className="dr-empty">No activity yet</div>}
          {(task.activity||[]).map((a,i)=>{
            const detail = a.type === 'delegated' ? ` · to ${a.to}`
              : a.type === 're-delegated' ? ` · ${a.from} → ${a.to}`
              : a.type === 'nudge-sent' ? ` · day ${a.day}`
              : a.type === 'heard-back' ? ` · day ${a.day}`
              : a.type === 'cadence-stretched' ? ` · ×${a.factor}`
              : a.type === 'cadence-changed' ? ` · ${(a.schedule||[]).join('/')}`
              : a.type === 'check-in-skipped' ? ` · day ${a.day}`
              : a.type === 'expiry-set' ? (a.date ? ` · ${a.date}` : ' · cleared')
              : '';
            return (
              <div key={i} className="dr-log-item">
                <span className="dr-log-type">{a.type}{detail}</span>
                <span className="dr-log-time">{new Date(a.at).toLocaleDateString()}</span>
              </div>
            );
          })}
        </DrSection>
      </div>

      {/* ── footer ── */}
      <div className="dr-foot">
        <button className="dr-foot-btn" onClick={()=>onMoveToInbox(task.id)}>← Inbox</button>
        <button className="dr-foot-btn" onClick={()=>onDuplicate(task.id)}>Duplicate</button>
        <div style={{flex:1}}/>
        <button className="dr-foot-btn dr-del-btn" onClick={()=>onDelete(task.id)}>Delete</button>
      </div>
    </div>
  );
}

Object.assign(window, { TaskDrawer });
