import React, { useState } from 'react';
import { PROJ, ALL_TAGS, TAG_NAMES, TAG_DARK, TAG_LIGHT, D } from '../data.js';
import { TIME_PRESETS, TIME_MORE, PRI_INFO, SNOOZE_OPTS } from '../utils/constants.js';
import { parseNLDate } from '../utils/parseNLDate.js';
import { MiniCalendar } from './MiniCalendar.jsx';

function TagPicker({ task, theme, recents, onChange, onClose, isBulk }) {
  const tp = theme === 'dark' ? TAG_DARK : TAG_LIGHT;
  const [filter, setFilter] = useState('');
  const cur = task.tags || [];
  const toggle = t => {
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
    onChange({ tags: next }, t);
  };
  const list = ALL_TAGS.filter(t => !filter || (TAG_NAMES[t] || t).toLowerCase().includes(filter.toLowerCase()));
  const recList = (recents || []).filter(t => ALL_TAGS.includes(t)).slice(0, 3);

  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      {ALL_TAGS.length > 6 && (
        <input className="card-pop-search" placeholder="Filter tags..." autoFocus value={filter} onChange={e => setFilter(e.target.value)} />
      )}
      {recList.length > 0 && !filter && (
        <>
          <div className="card-pop-recent-lbl">Recent</div>
          <div className="card-pop-row">
            {recList.map(t => {
              const c = tp[t] || tp.admin;
              const act = cur.includes(t);
              return (
                <span
                  key={`r${t}`}
                  className={`card-pop-chip${act ? ' act' : ''}`}
                  style={{ background: c.bg, color: c.fg, borderColor: act ? `${c.fg}aa` : `${c.fg}55`, boxShadow: act ? `inset 0 0 0 1px ${c.fg}55` : undefined, fontWeight: act ? 600 : undefined }}
                  onClick={() => toggle(t)}
                >
                  {TAG_NAMES[t] || t}
                </span>
              );
            })}
          </div>
          <div className="card-pop-sep" />
        </>
      )}
      <div className="card-pop-row">
        {list.map(t => {
          const c = tp[t] || tp.admin;
          const act = cur.includes(t);
          return (
            <span
              key={t}
              className={`card-pop-chip${act ? ' act' : ''}`}
              style={act ? { background: c.bg, color: c.fg, borderColor: `${c.fg}66` } : {}}
              onClick={() => toggle(t)}
            >
              {TAG_NAMES[t] || t}
            </span>
          );
        })}
      </div>
      <div className="card-pop-foot">
        <button className="card-pop-clear" onClick={onClose}>Done</button>
      </div>
    </>
  );
}

function ProjPicker({ task, recents, onChange, onClose, isBulk }) {
  const cur = task.project || null;
  const recList = (recents || []).filter(p => PROJ.find(x => x.id === p)).slice(0, 3);
  const pick = p => {
    onChange({ project: cur === p ? null : p }, p);
    onClose();
  };

  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      {recList.length > 0 && (
        <>
          <div className="card-pop-recent-lbl">Recent</div>
          <div className="card-pop-row">
            {recList.map(pid => {
              const p = PROJ.find(x => x.id === pid);
              if (!p) return null;
              const act = cur === p.id;
              return (
                <span
                  key={`r${pid}`}
                  className={`card-pop-chip${act ? ' act' : ''}`}
                  style={{ background: `${p.color}${act ? '33' : '14'}`, color: p.color, borderColor: act ? `${p.color}aa` : `${p.color}55`, boxShadow: act ? `inset 0 0 0 1px ${p.color}66` : undefined, fontWeight: act ? 600 : undefined }}
                  onClick={() => pick(p.id)}
                >
                  <span className="card-pop-chip-dot" style={{ background: p.color }} />
                  {p.label}
                </span>
              );
            })}
          </div>
          <div className="card-pop-sep" />
        </>
      )}
      <div className="card-pop-row">
        {PROJ.map(p => {
          const act = cur === p.id;
          return (
            <span
              key={p.id}
              className={`card-pop-chip${act ? ' act' : ''}`}
              style={{ background: `${p.color}${act ? '33' : '14'}`, color: p.color, borderColor: act ? `${p.color}aa` : `${p.color}55`, boxShadow: act ? `inset 0 0 0 1px ${p.color}66` : undefined, fontWeight: act ? 600 : undefined }}
              onClick={() => pick(p.id)}
            >
              <span className="card-pop-chip-dot" style={{ background: p.color }} />
              {p.label}
            </span>
          );
        })}
        {cur && <button className="card-pop-clear" onClick={() => { onChange({ project: null }); onClose(); }}>Clear</button>}
      </div>
    </>
  );
}

function TimePicker({ task, onChange, onClose, isBulk }) {
  const cur = task.timeEstimate || null;
  const [showMore, setShowMore] = useState(false);
  const pick = v => {
    onChange({ timeEstimate: cur === v ? null : v });
    onClose();
  };

  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      <div className="card-pop-row">
        {TIME_PRESETS.map(p => {
          const act = cur === p;
          return <span key={p} className={`card-pop-chip${act ? ' act' : ''}`} onClick={() => pick(p)}>{p}</span>;
        })}
        <span className="card-pop-chip" onClick={() => setShowMore(s => !s)}>{showMore ? 'Less ^' : 'More v'}</span>
      </div>
      {showMore && (
        <>
          <div className="card-pop-sep" />
          <div className="card-pop-row">
            {TIME_MORE.map(p => {
              const act = cur === p;
              return <span key={p} className={`card-pop-chip${act ? ' act' : ''}`} onClick={() => pick(p)}>{p}</span>;
            })}
          </div>
        </>
      )}
      {cur && (
        <div className="card-pop-foot">
          <button className="card-pop-clear" onClick={() => { onChange({ timeEstimate: null }); onClose(); }}>Clear</button>
        </div>
      )}
    </>
  );
}

function DatePicker({ task, onChange, onClose, isBulk }) {
  const cur = task.date || null;
  const [nl, setNL] = useState('');
  const today = D.today();
  const nlValue = nl.trim().toLowerCase();
  const isSomeday = nlValue === 'someday';
  const isInbox = ['inbox', 'backlog', 'no date', 'nodate', 'clear'].includes(nlValue);
  const nextMon = () => { const d = new Date(today); const day = d.getDay(); d.setDate(d.getDate() + (day === 1 ? 7 : (8 - day) % 7 || 7)); return D.str(d); };
  const quick = [
    { l: 'Today', fn: () => D.str(today) },
    { l: 'Tomorrow', fn: () => D.str(D.add(today, 1)) },
    { l: 'Next week', fn: nextMon },
    { l: 'Inbox', fn: () => null },
  ];
  const preview = parseNLDate(nl);
  const previewLbl = isSomeday
    ? 'Move to Someday'
    : isInbox
      ? 'Move to Inbox'
      : preview
        ? D.parse(preview).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
        : null;

  const commit = patch => {
    onChange(patch);
    onClose();
  };
  const commitDate = v => commit({ date: v, someday: false });

  const onNLKey = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (isSomeday) commit({ date: null, someday: true });
    else if (isInbox) commit({ date: null, someday: false });
    else if (preview) commitDate(preview);
  };

  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      <div className="card-pop-row">
        {quick.map(q => {
          const v = q.fn();
          const act = cur === v;
          return <span key={q.l} className={`card-pop-chip${act ? ' act' : ''}`} onClick={() => commitDate(v)}>{q.l}</span>;
        })}
        {cur && <button className="card-pop-clear" onClick={() => commitDate(null)}>Clear</button>}
      </div>
      <div className="card-pop-sep" />
      <input
        className="card-pop-input"
        placeholder='e.g. "next fri", "+3d", "4/15", "someday"'
        value={nl}
        onChange={e => setNL(e.target.value)}
        onKeyDown={onNLKey}
        autoFocus
      />
      {nl && (
        <div className={`card-pop-hint${previewLbl ? '' : ' warn'}`}>
          {previewLbl ? `Enter -> ${previewLbl}` : "Can't parse"}
        </div>
      )}
      <MiniCalendar value={cur} onPick={commitDate} />
    </>
  );
}

function PriPicker({ task, onChange, onClose, isBulk }) {
  const cur = task.priority || task.pri || null;
  const pick = v => {
    onChange({ priority: v, pri: v });
    onClose();
  };

  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      <div className="card-pop-row">
        {['p1', 'p2', 'p3'].map(v => {
          const inf = PRI_INFO[v];
          const act = cur === v;
          return (
            <span
              key={v}
              className={`card-pop-chip${act ? ' act' : ''}`}
              style={act ? { background: `${inf.c}22`, color: inf.c, borderColor: `${inf.c}66` } : {}}
              onClick={() => pick(v)}
            >
              {inf.l}
            </span>
          );
        })}
        {cur && <button className="card-pop-clear" onClick={() => { onChange({ priority: null, pri: null }); onClose(); }}>Clear</button>}
      </div>
    </>
  );
}

function SnoozePicker({ task, onChange, onClose, isBulk }) {
  const cur = task.snoozedUntil || task.snoozeMode || null;
  const [showCal, setShowCal] = useState(false);
  const today = D.today();
  const nextSat = () => { const d = new Date(today); const day = d.getDay(); d.setDate(d.getDate() + (day === 6 ? 7 : (6 - day))); return D.str(d); };
  const nextMon = () => { const d = new Date(today); const day = d.getDay(); d.setDate(d.getDate() + (day === 1 ? 7 : (8 - day) % 7 || 7)); return D.str(d); };
  const snoozeAbs = (dateStr) => { onChange({ snoozedUntil: dateStr, snoozeMode: 'absolute', snoozeOffsetDays: null }); onClose(); };
  const OPTS = [
    { l: 'Tomorrow',    fn: () => D.str(D.add(today, 1)) },
    { l: 'In 2 days',   fn: () => D.str(D.add(today, 2)) },
    { l: 'In 3 days',   fn: () => D.str(D.add(today, 3)) },
    { l: 'This weekend',fn: nextSat },
    { l: 'Next week',   fn: nextMon },
    { l: 'In 2 weeks',  fn: () => D.str(D.add(today, 14)) },
    { l: 'In 3 weeks',  fn: () => D.str(D.add(today, 21)) },
    { l: 'Next month',  fn: () => { const d = new Date(today); d.setMonth(d.getMonth() + 1); return D.str(d); } },
    { l: 'In 3 months', fn: () => { const d = new Date(today); d.setMonth(d.getMonth() + 3); return D.str(d); } },
  ];
  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px', padding:'4px 0'}}>
        {OPTS.map(o => (
          <span key={o.l} className="card-pop-chip" style={{textAlign:'center', justifyContent:'center'}}
            onClick={() => snoozeAbs(o.fn())}>{o.l}</span>
        ))}
        <span className="card-pop-chip" style={{textAlign:'center', justifyContent:'center', opacity:.8}}
          onClick={() => setShowCal(v => !v)}>Pick date…</span>
      </div>
      {showCal && (
        <MiniCalendar value={task.snoozedUntil || null} onPick={snoozeAbs} />
      )}
      {cur && (
        <div className="card-pop-foot">
          <button className="card-pop-clear" onClick={() => { onChange({ snoozedUntil: null, snoozeMode: null, snoozeOffsetDays: null }); onClose(); }}>Wake up now</button>
        </div>
      )}
    </>
  );
}

export { TagPicker, ProjPicker, TimePicker, DatePicker, PriPicker, SnoozePicker };
