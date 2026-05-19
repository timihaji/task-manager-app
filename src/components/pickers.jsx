import React, { useState, useEffect, useRef } from 'react';
import { PROJ, ALL_TAGS, TAG_NAMES, TAG_DARK, TAG_LIGHT, D } from '../data.js';
import { TIME_PRESETS, TIME_MORE, PRI_INFO } from '../utils/constants.js';
import { parseNLDate } from '../utils/parseNLDate.js';
import { MiniCalendar } from './MiniCalendar.jsx';

// Inline "+ Add" affordance for picker chips. Toggles to a text field that
// creates a new taxonomy entry on Enter.
function AddTaxonomyChip({ kind, onAdd }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (open) requestAnimationFrame(() => ref.current?.focus());
  }, [open]);
  const submit = () => {
    const trimmed = val.trim();
    if (trimmed) onAdd(kind, trimmed);
    setVal('');
    setOpen(false);
  };
  if (!open) {
    return <span className="card-pop-chip" style={{borderStyle:'dashed',color:'var(--t3)'}}
      onClick={() => setOpen(true)}>+ Add</span>;
  }
  return (
    <input ref={ref} className="card-pop-search" style={{margin:0, padding:'3px 8px', fontSize:11, width:120}}
      value={val} placeholder="New name…"
      onChange={e => setVal(e.target.value)}
      onBlur={submit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { e.preventDefault(); setVal(''); setOpen(false); }
      }}/>
  );
}

function TagPicker({ task, theme, recents, onChange, onAddTaxonomy, onClose, isBulk }) {
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
      {onAddTaxonomy && (
        <div className="card-pop-row" style={{marginTop:6}}>
          <AddTaxonomyChip kind="tag" onAdd={onAddTaxonomy}/>
        </div>
      )}
      <div className="card-pop-foot">
        <button className="card-pop-clear" onClick={onClose}>Done</button>
      </div>
    </>
  );
}

function ProjPicker({ task, recents, onChange, onAddTaxonomy, onClose, isBulk }) {
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
        {onAddTaxonomy && <AddTaxonomyChip kind="context" onAdd={onAddTaxonomy}/>}
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
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [customTime, setCustomTime] = useState('');
  const [customDay, setCustomDay] = useState('today');
  const [notifDismissed, setNotifDismissed] = useState(false);
  const today = D.today();
  const now = new Date();

  // Helpers — every preset writes a full ISO timestamp now that snoozedUntil
  // is timestamptz on the DB. Day-only presets anchor at 09:00 local.
  const isoIn = (mins) => new Date(Date.now() + mins * 60000).toISOString();
  const atHour = (dateObj, hour, minute=0) => {
    const d = new Date(dateObj);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  const snoozeAbs = (iso) => {
    onChange({
      snoozedUntil: iso,
      snoozeMode: 'absolute',
      snoozeOffsetDays: null,
      snoozedAt: new Date().toISOString(),
    });
    onClose();
  };

  // Named periods anchored at fixed local hours; if today's already past that
  // hour, the chip targets tomorrow at the same hour and shows a "tmrw" hint.
  const namedPeriodTs = (hour) => {
    const candidate = new Date(today); candidate.setHours(hour, 0, 0, 0);
    if (candidate.getTime() <= now.getTime()) {
      const tmrw = D.add(today, 1); tmrw.setHours(hour, 0, 0, 0);
      return tmrw.toISOString();
    }
    return candidate.toISOString();
  };
  const namedPeriodIsTmrw = (hour) => {
    const candidate = new Date(today); candidate.setHours(hour, 0, 0, 0);
    return candidate.getTime() <= now.getTime();
  };

  // Later-today durations: only show chips whose wake-up stays inside today.
  const TODAY_DURATIONS = [
    { l: '+15m', m: 15 },
    { l: '+30m', m: 30 },
    { l: '+1h',  m: 60 },
    { l: '+2h',  m: 120 },
    { l: '+4h',  m: 240 },
  ];
  const visibleDurations = TODAY_DURATIONS.filter(o => {
    const t = new Date(Date.now() + o.m * 60000);
    return D.str(t) === D.str(today);
  });

  const NAMED_PERIODS = [
    { l: 'This afternoon', hour: 13 },
    { l: 'This evening',   hour: 18 },
    { l: 'Tonight',        hour: 21 },
  ];

  const nextSat = () => { const d = new Date(today); const day = d.getDay(); d.setDate(d.getDate() + (day === 6 ? 7 : (6 - day))); d.setHours(9,0,0,0); return d.toISOString(); };
  const nextMon = () => { const d = new Date(today); const day = d.getDay(); d.setDate(d.getDate() + (day === 1 ? 7 : (8 - day) % 7 || 7)); d.setHours(9,0,0,0); return d.toISOString(); };

  const WEEK_OPTS = [
    { l: 'Tomorrow 9 AM', fn: () => atHour(D.add(today, 1), 9) },
    { l: 'In 2 days',     fn: () => atHour(D.add(today, 2), 9) },
    { l: 'In 3 days',     fn: () => atHour(D.add(today, 3), 9) },
    { l: 'This weekend',  fn: nextSat },
    { l: 'Next week',     fn: nextMon },
  ];

  const LATER_OPTS = [
    { l: 'In 2 weeks', fn: () => atHour(D.add(today, 14), 9) },
    { l: 'In 3 weeks', fn: () => atHour(D.add(today, 21), 9) },
    { l: 'Next month', fn: () => { const d = new Date(today); d.setMonth(d.getMonth()+1); d.setHours(9,0,0,0); return d.toISOString(); } },
    { l: 'In 3 months',fn: () => { const d = new Date(today); d.setMonth(d.getMonth()+3); d.setHours(9,0,0,0); return d.toISOString(); } },
  ];

  const submitCustomTime = () => {
    if (!customTime) return;
    const [h, m] = customTime.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return;
    const base = customDay === 'today' ? new Date(today) : D.add(today, 1);
    base.setHours(h, m, 0, 0);
    snoozeAbs(base.toISOString());
  };

  // Notification banner — only when permission is 'default' (user hasn't
  // chosen yet) and they're looking at the today section (the case where
  // notifications matter most). 'denied' / 'granted' silences it.
  const notifSupported = typeof window !== 'undefined' && 'Notification' in window;
  const notifPerm = notifSupported ? Notification.permission : 'unsupported';
  const showNotifBanner = notifSupported && notifPerm === 'default' && !notifDismissed && visibleDurations.length > 0;
  const enableNotif = async () => {
    try { await Notification.requestPermission(); } catch {}
    setNotifDismissed(true);
  };

  return (
    <>
      {isBulk && <div className="card-pop-bulk-hd">Editing {isBulk} tasks</div>}

      {showNotifBanner && (
        <div className="snz-notif-banner">
          <span className="snz-notif-msg">Get a ping when this wakes up?</span>
          <button className="snz-notif-enable" onClick={enableNotif}>Enable</button>
          <button className="snz-notif-dismiss" aria-label="Dismiss" onClick={() => setNotifDismissed(true)}>×</button>
        </div>
      )}

      {visibleDurations.length > 0 && (
        <>
          <div className="snz-sec-lbl">Later today</div>
          <div className="snz-grid">
            {visibleDurations.map(o => (
              <span key={o.l} className="card-pop-chip snz-chip"
                onClick={() => snoozeAbs(isoIn(o.m))}>{o.l}</span>
            ))}
            {NAMED_PERIODS.map(p => {
              const tmrw = namedPeriodIsTmrw(p.hour);
              return (
                <span key={p.l} className="card-pop-chip snz-chip"
                  title={tmrw ? `Already past ${p.l.toLowerCase()} today — snoozing to tomorrow` : ''}
                  onClick={() => snoozeAbs(namedPeriodTs(p.hour))}>
                  {p.l}{tmrw && <span className="snz-chip-suffix"> · tmrw</span>}
                </span>
              );
            })}
            <span className="card-pop-chip snz-chip snz-chip-alt"
              onClick={() => setShowTimePicker(v => !v)}>Pick time…</span>
          </div>
          {showTimePicker && (
            <div className="snz-time-row">
              <input type="time" className="snz-time-input" value={customTime}
                onChange={e => setCustomTime(e.target.value)} />
              <div className="snz-day-seg">
                <span className={customDay==='today'?'act':''} onClick={() => setCustomDay('today')}>Today</span>
                <span className={customDay==='tomorrow'?'act':''} onClick={() => setCustomDay('tomorrow')}>Tomorrow</span>
              </div>
              <button className="snz-time-go" disabled={!customTime} onClick={submitCustomTime}>Snooze</button>
            </div>
          )}
        </>
      )}

      <div className="snz-sec-lbl">Later this week</div>
      <div className="snz-grid">
        {WEEK_OPTS.map(o => (
          <span key={o.l} className="card-pop-chip snz-chip"
            onClick={() => snoozeAbs(o.fn())}>{o.l}</span>
        ))}
      </div>

      <div className="snz-sec-lbl">Further out</div>
      <div className="snz-grid">
        {LATER_OPTS.map(o => (
          <span key={o.l} className="card-pop-chip snz-chip"
            onClick={() => snoozeAbs(o.fn())}>{o.l}</span>
        ))}
        <span className="card-pop-chip snz-chip snz-chip-alt"
          onClick={() => setShowCal(v => !v)}>Pick date…</span>
      </div>

      {showCal && (
        <MiniCalendar value={task.snoozedUntil ? D.snoozeDayKey(task.snoozedUntil) : null}
          onPick={(dateStr) => {
            const d = D.parse(dateStr); d.setHours(9, 0, 0, 0);
            snoozeAbs(d.toISOString());
          }} />
      )}

      {cur && (
        <div className="card-pop-foot">
          <button className="card-pop-clear"
            onClick={() => { onChange({ snoozedUntil: null, snoozeMode: null, snoozeOffsetDays: null, snoozedAt: null }); onClose(); }}>
            Wake up now
          </button>
        </div>
      )}
    </>
  );
}

export { TagPicker, ProjPicker, TimePicker, DatePicker, PriPicker, SnoozePicker };
