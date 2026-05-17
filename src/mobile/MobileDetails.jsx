import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp, useData, useTheme } from './contexts.js';
import { D, TODAY } from './dateUtil.js';
import {
  Sheet, Header, EmptyState, SectionHeader,
  ActionSheet, Avatar, StatusChip, DetailRow,
} from './MobileComponents.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

// ── TaskDetailSheet ───────────────────────────────────────────────────────────
export function TaskDetailSheet({ taskId, onClose }) {
  const { tasks, updateTask, deleteTask, archiveTask, duplicateTask, toggleTask,
          PROJECTS, ALL_TAGS, TAG_COLORS, LIFE_AREAS, PRI, TIME_OPTS, SNOOZE_OPTS } = useData();
  const { showToast } = useApp();
  const theme = useTheme();
  const isDark = theme === 'dark';

  const task = tasks.find(t => t.id === taskId);
  const [localTitle, setLocalTitle] = useState('');
  const [localDesc,  setLocalDesc]  = useState('');
  const [editTitle,  setEditTitle]  = useState(false);
  const [picker,     setPicker]     = useState(null);
  const [newSub,     setNewSub]     = useState('');
  const [delConfirm, setDelConfirm] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    if (task) { setLocalTitle(task.title||''); setLocalDesc(task.description||''); setEditTitle(false); }
  }, [taskId]);

  useEffect(() => {
    if (editTitle) setTimeout(() => { titleRef.current?.focus(); titleRef.current?.select(); }, 60);
  }, [editTitle]);

  if (!task) return null;
  const save = patch => updateTask(taskId, patch);
  const proj = PROJECTS.find(p => p.id === task.project);

  const projectItems = PROJECTS.map(p => ({
    label:p.label, dot:p.color, active:task.project===p.id,
    onPress:() => { save({ project:p.id }); setPicker(null); },
  }));

  const tagItems = Object.entries(ALL_TAGS).map(([id,label]) => {
    const on = (task.tags||[]).includes(id);
    const tc = TAG_COLORS[id];
    return {
      label, active:on,
      icon:<span style={{ width:9, height:9, borderRadius:2, background: isDark?tc?.d:tc?.l, display:'inline-block' }}/>,
      onPress:() => {
        const tags = on ? (task.tags||[]).filter(x => x!==id) : [...(task.tags||[]), id];
        save({ tags });
      },
    };
  });
  tagItems.push('sep', { label:'Done', onPress:() => setPicker(null) });

  const priItems = Object.entries(PRI).map(([id,info]) => ({
    label:info.label, active:task.priority===id,
    icon:<span style={{ width:9, height:9, borderRadius:'50%', background:info.color, display:'inline-block' }}/>,
    onPress:() => { save({ priority:id }); setPicker(null); },
  }));

  const timeItems = TIME_OPTS.map(t => ({
    label:t, active:task.timeEstimate===t,
    onPress:() => { save({ timeEstimate:t }); setPicker(null); },
  }));
  timeItems.push('sep', { label:'Clear', onPress:() => { save({ timeEstimate:null }); setPicker(null); } });

  const snoozeItems = SNOOZE_OPTS.map(o => ({
    label:o.l, sub:o.fn(),
    onPress:() => { save({ snoozedUntil:o.fn(), date:null }); setPicker(null); showToast(`Snoozed until ${o.l.toLowerCase()}`); },
  }));
  snoozeItems.push('sep', { label:'Clear snooze', onPress:() => { save({ snoozedUntil:null }); setPicker(null); } });

  const lifeAreaItems = LIFE_AREAS.map(a => ({
    label:a.label, dot:a.color, active:task.lifeArea===a.id,
    onPress:() => { save({ lifeArea:a.id }); setPicker(null); },
  }));
  lifeAreaItems.push('sep', { label:'Clear', onPress:() => { save({ lifeArea:null }); setPicker(null); } });

  const actionItems = [
    { label:'Duplicate', icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>, onPress:() => { duplicateTask(taskId); onClose(); showToast('Task duplicated'); } },
    { label:'Archive', icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>, onPress:() => { archiveTask(taskId); onClose(); showToast('Task archived'); } },
    'sep',
    { label:'Delete task', danger:true, icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7M6 7l1 12.5A2 2 0 0 0 9 21h6a2 2 0 0 0 2-1.5L18 7"/></svg>,
      onPress:() => setDelConfirm(true) },
  ];

  return (
    <>
      <Sheet open onClose={onClose} maxHeight="96dvh" noPad>
        <div style={{ display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'8px 20px 18px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
              <button onClick={() => { toggleTask(taskId); if (!task.done) showToast('Done ✓'); }} className="tap"
                style={{ flexShrink:0, marginTop:3, width:26, height:26, borderRadius:'50%', border:`2.5px solid ${task.done?'var(--accent)':'var(--border-strong)'}`, background:task.done?'var(--accent)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all .2s' }}>
                {task.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
              {editTitle ? (
                <textarea ref={titleRef} value={localTitle} onChange={e => setLocalTitle(e.target.value)}
                  onBlur={() => { save({ title:localTitle }); setEditTitle(false); }}
                  onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); save({ title:localTitle }); setEditTitle(false); } }}
                  style={{ flex:1, fontSize:20, fontWeight:700, color:'var(--t1)', letterSpacing:'-.018em', lineHeight:1.3, border:'none', background:'transparent', outline:'none', resize:'none', fontFamily:'inherit', padding:0 }}
                  rows={2}/>
              ) : (
                <div onClick={() => setEditTitle(true)}
                  style={{ flex:1, fontSize:20, fontWeight:700, color: task.done?'var(--t3)':'var(--t1)', letterSpacing:'-.018em', lineHeight:1.3, textDecoration: task.done?'line-through':'none', cursor:'text', textWrap:'pretty' }}>
                  {task.title}
                </div>
              )}
              <button onClick={() => setPicker('actions')} className="tap"
                style={{ flexShrink:0, width:32, height:32, border:'none', borderRadius:10, background:'var(--surface-2)', color:'var(--t3)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', marginTop:2 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
              </button>
            </div>
            <div style={{ marginTop:12, marginLeft:38 }}>
              <textarea value={localDesc} onChange={e => setLocalDesc(e.target.value)}
                onBlur={() => save({ description:localDesc })}
                placeholder="Add notes…"
                style={{ width:'100%', border:'none', background:'transparent', color:'var(--t2)', fontSize:14, lineHeight:1.55, fontFamily:'inherit', resize:'none', outline:'none', padding:0, minHeight:36 }}
                rows={localDesc ? undefined : 1}/>
            </div>
          </div>

          <div>
            <DetailRow label="Start date">
              <span style={{ fontSize:14, color: task.date ? 'var(--t1)' : 'var(--t4)' }}>{task.date ? D.fmt(task.date) : 'Not set'}</span>
              <div style={{ position:'relative' }}>
                <span style={{ fontSize:13, color:'var(--accent)', fontWeight:500 }}>Change</span>
                <input type="date" value={task.date||''} onChange={e => save({ date:e.target.value||null })}
                  style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer', width:'100%' }}/>
              </div>
            </DetailRow>
            <DetailRow label="Due date">
              <span style={{ fontSize:14, color: task.dueDate ? (task.dueDate <= TODAY ? '#ef4444' : 'var(--t1)') : 'var(--t4)' }}>
                {task.dueDate ? D.fmt(task.dueDate) : 'Not set'}
              </span>
              <div style={{ position:'relative' }}>
                <span style={{ fontSize:13, color:'var(--accent)', fontWeight:500 }}>Change</span>
                <input type="date" value={task.dueDate||''} onChange={e => save({ dueDate:e.target.value||null })}
                  style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer', width:'100%' }}/>
              </div>
            </DetailRow>
            <DetailRow label="Project">
              <button onClick={() => setPicker('project')} style={{ display:'flex', alignItems:'center', gap:6, border:'none', background:'transparent', cursor:'pointer', padding:0 }}>
                {proj ? <><span style={{ width:8,height:8,borderRadius:2,background:proj.color,display:'inline-block' }}/><span style={{ fontSize:14, color:'var(--t1)' }}>{proj.label}</span></> : <span style={{ fontSize:14, color:'var(--t4)' }}>None</span>}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </DetailRow>
            <DetailRow label="Tags">
              <button onClick={() => setPicker('tags')} style={{ display:'flex', alignItems:'center', gap:5, border:'none', background:'transparent', cursor:'pointer', padding:0, flexWrap:'wrap', justifyContent:'flex-end', maxWidth:200 }}>
                {(task.tags||[]).length > 0
                  ? (task.tags||[]).map(id => { const tc=TAG_COLORS[id]; return tc ? <span key={id} style={{ fontSize:12, padding:'2px 8px', borderRadius:5, background: isDark?tc.bd:tc.bl, color: isDark?tc.d:tc.l, fontWeight:500 }}>{ALL_TAGS[id] || id}</span> : <span key={id} style={{ fontSize:12, color:'var(--t3)' }}>{ALL_TAGS[id]||id}</span>; })
                  : <span style={{ fontSize:14, color:'var(--t4)' }}>None</span>}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </DetailRow>
            <DetailRow label="Life area">
              <button onClick={() => setPicker('lifeArea')} style={{ display:'flex', alignItems:'center', gap:6, border:'none', background:'transparent', cursor:'pointer', padding:0 }}>
                {task.lifeArea ? (
                  <> <span style={{ width:8, height:8, borderRadius:2, background: LIFE_AREAS.find(a=>a.id===task.lifeArea)?.color, display:'inline-block' }}/>
                  <span style={{ fontSize:14, color:'var(--t1)' }}>{LIFE_AREAS.find(a=>a.id===task.lifeArea)?.label}</span> </>
                ) : <span style={{ fontSize:14, color:'var(--t4)' }}>Unassigned</span>}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </DetailRow>
            <DetailRow label="Priority">
              <div style={{ display:'flex', gap:6 }}>
                {Object.entries(PRI).map(([id,info]) => (
                  <button key={id} onClick={() => save({ priority:id })}
                    style={{ padding:'5px 12px', borderRadius:8, border:`1.5px solid ${task.priority===id?info.color:'var(--border)'}`, background: task.priority===id?info.dim:'transparent', color: task.priority===id?info.color:'var(--t3)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    {info.label}
                  </button>
                ))}
              </div>
            </DetailRow>
            <DetailRow label="Estimate">
              <button onClick={() => setPicker('time')} style={{ display:'flex', alignItems:'center', gap:6, border:'none', background:'transparent', cursor:'pointer', padding:0 }}>
                <span style={{ fontSize:14, color: task.timeEstimate?'var(--t1)':'var(--t4)' }}>{task.timeEstimate||'Not set'}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </DetailRow>
            <DetailRow label="Snooze">
              <button onClick={() => setPicker('snooze')} style={{ display:'flex', alignItems:'center', gap:6, border:'none', background:'transparent', cursor:'pointer', padding:0 }}>
                <span style={{ fontSize:14, color: task.snoozedUntil?'#f59e0b':'var(--t4)' }}>{task.snoozedUntil ? D.fmt(task.snoozedUntil) : 'Not snoozed'}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </DetailRow>
          </div>

          <div style={{ borderTop:'1px solid var(--border)', padding:'16px 20px' }}>
            <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--t4)', marginBottom:10 }}>Delegation</div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input value={task.delegatedTo||''} onChange={e => save({ delegatedTo:e.target.value||null, delegationStatus: e.target.value ? (task.delegationStatus||'waiting') : null })}
                placeholder="Delegate to…"
                style={{ flex:1, padding:'10px 14px', border:'1px solid var(--border)', borderRadius:10, background:'var(--surface-2)', color:'var(--t1)', fontSize:14, fontFamily:'inherit', outline:'none' }}/>
              {task.delegatedTo && (
                <select value={task.delegationStatus||'waiting'} onChange={e => save({ delegationStatus:e.target.value })}
                  style={{ padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, background:'var(--surface-2)', color:'var(--t1)', fontSize:13, fontFamily:'inherit', outline:'none', cursor:'pointer' }}>
                  <option value="waiting">Waiting</option>
                  <option value="in_progress">In Progress</option>
                  <option value="heard_back">Heard Back</option>
                  <option value="stale">Stale</option>
                  <option value="overdue">Overdue</option>
                </select>
              )}
            </div>
          </div>

          <div style={{ borderTop:'1px solid var(--border)', padding:'16px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: task.blocked ? 12 : 0 }}>
              <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--t4)', flex:1 }}>Blocked</div>
              <button onClick={() => save({ blocked:!task.blocked, blockedSince: !task.blocked ? TODAY : null })}
                style={{ width:42, height:24, borderRadius:99, border:'none', background: task.blocked?'#ef4444':'var(--surface-3)', cursor:'pointer', position:'relative', transition:'background .25s', flexShrink:0, padding:0 }}>
                <span style={{ position:'absolute', top:2, left: task.blocked?20:2, width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left .22s var(--ease-spring)', display:'block', boxShadow:'0 1px 3px rgba(0,0,0,.18)' }}/>
              </button>
            </div>
            {task.blocked && (
              <input value={task.blockedReason||''} onChange={e => save({ blockedReason:e.target.value })}
                placeholder="Why is this blocked?"
                style={{ width:'100%', padding:'10px 14px', border:'1px solid var(--border)', borderRadius:10, background:'var(--surface-2)', color:'var(--t1)', fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}/>
            )}
          </div>

          <div style={{ borderTop:'1px solid var(--border)', padding:'16px 20px' }}>
            <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--t4)', marginBottom:10 }}>Subtasks</div>
            {(task.subtasks||[]).map((sub, idx) => (
              <div key={idx} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <button onClick={() => { const ss=[...(task.subtasks||[])]; ss[idx]={...ss[idx],done:!ss[idx].done}; save({ subtasks:ss }); }}
                  style={{ width:20, height:20, borderRadius:'50%', border:`2px solid ${sub.done?'var(--accent)':'var(--border)'}`, background:sub.done?'var(--accent)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
                  {sub.done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
                <span style={{ flex:1, fontSize:14, color: sub.done?'var(--t3)':'var(--t1)', textDecoration:sub.done?'line-through':'none' }}>{sub.title}</span>
                <button onClick={() => { const ss=(task.subtasks||[]).filter((_,i)=>i!==idx); save({ subtasks:ss }); }}
                  style={{ border:'none', background:'transparent', color:'var(--t4)', cursor:'pointer', fontSize:16, padding:'0 2px' }}>×</button>
              </div>
            ))}
            <div style={{ display:'flex', gap:8 }}>
              <input value={newSub} onChange={e => setNewSub(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && newSub.trim()) { save({ subtasks:[...(task.subtasks||[]),{title:newSub.trim(),done:false}] }); setNewSub(''); } }}
                placeholder="Add subtask…"
                style={{ flex:1, padding:'9px 12px', border:'1px solid var(--border)', borderRadius:10, background:'var(--surface-2)', color:'var(--t1)', fontSize:14, fontFamily:'inherit', outline:'none' }}/>
              {newSub.trim() && (
                <button onClick={() => { save({ subtasks:[...(task.subtasks||[]),{title:newSub.trim(),done:false}] }); setNewSub(''); }}
                  style={{ width:40, height:40, border:'none', borderRadius:10, background:'var(--accent)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                </button>
              )}
            </div>
          </div>

          {task.recurrence && (
            <div style={{ borderTop:'1px solid var(--border)', padding:'14px 20px', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ width:24, height:24, borderRadius:6, background:'var(--accent-dim)', color:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700 }}>↻</span>
              <span style={{ fontSize:14, color:'var(--t2)' }}>Repeats {task.recurrence.label}</span>
              {task.recurrence.isRoutine && <span style={{ fontSize:10.5, padding:'2px 8px', borderRadius:99, background:'rgba(99,102,241,.15)', color:'#818cf8', fontWeight:700, letterSpacing:'.04em' }}>ROUTINE</span>}
            </div>
          )}

          <div style={{ height:'max(20px, env(safe-area-inset-bottom))' }}/>
        </div>
      </Sheet>

      <ActionSheet open={picker==='project'} onClose={() => setPicker(null)} title="Project"       items={projectItems}/>
      <ActionSheet open={picker==='tags'}    onClose={() => setPicker(null)} title="Tags"          items={tagItems}/>
      <ActionSheet open={picker==='lifeArea'} onClose={() => setPicker(null)} title="Life Area"    items={lifeAreaItems}/>
      <ActionSheet open={picker==='time'}    onClose={() => setPicker(null)} title="Time Estimate" items={timeItems}/>
      <ActionSheet open={picker==='snooze'}  onClose={() => setPicker(null)} title="Snooze until…" items={snoozeItems}/>
      <ActionSheet open={picker==='actions'} onClose={() => setPicker(null)} title="Task Actions"  items={actionItems}/>

      {delConfirm && (
        <Sheet open onClose={() => setDelConfirm(false)} title="Delete task?">
          <div style={{ padding:'8px 20px 20px' }}>
            <p style={{ fontSize:15, color:'var(--t2)', marginBottom:20, lineHeight:1.5 }}>"{task.title}" will be permanently deleted.</p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDelConfirm(false)} style={{ flex:1, padding:'13px', border:'1px solid var(--border)', borderRadius:12, background:'transparent', color:'var(--t1)', fontSize:15, fontWeight:500, cursor:'pointer' }}>Cancel</button>
              <button onClick={() => { deleteTask(taskId); onClose(); showToast('Task deleted'); }} style={{ flex:1, padding:'13px', border:'none', borderRadius:12, background:'#ef4444', color:'#fff', fontSize:15, fontWeight:600, cursor:'pointer' }}>Delete</button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}

// QuickAddSheet moved to MobileQuickAdd.jsx as QuickAddBar — a keyboard-anchored
// capture bar. The sheet pattern blocked the iOS keyboard because programmatic
// .focus() outside the user-gesture tick is rejected.

// ── DelegationsScreen ─────────────────────────────────────────────────────────
export function DelegationsScreen({ onBack }) {
  const { views, PROJECTS } = useData();
  const { openDetail } = useApp();
  const [filter, setFilter] = useState('all');

  const filterOpts = [
    { value:'all',         label:'All' },
    { value:'waiting',     label:'Waiting' },
    { value:'in_progress', label:'Active' },
    { value:'stale',       label:'Stale' },
    { value:'overdue',     label:'Overdue' },
  ];
  const tasks = filter==='all' ? views.delegated : views.delegated.filter(t => t.delegationStatus===filter);
  const byPerson = useMemo(() => {
    const m = {};
    tasks.forEach(t => { const k = t.delegatedTo||'Unknown'; (m[k]||(m[k]=[])).push(t); });
    return Object.entries(m).sort(([a],[b]) => a.localeCompare(b));
  }, [tasks]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)' }}>
      <Header title="Delegations" subtitle={`${views.delegated.length} open`} onBack={onBack}/>
      <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', overflowX:'auto', display:'flex', gap:6, flexShrink:0 }}>
        {filterOpts.map(o => (
          <button key={o.value} onClick={() => setFilter(o.value)}
            style={{ padding:'6px 13px', borderRadius:99, border:`1px solid ${filter===o.value?'var(--accent-border)':'var(--border)'}`, background: filter===o.value?'var(--accent-dim)':'transparent', color: filter===o.value?'var(--accent)':'var(--t3)', fontSize:12.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0, transition:'all .15s' }}>
            {o.label}
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', paddingBottom:100 }}>
        {tasks.length === 0
          ? <EmptyState icon="👥" title="No delegations" body="Assign tasks to others from any task's detail view."/>
          : byPerson.map(([person, ptasks]) => (
              <div key={person}>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'18px 20px 8px' }}>
                  <Avatar name={person} size={28}/>
                  <span style={{ fontSize:14, fontWeight:600, color:'var(--t1)', letterSpacing:'-.005em' }}>{person}</span>
                  <span style={{ marginLeft:'auto', fontSize:10, fontFamily:'var(--mono)', color:'var(--t3)', background:'var(--surface-2)', padding:'2px 7px', borderRadius:99, fontWeight:600 }}>{ptasks.length}</span>
                </div>
                <div style={{ padding:'0 16px' }}>
                  {ptasks.map(t => (
                    <div key={t.id} onClick={() => openDetail(t.id)} className="tap"
                      style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--rk,10px)', padding:'12px 14px', marginBottom:4, cursor:'pointer', display:'flex', alignItems:'flex-start', gap:10, boxShadow:'var(--shadow-sm)' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14.5, fontWeight:500, color:'var(--t1)', marginBottom:6, letterSpacing:'-.005em' }}>{t.title}</div>
                        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                          <StatusChip status={t.delegationStatus||'waiting'}/>
                          {t.date && <span style={{ fontSize:11.5, color: t.date<D.str(D.today())?'#ef4444':'var(--t4)', fontWeight: t.date<D.str(D.today())?600:500 }}>{D.fmt(t.date)}</span>}
                          {PROJECTS.find(p=>p.id===t.project) && (
                            <span style={{ fontSize:11.5, color:'var(--t3)' }}>· {PROJECTS.find(p=>p.id===t.project).label}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
        }
      </div>
    </div>
  );
}

// ── RoutinesScreen ────────────────────────────────────────────────────────────
export function RoutinesScreen({ onBack }) {
  const { views } = useData();
  const { openDetail } = useApp();
  const [sort, setSort] = useState('streak');

  const series = useMemo(() => {
    const m = {};
    views.routines.forEach(t => {
      const id = t.recurrence?.recurrenceId;
      if (!id) return;
      if (!m[id]) m[id] = { id, title: t.title, tasks:[], recurrence: t.recurrence };
      m[id].tasks.push(t);
    });
    return Object.values(m).map(s => {
      const done = s.tasks.filter(t => t.done);
      const streak = done.filter(t => {
        const diff = Math.round((D.today() - D.parse(t.date||TODAY)) / 86400000);
        return diff <= 1;
      }).length;
      const rate = s.tasks.length ? Math.round((done.length/s.tasks.length)*100) : 0;
      const next = s.tasks.filter(t => !t.done && t.date).sort((a,b) => (a.date||'').localeCompare(b.date||''))[0];
      const latestId = s.tasks.slice().sort((a,b) => (b.date||'').localeCompare(a.date||''))[0]?.id;
      return { ...s, streak, rate, nextDate: next?.date, latestId };
    });
  }, [views.routines]);

  const sorted = useMemo(() => {
    if (sort==='streak') return [...series].sort((a,b) => b.streak-a.streak);
    if (sort==='rate')   return [...series].sort((a,b) => b.rate-a.rate);
    if (sort==='name')   return [...series].sort((a,b) => a.title.localeCompare(b.title));
    return series;
  }, [series, sort]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)' }}>
      <Header title="Routines" subtitle={`${series.length} series`} onBack={onBack}/>
      <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:6, overflowX:'auto', flexShrink:0 }}>
        {[{v:'streak',l:'🔥 Streak'},{v:'rate',l:'% Rate'},{v:'name',l:'Name'}].map(o => (
          <button key={o.v} onClick={() => setSort(o.v)}
            style={{ padding:'6px 13px', borderRadius:99, border:`1px solid ${sort===o.v?'var(--accent-border)':'var(--border)'}`, background: sort===o.v?'var(--accent-dim)':'transparent', color: sort===o.v?'var(--accent)':'var(--t3)', fontSize:12.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0, transition:'all .15s' }}>
            {o.l}
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', paddingBottom:100 }}>
        {sorted.length === 0
          ? <EmptyState icon="↻" title="No routines" body="Enable 'treat as routine' on any recurring task to track it here."/>
          : sorted.map(s => (
              <div key={s.id} onClick={() => s.latestId && openDetail(s.latestId)} className="tap"
                style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                <div style={{ width:50, height:50, borderRadius:'50%', background:`conic-gradient(var(--accent) ${s.rate*3.6}deg, var(--surface-2) 0deg)`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, padding:3, boxShadow:'inset 0 0 0 1px var(--border)' }}>
                  <div style={{ width:'100%', height:'100%', borderRadius:'50%', background:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
                    <span style={{ fontSize:13, fontWeight:800, color:'var(--t1)', lineHeight:1, fontVariantNumeric:'tabular-nums', letterSpacing:'-.02em' }}>{s.streak}</span>
                    <span style={{ fontSize:7.5, color:'var(--t4)', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', marginTop:1 }}>day{s.streak===1?'':'s'}</span>
                  </div>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14.5, fontWeight:500, color:'var(--t1)', marginBottom:4, letterSpacing:'-.005em' }}>{s.title}</div>
                  <div style={{ display:'flex', gap:10, alignItems:'center', fontSize:12, color:'var(--t3)' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>↻ {s.recurrence?.label||'Recurring'}</span>
                    <span style={{ color:'var(--accent)', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{s.rate}%</span>
                    {s.nextDate && <span>Next {D.fmt(s.nextDate)}</span>}
                  </div>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            ))
        }
      </div>
    </div>
  );
}

// ── SettingsScreen ────────────────────────────────────────────────────────────
export function SettingsScreen({ onBack }) {
  const { theme, setTheme, accent, setAccent, look, setLook } = useApp();
  const { supabaseDisabled, user, signOut } = useAuth();
  const { tasks } = useData();

  const accents = [
    { color:'#0f766e', label:'Teal' },
    { color:'#6366f1', label:'Indigo' },
    { color:'#ec4899', label:'Rose' },
    { color:'#f59e0b', label:'Amber' },
    { color:'#3b82f6', label:'Blue' },
    { color:'#10b981', label:'Emerald' },
    { color:'#8b5cf6', label:'Violet' },
    { color:'#ef4444', label:'Red' },
  ];
  const looks = [
    { value:'glass',   label:'Glass' },
    { value:'soft',    label:'Soft' },
    { value:'minimal', label:'Minimal' },
    { value:'sharp',   label:'Sharp' },
  ];

  const Row = ({ label, children }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'15px 20px', borderBottom:'1px solid var(--border)' }}>
      <span style={{ flex:1, fontSize:15, color:'var(--t1)', fontWeight:500 }}>{label}</span>
      {children}
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)' }}>
      <Header title="Settings" onBack={onBack}/>
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', paddingBottom:60 }}>
        <SectionHeader label="Appearance"/>
        <div style={{ background:'var(--surface)', marginBottom:8 }}>
          <Row label="Theme">
            <div style={{ display:'flex', background:'var(--surface-2)', borderRadius:10, padding:3, gap:2 }}>
              {['light','dark'].map(t => (
                <button key={t} onClick={() => setTheme(t)}
                  style={{ padding:'6px 14px', borderRadius:8, border:'none', background: theme===t?'var(--surface)':'transparent', color: theme===t?'var(--t1)':'var(--t3)', fontSize:13, fontWeight: theme===t?600:500, cursor:'pointer', boxShadow: theme===t?'0 1px 4px rgba(0,0,0,.1)':'none', transition:'all .15s' }}>
                  {t==='light'?'☀ Light':'☾ Dark'}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Accent">
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
              {accents.map(a => (
                <button key={a.color} onClick={() => setAccent(a.color)} title={a.label} aria-label={a.label}
                  style={{ width:26, height:26, borderRadius:'50%', border:'none', background:a.color, cursor:'pointer', boxShadow: accent===a.color ? `0 0 0 2px var(--surface), 0 0 0 4px ${a.color}` : '0 0 0 1px var(--border)', transition:'box-shadow .15s' }}/>
              ))}
            </div>
          </Row>
          <Row label="Look">
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
              {looks.map(l => (
                <button key={l.value} onClick={() => setLook(l.value)}
                  style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${look===l.value?'var(--accent-border)':'var(--border)'}`, background: look===l.value?'var(--accent-dim)':'transparent', color: look===l.value?'var(--accent)':'var(--t3)', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s' }}>
                  {l.label}
                </button>
              ))}
            </div>
          </Row>
        </div>

        <SectionHeader label="Account"/>
        <div style={{ background:'var(--surface)', marginBottom:8 }}>
          <Row label="Signed in as">
            <span style={{ fontSize:13, color:'var(--t3)' }}>{user?.email || (supabaseDisabled ? 'Dev bypass' : '—')}</span>
          </Row>
          <Row label="Sync">
            <span style={{ fontSize:13, color: supabaseDisabled ? 'var(--t3)' : 'var(--accent)', fontWeight:600 }}>
              {supabaseDisabled ? 'Local only' : 'Live cloud'}
            </span>
          </Row>
          {!supabaseDisabled && user && (
            <Row label="">
              <button onClick={() => { signOut(); }} style={{ padding:'7px 14px', border:'1px solid var(--border)', borderRadius:10, background:'transparent', color:'var(--t1)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Sign out
              </button>
            </Row>
          )}
        </div>

        <SectionHeader label="About"/>
        <div style={{ background:'var(--surface)', marginBottom:8 }}>
          <Row label="Version"><span style={{ fontSize:14, color:'var(--t3)' }}>Mobile 1.0</span></Row>
          <Row label="Tasks"><span style={{ fontSize:14, color:'var(--t3)', fontVariantNumeric:'tabular-nums' }}>{tasks.length}</span></Row>
        </div>
      </div>
    </div>
  );
}
