// Task Manager — Delegations dashboard view (per-person rollup)
// Loaded after tm-data.jsx and tm-drawer.jsx via Task Manager v2.html.
// Exposed on window as DelegationsView.

function DelegationsView({ tasks, onJumpTo, onUpdate, onDelete, onCheckIn }) {
  const { useState, useMemo } = React;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | stale | overdue | quiet
  const [sort, setSort] = useState('oldest'); // oldest | overdue | name
  const [expanded, setExpanded] = useState(new Set());

  const todayStr = D.str(D.today());
  const rollup = useMemo(() => peopleRollup(tasks || []), [tasks]);

  const filtered = useMemo(() => {
    let list = rollup;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p => p.displayName.toLowerCase().includes(q));
    }
    if (filter === 'stale') {
      list = list.filter(p => p.tasks.some(t => isStale(t)));
    } else if (filter === 'overdue') {
      list = list.filter(p => p.overdueCount > 0);
    } else if (filter === 'quiet') {
      list = list.filter(p => {
        if (!p.lastContactAt) return p.oldestDays >= 7;
        const days = (Date.now() - new Date(p.lastContactAt).getTime()) / 86400000;
        return days >= 7;
      });
    }
    if (sort === 'oldest') list = [...list].sort((a,b) => b.oldestDays - a.oldestDays);
    else if (sort === 'overdue') list = [...list].sort((a,b) => b.overdueCount - a.overdueCount);
    else if (sort === 'name') list = [...list].sort((a,b) => a.displayName.localeCompare(b.displayName));
    return list;
  }, [rollup, search, filter, sort]);

  const toggleExpand = (name) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const lastContactLabel = (iso) => {
    if (!iso) return 'no contact yet';
    const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    return days === 0 ? 'today' : `${days}d ago`;
  };

  const nextCheckInForTask = (parent) => {
    const ids = parent.checkInTaskIds || [];
    const pending = ids
      .map(cid => (tasks||[]).find(t => t.id === cid))
      .filter(t => t && !t.done)
      .sort((a,b) => (a.date||'').localeCompare(b.date||''));
    return pending[0];
  };

  if (!rollup.length) {
    return (
      <div className="del-view">
        <div className="del-empty">
          No active delegations. Open a task and set "Delegated to" to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="del-view">
      <div className="del-toolbar">
        <input className="del-search" placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="del-pickrow">
          {[['all','All'],['stale','Stale'],['overdue','Overdue check-in'],['quiet','No response 7+d']].map(([v,l]) => (
            <button key={v} className={`dr-pick${filter===v?' act':''}`}
              style={filter===v?{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}:{}}
              onClick={()=>setFilter(v)}>{l}</button>
          ))}
        </div>
        <div style={{flex:1}}/>
        <select className="dr-sel" value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="oldest">Oldest first</option>
          <option value="overdue">Most overdue</option>
          <option value="name">Person A–Z</option>
        </select>
      </div>

      <div className="del-cards">
        {filtered.map(p => {
          const isOpen = expanded.has(p.name);
          return (
            <div key={p.name} className="del-card">
              <div className="del-card-hdr" onClick={()=>toggleExpand(p.name)}>
                <span className="del-name">{p.displayName}</span>
                <span className="del-meta">{p.openCount} open</span>
                {p.overdueCount > 0 && <span className="del-meta del-overdue">{p.overdueCount} overdue</span>}
                <span className="del-meta">oldest {p.oldestDays}d</span>
                <span className="del-meta">{lastContactLabel(p.lastContactAt)}</span>
                <div style={{flex:1}}/>
                <span className="del-chv" style={{transform:isOpen?'rotate(90deg)':''}}>›</span>
              </div>
              {isOpen && (
                <div className="del-card-body">
                  {p.tasks.map(t => {
                    const next = nextCheckInForTask(t);
                    const stale = isStale(t);
                    const status = t.delegationStatus || 'waiting';
                    const statusColor = status === 'heard-back' ? '#22c55e' : status === 'sent' ? '#f59e0b' : '#71717a';
                    return (
                      <div key={t.id} className={`del-task${stale?' stale':''}`}>
                        <button className="del-task-title" onClick={()=>onJumpTo?.(t.id)}>{t.title}</button>
                        <span className="dr-pick" style={{cursor:'default',color:statusColor,borderColor:statusColor+'66',background:statusColor+'18'}}>
                          {status}
                        </span>
                        {next ? (
                          <span className="del-meta">next: d{next.checkInDayOffset} · {next.date}</span>
                        ) : <span className="del-meta">no pending check-in</span>}
                        <span className="del-meta">{lastContactLabel(t.lastContactAt)}</span>
                        <div style={{flex:1}}/>
                        {next && (
                          <>
                            <button className="dr-pick" style={{borderColor:'#f59e0b66',color:'#f59e0b'}}
                              onClick={()=>onCheckIn?.(next.id, 'sent-nudge')}>Sent</button>
                            <button className="dr-pick" style={{borderColor:'#22c55e66',color:'#22c55e'}}
                              onClick={()=>onCheckIn?.(next.id, 'heard-back')}>Heard back</button>
                            <button className="dr-time-clear" onClick={()=>onDelete?.(next.id)} title="Skip this check-in">Skip</button>
                          </>
                        )}
                        <button className="dr-time-clear" onClick={()=>{ if(confirm(`Take back from ${t.delegatedTo}?`)) onUpdate?.(t.id, {delegatedTo:null}); }} title="Reclaim this task">↶</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.DelegationsView = DelegationsView;
