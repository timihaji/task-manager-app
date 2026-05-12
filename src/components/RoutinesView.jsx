import React, { useMemo, useState } from 'react';
import {
  PROJ, LIFE_AREA_NAMES,
  D, recurrenceLabel, routinesRollup,
} from '../data.js';
import { I } from '../utils/icons.jsx';

// Routines dashboard — grouped by recurrenceId, sorted by streak by default.
// This is the Sunday-review surface; not a daily-driver. Mirrors the shape of
// DelegationsView (per-row click → opens the latest instance in the drawer).
//
// Filter prop & sort prop ride through tweaks so the view returns to its last
// state across sessions, matching the Delegations dashboard pattern.

function RoutinesView({ tasks, onJumpTo, tweaks, setTweak }) {
  const [search, setSearch] = useState('');
  const sort = ['streak','rate','title','next'].includes(tweaks?.routinesSort) ? tweaks.routinesSort : 'streak';
  const setSort = (v) => setTweak?.('routinesSort', v);

  const todayStr = D.str(D.today());
  const rollup = useMemo(() => routinesRollup(tasks || [], todayStr), [tasks, todayStr]);

  const rows = useMemo(() => {
    let list = rollup;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r => (r.displayTitle || '').toLowerCase().includes(q));
    }
    if (sort === 'streak') list = [...list].sort((a, b) => (b.streak || 0) - (a.streak || 0));
    else if (sort === 'rate') list = [...list].sort((a, b) => (b.completionRate30d || 0) - (a.completionRate30d || 0));
    else if (sort === 'title') list = [...list].sort((a, b) => (a.displayTitle || '').localeCompare(b.displayTitle || ''));
    else if (sort === 'next')  list = [...list].sort((a, b) => (a.nextFireDate || '9999').localeCompare(b.nextFireDate || '9999'));
    return list;
  }, [rollup, search, sort]);

  const fmtAgo = (dateStr) => {
    if (!dateStr) return '—';
    if (dateStr === todayStr) return 'today';
    const days = Math.round((D.parse(todayStr) - D.parse(dateStr)) / 86400000);
    if (days === 1) return 'yesterday';
    if (days > 1 && days < 30) return `${days}d ago`;
    if (days < -1 && days > -30) return `in ${-days}d`;
    if (days <= -1 && days >= -1) return 'tomorrow';
    return dateStr;
  };

  // Find the most-recent instance of a series → that's what we open in the drawer.
  const latestInstanceId = (recurrenceId) => {
    const siblings = (tasks || []).filter(t => t.recurrence?.recurrenceId === recurrenceId);
    if (!siblings.length) return null;
    const open = siblings.filter(t => !t.done && t.date).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (open) return open.id;
    const recent = [...siblings].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
    return recent?.id || null;
  };

  return (
    <div className="rt-view">
      <div className="rt-hdr">
        <div className="rt-title">Routines</div>
        <div className="rt-sub">{rows.length} {rows.length === 1 ? 'routine' : 'routines'} · sorted by {
          sort === 'streak' ? 'longest streak' : sort === 'rate' ? '30-day rate' : sort === 'title' ? 'name' : 'next fire'
        }</div>
        <div className="rt-toolbar">
          <input className="rt-search" placeholder="Filter routines…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="rt-seg" role="group" aria-label="Sort">
            <button className={sort === 'streak' ? 'act' : ''} onClick={() => setSort('streak')}>Streak</button>
            <button className={sort === 'rate'   ? 'act' : ''} onClick={() => setSort('rate')}>30-day</button>
            <button className={sort === 'next'   ? 'act' : ''} onClick={() => setSort('next')}>Next</button>
            <button className={sort === 'title'  ? 'act' : ''} onClick={() => setSort('title')}>Name</button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rt-empty">
          <div className="rt-empty-icon">↻</div>
          <h3>No routines yet</h3>
          <p>Make a recurring task and toggle "Treat as routine" in the drawer to track it here.</p>
        </div>
      ) : (
        <div className="rt-table">
          <div className="rt-row rt-head">
            <div className="rt-c rt-c-title">Routine</div>
            <div className="rt-c rt-c-cadence">Cadence</div>
            <div className="rt-c rt-c-streak">Streak</div>
            <div className="rt-c rt-c-last">Last done</div>
            <div className="rt-c rt-c-next">Next fire</div>
            <div className="rt-c rt-c-rate">30-day rate</div>
          </div>
          {rows.map(r => {
            const proj = PROJ.find(p => p.id === r.project);
            const ratePct = r.completionRate30d == null ? null : Math.round(r.completionRate30d * 100);
            return (
              <div key={r.recurrenceId} className="rt-row" onClick={() => {
                const id = latestInstanceId(r.recurrenceId);
                if (id) onJumpTo?.(id);
              }}>
                <div className="rt-c rt-c-title">
                  <span className="rt-title-text">{r.displayTitle}</span>
                  {proj && <span className="rt-proj" style={{ color: proj.color + 'cc' }}>{proj.id}</span>}
                  {r.lifeArea && <span className="rt-life">{LIFE_AREA_NAMES[r.lifeArea] || r.lifeArea}</span>}
                </div>
                <div className="rt-c rt-c-cadence">
                  <span className="schip schip-routine">↻ {recurrenceLabel(r.recurrence)}</span>
                </div>
                <div className="rt-c rt-c-streak">
                  {r.streak > 0
                    ? <span className="rt-streak"><I.Flame/>{r.streak}</span>
                    : <span className="rt-streak-zero">—</span>}
                </div>
                <div className="rt-c rt-c-last">{fmtAgo(r.lastDoneDate)}</div>
                <div className="rt-c rt-c-next">{fmtAgo(r.nextFireDate)}</div>
                <div className="rt-c rt-c-rate">
                  {ratePct == null ? <span className="rt-rate-zero">—</span> : (
                    <>
                      <span className="rt-rate-pct">{ratePct}%</span>
                      <span className="rt-rate-bar"><i style={{ width: `${ratePct}%` }} /></span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { RoutinesView };
