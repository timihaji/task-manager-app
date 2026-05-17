import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  D, isStale, peopleRollup, personKey,
  CHECKIN_PRESETS, CHECKIN_PRESET_LABELS, matchPreset,
} from './data.js';
import { I } from './utils/icons.jsx';
import { ActivityLog, lastNoteFor as sharedLastNoteFor, fmtAgo as sharedFmtAgo } from './components/ActivityLog.jsx';

// Delegations view — two-pane: left rail (date · filters · sectioned inbox), right pane (cadence · activity · composer).
// Hi-fi rework: replaces the old per-person rollup. Cadence dots and log rows are bidirectionally hover-linked.
// Activity log renders oldest-first ("Delegated to X" as first entry).

const STATUS_FILTERS = [
  { id: 'all',     label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'heard',   label: 'Heard back' },
  { id: 'stale',   label: 'Stale' },
];

// Classify a delegated task into a section bucket (mutually exclusive).
function classify(t) {
  if (isStale(t)) return 'stale';
  if (t.delegationStatus === 'heard-back') return 'heard';
  // overdue == has an expiry date in the past
  if (t.expiryDate && t.expiryDate < D.str(D.today())) return 'overdue';
  return 'waiting';
}

function ageDays(iso) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

// fmtAgo re-exported from shared ActivityLog so view + drawer agree on formatting.
const fmtAgo = sharedFmtAgo;

function fmtShort(iso) {
  if (!iso) return '';
  try {
    const dt = iso.length === 10 ? D.parse(iso) : new Date(iso);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function startOfWeek(d) {
  const dt = new Date(d); dt.setHours(0,0,0,0);
  const dow = dt.getDay(); // Sunday=0
  // Use Mon=0 alignment so the strip reads Mon..Sun like the mockup
  const offset = (dow + 6) % 7;
  dt.setDate(dt.getDate() - offset);
  return dt;
}

// describeActivity moved to src/components/ActivityLog.jsx so view + drawer share it.

function statusChip(t) {
  if (isStale(t)) return { cls: 'stale', label: `Stale · ${ageDays(t.lastContactAt || t.delegatedAt)}d quiet` };
  if (t.delegationStatus === 'heard-back') return { cls: 'heard', label: 'Heard back' };
  if (t.expiryDate && t.expiryDate < D.str(D.today())) {
    const days = Math.max(0, Math.floor((Date.now() - D.parse(t.expiryDate).getTime()) / 86400000));
    return { cls: 'overdue', label: `${days}d overdue` };
  }
  return { cls: 'waiting', label: 'Waiting' };
}

function DelegationsView({
  tasks,
  onJumpTo,
  onUpdate,
  onDelete,
  onCheckIn,
  onChase,
  onTakeBack,
  onAddNote,
  onAddDelegation,
  onCreateDelegation,
  onShowOnTimeline,
  showToast,
  showConfirm,
  statusFilter, onStatusFilterChange,
  personFilter, onPersonFilterChange,
  dayFilter, onDayFilterChange,
  selectedId, onSelectId,
}) {
  const [search, setSearch] = useState('');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(D.today()));
  const [personPopOpen, setPersonPopOpen] = useState(false);
  const [personSearch, setPersonSearch] = useState('');
  const [kebabOpen, setKebabOpen] = useState(false);
  const [hoverStep, setHoverStep] = useState(null);
  // Mobile two-pane "showing detail" toggle. On narrow viewports, the inbox
  // and right pane share the same column; this flag flips which is visible.
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const personPopRef = useRef(null);
  const kebabRef = useRef(null);
  const composerRef = useRef(null);
  const reminderInputRef = useRef(null);

  // Inline new-delegation composer state.
  const [newTitle, setNewTitle] = useState('');
  const [newPerson, setNewPerson] = useState('');
  const [newPersonPopOpen, setNewPersonPopOpen] = useState(false);
  const newTitleRef = useRef(null);
  const newPersonRef = useRef(null);
  const newPersonPopRef = useRef(null);
  const [titleShake, setTitleShake] = useState(false);

  const statusF = STATUS_FILTERS.some(s => s.id === statusFilter) ? statusFilter : 'all';
  const personF = Array.isArray(personFilter) ? personFilter : [];

  // All open delegated tasks (parents).
  const allDelegated = useMemo(() => (
    (tasks || []).filter(t => t.delegatedTo && !t.done && !t.archived && !t.parentId)
  ), [tasks]);

  // Person list (from delegations).
  const allPeople = useMemo(() => {
    const counts = new Map();
    allDelegated.forEach(t => {
      const k = t.delegatedTo;
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allDelegated]);
  // Filtered people for the dropdown search.
  const visiblePeople = useMemo(() => {
    const q = personSearch.trim().toLowerCase();
    if (!q) return allPeople;
    return allPeople.filter(p => p.name.toLowerCase().includes(q));
  }, [allPeople, personSearch]);

  // lastNoteFor re-exported from shared ActivityLog so view + drawer agree.
  const lastNoteFor = sharedLastNoteFor;

  // Inline-composer submit. If person is empty, focus the picker instead
  // of submitting — title-only delegations would orphan a task in the inbox
  // without a delegatee. If title is empty, shake the input.
  const submitNewDelegation = () => {
    const title = newTitle.trim();
    const person = newPerson.trim();
    if (!title) {
      setTitleShake(true);
      setTimeout(() => setTitleShake(false), 400);
      newTitleRef.current?.focus();
      return;
    }
    if (!person) {
      setNewPersonPopOpen(true);
      newPersonRef.current?.focus();
      return;
    }
    onCreateDelegation?.({ title, delegatedTo: person });
    setNewTitle('');
    setNewPerson('');
    setNewPersonPopOpen(false);
    setTimeout(() => newTitleRef.current?.focus(), 0);
  };
  // Filter the person picker as the user types into it.
  const newPersonMatches = useMemo(() => {
    const q = newPerson.trim().toLowerCase();
    if (!q) return allPeople;
    return allPeople.filter(p => p.name.toLowerCase().includes(q));
  }, [allPeople, newPerson]);
  const newPersonIsNew = newPerson.trim() && !allPeople.some(p => p.name.toLowerCase() === newPerson.trim().toLowerCase());

  // Apply filters.
  const filtered = useMemo(() => {
    let list = allDelegated;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.delegatedTo || '').toLowerCase().includes(q));
    }
    if (statusF !== 'all') {
      list = list.filter(t => classify(t) === statusF);
    }
    if (personF.length) {
      const set = new Set(personF.map(personKey));
      list = list.filter(t => set.has(personKey(t.delegatedTo)));
    }
    if (dayFilter) {
      // Match anything with an event on the selected day. Includes expiry,
      // pending check-ins, personal reminder, or a heard-back recorded that day.
      list = list.filter(t => {
        if (t.expiryDate === dayFilter) return true;
        if (t.personalReminderDate === dayFilter) return true;
        const hasCheckIn = (t.checkInTaskIds || []).some(cid => {
          const ci = (tasks || []).find(x => x.id === cid);
          return ci && !ci.done && ci.date === dayFilter;
        });
        if (hasCheckIn) return true;
        const hasHeard = (t.activity || []).some(ev => ev.type === 'heard-back' && (ev.at || '').slice(0,10) === dayFilter);
        if (hasHeard) return true;
        return false;
      });
    }
    // Sort by most overdue / most stale first.
    return list.slice().sort((a, b) => {
      const sa = ageDays(a.lastContactAt || a.delegatedAt) || 0;
      const sb = ageDays(b.lastContactAt || b.delegatedAt) || 0;
      return sb - sa;
    });
  }, [allDelegated, search, statusF, personF, dayFilter, tasks]);

  // Status counts (for chip badges) — count across all, not filtered.
  const counts = useMemo(() => {
    const c = { all: allDelegated.length, overdue: 0, waiting: 0, heard: 0, stale: 0 };
    allDelegated.forEach(t => {
      const cls = classify(t);
      c[cls] += 1;
    });
    return c;
  }, [allDelegated]);

  // Group filtered list into sections.
  const grouped = useMemo(() => {
    const g = { waiting: [], heard: [], stale: [], overdue: [] };
    filtered.forEach(t => { g[classify(t)].push(t); });
    return g;
  }, [filtered]);

  // Selected task (right pane). Resolve to first available if invalid.
  const selected = useMemo(() => {
    if (selectedId) {
      const s = filtered.find(t => t.id === selectedId);
      if (s) return s;
    }
    return filtered[0] || null;
  }, [filtered, selectedId]);

  // If filter pruned the selected, update parent ref.
  useEffect(() => {
    if (selected && selected.id !== selectedId) onSelectId?.(selected.id);
    if (!selected && selectedId) onSelectId?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Close popovers on outside click.
  useEffect(() => {
    const handler = (e) => {
      if (personPopOpen && personPopRef.current && !personPopRef.current.contains(e.target)) {
        setPersonPopOpen(false);
      }
      if (kebabOpen && kebabRef.current && !kebabRef.current.contains(e.target)) {
        setKebabOpen(false);
      }
      if (newPersonPopOpen && newPersonPopRef.current && !newPersonPopRef.current.contains(e.target)) {
        setNewPersonPopOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [personPopOpen, kebabOpen, newPersonPopOpen]);

  // Keyboard shortcuts — scoped to the delegations view via document-level
  // handler that bails when the user is typing in an input/textarea/contenteditable.
  // J/K = navigate selection. N = focus composer. H = heard back. T = take back.
  // S = snooze (delegates to drawer). R = focus personal-reminder picker.
  useEffect(() => {
    const onKey = (e) => {
      // Skip when typing or any modifier is pressed (avoid clobbering ⌘K etc).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (!['j','k','n','h','t','s','r'].includes(key)) return;
      const idx = filtered.findIndex(t => t.id === (selected?.id));
      if (key === 'j' && filtered.length) {
        e.preventDefault();
        const ni = (idx + 1) % filtered.length;
        onSelectId?.(filtered[ni].id);
        return;
      }
      if (key === 'k' && filtered.length) {
        e.preventDefault();
        const ni = (idx - 1 + filtered.length) % filtered.length;
        onSelectId?.(filtered[ni].id);
        return;
      }
      if (!selected) return;
      if (key === 'n') {
        e.preventDefault();
        composerRef.current?.focus();
        return;
      }
      if (key === 'h') {
        e.preventDefault();
        const pending = (selected.checkInTaskIds||[])
          .map(cid => (tasks||[]).find(t => t.id === cid))
          .find(t => t && !t.done);
        if (pending) onCheckIn?.(pending.id, 'heard-back');
        else onUpdate?.(selected.id, { delegationStatus: 'heard-back', lastContactAt: new Date().toISOString() });
        return;
      }
      if (key === 't') {
        e.preventDefault();
        onTakeBack?.(selected.id);
        return;
      }
      if (key === 's') {
        e.preventDefault();
        onJumpTo?.(selected.id, 'date'); // delegate to drawer's snooze picker
        return;
      }
      if (key === 'r') {
        e.preventDefault();
        reminderInputRef.current?.focus();
        reminderInputRef.current?.showPicker?.();
        return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [filtered, selected?.id, tasks, onCheckIn, onUpdate, onTakeBack, onJumpTo, onSelectId]);

  // Week-strip day data. Each day collects typed events the user can
  // act on — chase (cadence check-in or future promise), overdue (promise
  // date past), heard (heard-back recorded that day), reminder (personal
  // reminder fires). Each event carries the task ref so click/hover can
  // surface the title and person.
  const weekDays = useMemo(() => {
    const out = [];
    const todayStr = D.str(D.today());
    for (let i = 0; i < 7; i++) {
      const dt = new Date(weekStart); dt.setDate(weekStart.getDate() + i);
      const ds = D.str(dt);
      const events = [];
      allDelegated.forEach(t => {
        if (t.expiryDate === ds) {
          events.push({ kind: ds < todayStr ? 'overdue' : 'chase', taskId: t.id, title: t.title, person: t.delegatedTo, label: ds < todayStr ? 'Promise date passed' : 'Promise due' });
        }
        (t.checkInTaskIds || []).forEach(cid => {
          const ci = (tasks||[]).find(x => x.id === cid);
          if (ci && !ci.done && ci.date === ds) {
            events.push({ kind: 'chase', taskId: t.id, title: t.title, person: t.delegatedTo, label: 'Nudge due' });
          }
        });
        if (t.personalReminderDate === ds) {
          events.push({ kind: 'reminder', taskId: t.id, title: t.title, person: t.delegatedTo, label: 'Personal reminder' });
        }
        // Heard-back activity entry recorded on this day.
        (t.activity || []).forEach(ev => {
          if (ev.type === 'heard-back' && (ev.at || '').slice(0, 10) === ds) {
            events.push({ kind: 'heard', taskId: t.id, title: t.title, person: t.delegatedTo, label: 'Heard back' });
          }
        });
      });
      out.push({
        date: dt,
        ds,
        dow: dt.toLocaleDateString(undefined, { weekday: 'short' }),
        num: dt.getDate(),
        isToday: ds === todayStr,
        events,
        // Up to 3 dot kinds, deduped to keep visual budget small.
        dots: [...new Set(events.map(e => e.kind))].slice(0, 4),
      });
    }
    return out;
  }, [weekStart, allDelegated, tasks]);

  // ----- ZERO STATE -----
  if (!allDelegated.length) {
    return (
      <div className="dvv">
        <div className="dvv-empty">
          <div className="dvv-empty-title">No active delegations</div>
          <div className="dvv-empty-body">Open any task, set "Delegated to" in the drawer's Delegation section, and it will appear here. You can also right-click a card and choose <b>Delegate to…</b>.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dvv">
      {/* Top toolbar — search + inline new-delegation composer */}
      <div className="dvv-tb">
        <div className="dvv-tb-search">
          <I.Search/>
          <input
            placeholder="Search delegations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className={`dvv-new${titleShake?' shake':''}`}>
        <span className="dvv-new-plus"><I.Plus/></span>
        <input
          ref={newTitleRef}
          className="dvv-new-title"
          placeholder="Delegate a task… (e.g. Review Q3 deck)"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); submitNewDelegation(); }
            if (e.key === 'Escape') { setNewTitle(''); setNewPerson(''); setNewPersonPopOpen(false); }
          }}
        />
        <span className="dvv-new-sep"/>
        <span className="dvv-new-person-wrap" ref={newPersonPopRef}>
          <button
            ref={newPersonRef}
            type="button"
            className={`dvv-new-person${newPerson?' filled':''}`}
            aria-haspopup="listbox"
            aria-expanded={newPersonPopOpen}
            onClick={() => setNewPersonPopOpen(v => !v)}>
            {newPerson ? (
              <>
                <span className="dvv-new-av">{newPerson.charAt(0).toUpperCase()}</span>
                <span>{newPerson}</span>
              </>
            ) : (
              <>
                <I.User/>
                <span>Person…</span>
              </>
            )}
            <span className="dvv-new-caret"><I.ChevDown/></span>
          </button>
          {newPersonPopOpen && (
            <div className="dvv-new-pop" role="listbox" aria-label="Delegate to">
              <input
                className="dvv-new-pop-search"
                autoFocus
                placeholder="Type a name…"
                value={newPerson}
                onChange={e => setNewPerson(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newPerson.trim()) {
                      setNewPersonPopOpen(false);
                      submitNewDelegation();
                    }
                  }
                  if (e.key === 'Escape') { e.preventDefault(); setNewPersonPopOpen(false); }
                }}/>
              <div className="dvv-new-pop-list">
                {newPersonMatches.length === 0 && !newPersonIsNew && (
                  <div className="dvv-new-pop-empty">No people yet — type a name above</div>
                )}
                {newPersonMatches.map(p => (
                  <button key={p.name}
                    className="dvv-new-pop-row"
                    role="option"
                    aria-selected={false}
                    onClick={() => { setNewPerson(p.name); setNewPersonPopOpen(false); newTitleRef.current?.focus(); }}>
                    <span className="dvv-new-pop-av">{p.name.charAt(0).toUpperCase()}</span>
                    <span className="dvv-new-pop-name">{p.name}</span>
                    <span className="dvv-new-pop-ct">{p.count}</span>
                  </button>
                ))}
                {newPersonIsNew && (
                  <button className="dvv-new-pop-row is-new"
                    onClick={() => { setNewPersonPopOpen(false); newTitleRef.current?.focus(); }}>
                    <span className="dvv-new-pop-av new">+</span>
                    <span className="dvv-new-pop-name">Use "<b>{newPerson.trim()}</b>"</span>
                    <span className="dvv-new-pop-ct"><kbd>↵</kbd></span>
                  </button>
                )}
              </div>
            </div>
          )}
        </span>
        <button
          type="button"
          className="dvv-new-send"
          disabled={!newTitle.trim()}
          data-tooltip="Create the delegation"
          onClick={submitNewDelegation}>
          Delegate
        </button>
      </div>

      <div className={`dvv-pane${mobileShowDetail ? ' is-mobile-detail' : ' is-mobile-inbox'}`}>

        {/* ===== LEFT RAIL ===== */}
        <aside className="dvv-left">

          {/* Date / week */}
          <div className="dvv-dp">
            <div className="dvv-dp-h">
              <div className="dvv-dp-title">
                {D.today().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
                <small>this week · {counts.all} active{counts.overdue ? ` · ${counts.overdue} overdue` : ''}</small>
              </div>
              <button className="dvv-nav-btn" data-tooltip="Previous week"
                onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d); }}>
                <I.Chv d="l"/>
              </button>
              <button className="dvv-nav-btn dvv-nav-today" data-tooltip="Jump to this week"
                onClick={() => setWeekStart(startOfWeek(D.today()))}>Today</button>
              <button className="dvv-nav-btn" data-tooltip="Next week"
                onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d); }}>
                <I.Chv d="r"/>
              </button>
            </div>
            <div className="dvv-dp-week">
              {weekDays.map(d => {
                const isSelected = dayFilter === d.ds;
                const hasEvents = d.events.length > 0;
                return (
                  <button
                    key={d.ds}
                    type="button"
                    className={`dvv-day${d.isToday?' is-today':''}${isSelected?' is-selected':''}${hasEvents?' is-clickable':''}`}
                    aria-pressed={isSelected}
                    aria-label={`${d.dow} ${d.num}, ${d.events.length} event${d.events.length===1?'':'s'}`}
                    onClick={hasEvents ? () => onDayFilterChange?.(isSelected ? null : d.ds) : undefined}>
                    <div className="dvv-day-dow">{d.dow}</div>
                    <div className="dvv-day-num">{d.num}</div>
                    <div className="dvv-day-dots">
                      {d.dots.map((kind, i) => (
                        <span key={i} className={`dvv-day-dot ${kind}`}/>
                      ))}
                    </div>
                    {hasEvents && (
                      <div className="dvv-day-tip" role="tooltip">
                        <div className="dvv-day-tip-h">
                          {d.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
                          <small>· {d.events.length} event{d.events.length===1?'':'s'}</small>
                        </div>
                        {d.events.slice(0, 6).map((ev, i) => (
                          <div key={i} className="dvv-day-tip-row">
                            <span className={`dvv-day-tip-ico ${ev.kind}`}/>
                            <span className="dvv-day-tip-title">{ev.title}</span>
                            <small className="dvv-day-tip-person">{ev.person}</small>
                          </div>
                        ))}
                        {d.events.length > 6 && (
                          <div className="dvv-day-tip-more">+{d.events.length - 6} more</div>
                        )}
                        <div className="dvv-day-tip-cta">
                          {isSelected ? 'Click to clear filter' : 'Click to filter inbox'}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="dvv-dp-legend">
              <span><span className="dvv-dp-legend-dot chase"/>Nudge due</span>
              <span><span className="dvv-dp-legend-dot heard"/>Heard back</span>
              <span><span className="dvv-dp-legend-dot overdue"/>Overdue</span>
              <span><span className="dvv-dp-legend-dot reminder"/>Reminder</span>
            </div>
          </div>

          {/* Filter chips — status */}
          <div className="dvv-fchip-row">
            {STATUS_FILTERS.map(f => (
              <button key={f.id}
                className={`dvv-fchip${statusF === f.id ? ' on' : ''}`}
                onClick={() => onStatusFilterChange?.(f.id)}
                data-tooltip={
                  f.id === 'all' ? 'Show all delegations' :
                  f.id === 'overdue' ? 'Promise date has passed without hearing back' :
                  f.id === 'waiting' ? 'Awaiting reply, not yet overdue' :
                  f.id === 'heard' ? 'They got back to you' :
                  'No activity for ~2× cadence'
                }>
                {f.label} <span className="dvv-fchip-ct">{counts[f.id]}</span>
              </button>
            ))}
          </div>

          {/* Filter chips — dropdowns */}
          <div className="dvv-fchip-row">
            <div className="dvv-dropdown-wrap" ref={personPopRef}>
              <button className={`dvv-fchip dvv-fchip-drop${personF.length?' on':''}`}
                onClick={() => setPersonPopOpen(v => !v)}
                data-tooltip="Filter by person — multi-select">
                <I.User/>
                Person{personF.length ? ` · ${personF.length}` : ''}
                <I.ChevDown/>
              </button>
              {personPopOpen && (
                <div className="dvv-filt-menu">
                  {allPeople.length > 6 && (
                    <div className="dvv-filt-search">
                      <I.Search/>
                      <input
                        autoFocus
                        placeholder="Search people…"
                        value={personSearch}
                        onChange={e => setPersonSearch(e.target.value)}
                        aria-label="Search people"
                      />
                    </div>
                  )}
                  {visiblePeople.length === 0 && <div className="dvv-filt-empty">{allPeople.length ? 'No matches' : 'No people yet'}</div>}
                  {visiblePeople.map(p => {
                    const on = personF.includes(p.name);
                    return (
                      <div key={p.name}
                        className={`dvv-filt-row${on?' on':''}`}
                        onClick={() => {
                          const next = on ? personF.filter(n => n !== p.name) : [...personF, p.name];
                          onPersonFilterChange?.(next);
                        }}>
                        <span className="dvv-filt-cb">{on && <I.Check/>}</span>
                        {p.name}
                        <span className="dvv-filt-ct">{p.count}</span>
                      </div>
                    );
                  })}
                  {personF.length > 0 && (
                    <>
                      <div className="dvv-filt-sep"/>
                      <button className="dvv-filt-clear"
                        onClick={() => onPersonFilterChange?.([])}>
                        Clear person filter
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Applied filters */}
          {(statusF !== 'all' || personF.length > 0 || dayFilter) && (
            <div className="dvv-applied">
              <span className="dvv-applied-lbl">Showing</span>
              {dayFilter && (
                <span className="dvv-applied-pill">
                  Events on {(() => {
                    const dt = new Date(dayFilter + 'T00:00:00');
                    return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
                  })()}
                  <button data-tooltip="Remove day filter"
                    onClick={() => onDayFilterChange?.(null)}><I.X/></button>
                </span>
              )}
              {statusF !== 'all' && (
                <span className="dvv-applied-pill">
                  {STATUS_FILTERS.find(f => f.id === statusF)?.label}
                  <button data-tooltip="Remove status filter"
                    onClick={() => onStatusFilterChange?.('all')}><I.X/></button>
                </span>
              )}
              {personF.map(name => (
                <span key={name} className="dvv-applied-pill">
                  {name}
                  <button data-tooltip={`Remove ${name}`}
                    onClick={() => onPersonFilterChange?.(personF.filter(n => n !== name))}><I.X/></button>
                </span>
              ))}
              <button className="dvv-applied-clear"
                data-tooltip="Clear all filters"
                onClick={() => { onStatusFilterChange?.('all'); onPersonFilterChange?.([]); onDayFilterChange?.(null); }}>
                Clear all
              </button>
            </div>
          )}

          {/* Sectioned inbox */}
          <div className="dvv-inbox">
            {[
              { id: 'overdue', label: 'Overdue' },
              { id: 'waiting', label: 'Waiting' },
              { id: 'heard',   label: 'Heard back' },
              { id: 'stale',   label: 'Stale' },
            ].map(sec => {
              const items = grouped[sec.id];
              if (!items.length) return null;
              return (
                <div key={sec.id}>
                  <div className="dvv-inbox-h">
                    {sec.label}<span className="dvv-inbox-ct">{items.length}</span>
                  </div>
                  {items.map(t => {
                    const note = lastNoteFor(t);
                    return (
                      <div key={t.id}
                        className={`dvv-item${selected && t.id === selected.id ? ' sel' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Delegation: ${t.title} — ${t.delegatedTo}, ${ageDays(t.delegatedAt)} days ago`}
                        onClick={() => { onSelectId?.(t.id); setMobileShowDetail(true); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectId?.(t.id);
                            setMobileShowDetail(true);
                          }
                        }}>
                        <span className={`dvv-ii-stripe ${classify(t)}`}/>
                        <div className="dvv-ii-main">
                          <div className="dvv-ii-title">{t.title}</div>
                          {note ? (
                            <div className="dvv-ii-note">"{note.text}"</div>
                          ) : null}
                        </div>
                        <span className="dvv-ii-meta">{t.delegatedTo} · {ageDays(t.delegatedAt)}d</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="dvv-inbox-empty">
                No delegations match these filters.
              </div>
            )}
          </div>
        </aside>

        {/* ===== RIGHT PANE ===== */}
        <section className="dvv-right">
          {/* Mobile-only: back to the inbox */}
          <button className="dvv-mobile-back" type="button"
            aria-label="Back to delegations list"
            onClick={() => setMobileShowDetail(false)}>
            <I.Chv d="l"/> Back to list
          </button>

          {selected ? (
            <RightPane
              task={selected}
              allTasks={tasks}
              onUpdate={onUpdate}
              onJumpTo={onJumpTo}
              onDelete={onDelete}
              onCheckIn={onCheckIn}
              onChase={onChase}
              onTakeBack={onTakeBack}
              onAddNote={onAddNote}
              onShowOnTimeline={onShowOnTimeline}
              showToast={showToast}
              showConfirm={showConfirm}
              kebabOpen={kebabOpen}
              setKebabOpen={setKebabOpen}
              kebabRef={kebabRef}
              hoverStep={hoverStep}
              setHoverStep={setHoverStep}
              composerRef={composerRef}
              reminderInputRef={reminderInputRef}
            />
          ) : (
            <div className="dvv-pane-empty">
              No delegation selected.
            </div>
          )}
        </section>
      </div>

    </div>
  );
}

// =====================================================================
// RIGHT PANE
// =====================================================================
function RightPane({
  task, allTasks, onUpdate, onJumpTo, onDelete, onCheckIn,
  onChase, onTakeBack, onAddNote,
  onShowOnTimeline, showToast, showConfirm,
  kebabOpen, setKebabOpen, kebabRef,
  hoverStep, setHoverStep,
  composerRef, reminderInputRef,
}) {
  const chip = statusChip(task);
  const days = ageDays(task.delegatedAt) || 0;

  // Cadence-edit popover state. Custom input mirrors the current schedule
  // when the popover opens; commit on Enter or preset click.
  const [cadenceOpen, setCadenceOpen] = useState(false);
  const cadenceRef = useRef(null);
  const [customCadence, setCustomCadence] = useState('');
  const currentScheduleStr = (task.checkInSchedule || []).join(', ');
  useEffect(() => {
    if (cadenceOpen) setCustomCadence(currentScheduleStr);
  }, [cadenceOpen, currentScheduleStr]);
  useEffect(() => {
    if (!cadenceOpen) return;
    const onDown = (e) => {
      if (cadenceRef.current && !cadenceRef.current.contains(e.target)) setCadenceOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [cadenceOpen]);

  const commitCadence = (next) => {
    // Validate, sort, dedupe.
    const arr = (Array.isArray(next) ? next : [])
      .map(n => Math.round(Number(n)))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 60);
    const uniq = [...new Set(arr)].sort((a, b) => a - b);
    if (!uniq.length) return;
    if (uniq.join(',') === (task.checkInSchedule || []).join(',')) {
      setCadenceOpen(false);
      return;
    }
    onUpdate?.(task.id, { checkInSchedule: uniq });
    setCadenceOpen(false);
    showToast?.(`Cadence updated to ${uniq.join('·')}d`, { undoable: true, timeout: 3500 });
  };
  const commitCustom = () => {
    const parsed = customCadence.split(/[\s,]+/).filter(Boolean).map(s => Number(s));
    commitCadence(parsed);
  };
  const activePreset = matchPreset(task.checkInSchedule);

  // Cadence dots — derived from schedule. If there's an expiryDate (Promised by),
  // its position becomes the final node on the strip, rendered in red.
  const cadenceDots = useMemo(() => {
    const schedule = Array.isArray(task.checkInSchedule) ? task.checkInSchedule : [];
    // Compute due-day offset (days from delegation to expiry).
    let dueDay = null;
    if (task.expiryDate && task.delegatedAt) {
      // Use local calendar midnight for both ends so the day count is purely
      // calendar-based and doesn't drift for UTC+ users whose delegatedAt
      // timestamp falls before local midnight in UTC.
      const d = new Date(task.delegatedAt);
      const delegated = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const due = new Date(task.expiryDate + 'T00:00:00');
      dueDay = Math.max(0, Math.round((due.getTime() - delegated.getTime()) / 86400000));
    }
    const maxDay = Math.max(schedule[schedule.length - 1] || 7, days, dueDay || 0, 1);
    const dots = [];
    // d0 dot (delegated)
    dots.push({ key: 'd0', pos: 0, day: 0, kind: 'delegated', label: 'Delegated' });
    // Cadence offsets that *haven't fired yet* get a dashed "pending" dot,
    // muted but visible — so a fresh delegation still reads as a timeline
    // (otherwise the whole strip is just a single Delegated dot). Offsets
    // with a matching event upgrade to chased/heard.
    schedule.forEach(off => {
      const matchingEv = (task.activity || []).find(a => a.day === off && (a.type === 'nudge-sent' || a.type === 'heard-back'));
      const pos = (off / maxDay) * 100;
      const kind = matchingEv?.type === 'heard-back' ? 'heard'
                 : matchingEv?.type === 'nudge-sent' ? 'chased'
                 : (off > days ? 'pending' : 'missed');
      dots.push({ key: `d${off}`, pos, day: off, kind, label: `Day ${off}` });
    });
    // Also include any manual nudges / heard-backs whose day offset isn't
    // part of the schedule (ad-hoc events).
    (task.activity || []).forEach((ev, idx) => {
      if (ev.type !== 'chased' && ev.type !== 'heard-back') return;
      if (ev.day == null) return;
      if (schedule.includes(ev.day)) return; // already drawn above
      const pos = (ev.day / maxDay) * 100;
      const kind = ev.type === 'heard-back' ? 'heard' : 'chased';
      dots.push({ key: `ev-${idx}-d${ev.day}`, pos, day: ev.day, kind, label: `Day ${ev.day}` });
    });
    // Due-date dot (red) — placed at the deadline, becomes the visual endpoint.
    if (dueDay != null) {
      const duePos = Math.min(100, (dueDay / maxDay) * 100);
      // If a cadence dot lives at the same offset, replace its kind so the
      // single dot reads as the deadline (more important than a check-in).
      const existing = dots.find(d => d.day === dueDay && d.key !== 'd0');
      if (existing) {
        existing.kind = 'due';
        existing.label = `Due (Day ${dueDay})`;
        existing.key = 'due';
      } else {
        dots.push({ key: 'due', pos: duePos, day: dueDay, kind: 'due', label: `Due (Day ${dueDay})` });
      }
    }
    // "now" dot — carries today's day-offset so the label can read "Day N"
    // matching the rest of the strip. Suppressed only when colliding with
    // an existing cadence/due dot (within ~3% of the line).
    const nowPos = Math.min(100, (days / maxDay) * 100);
    const collides = dots.some(d => Math.abs(d.pos - nowPos) < 3);
    if (!collides) {
      dots.push({ key: 'now', pos: nowPos, day: days, kind: 'now', label: `Now · Day ${days}` });
    }
    return { dots, maxDay, progressPct: nowPos };
  }, [task, days]);

  return (
    <>
      {/* Header */}
      <div className="dvv-pr-hd">
        <div className="dvv-pr-title">{task.title}</div>
        <div className="dvv-pr-actions">
          <button className="dvv-iconbtn" data-tooltip="Open in drawer for full edit"
            data-tt-pos="below" aria-label="Edit in drawer"
            onClick={() => onJumpTo?.(task.id, null)}>
            <I.Pencil/>
          </button>
          <div className="dvv-kebab-wrap" ref={kebabRef}>
            <button className={`dvv-iconbtn${kebabOpen?' active':''}`}
              data-tooltip="More actions"
              data-tt-pos="below"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={kebabOpen}
              onClick={() => setKebabOpen(v => !v)}>
              <I.Dots3/>
            </button>
            {kebabOpen && (
              <div className="dvv-km" role="menu" aria-label="More actions">
                <div className="dvv-km-item" role="menuitem" tabIndex={0}
                  onClick={() => { onTakeBack?.(task.id); setKebabOpen(false); showToast?.('Took back to today', { undoable: true }); }}>
                  <I.Undo/><span>Take back to today</span><span className="dvv-km-kbd">T</span>
                </div>
                <div className="dvv-km-item" role="menuitem" tabIndex={0}
                  onClick={() => { onJumpTo?.(task.id, 'date'); setKebabOpen(false); }}>
                  <I.Clock/><span>Snooze for…</span><span className="dvv-km-kbd">S</span>
                </div>
                <div className="dvv-km-item" role="menuitem" tabIndex={0}
                  onClick={() => { onJumpTo?.(task.id, 'delegation'); setKebabOpen(false); }}>
                  <I.User/><span>Re-delegate to…</span>
                </div>
                <div className="dvv-km-item" role="menuitem" tabIndex={0}
                  onClick={() => {
                    const text = `Hey ${task.delegatedTo}, quick check on "${task.title}" — still on track?`;
                    navigator.clipboard?.writeText(text);
                    setKebabOpen(false);
                    showToast?.('Quick-nudge copied to clipboard', { timeout: 2500 });
                  }}>
                  <I.Clipboard/><span>Copy quick-nudge</span><span className="dvv-km-kbd">⇧C</span>
                </div>
                <div className="dvv-km-sep"/>
                <div className="dvv-km-item" role="menuitem" tabIndex={0}
                  onClick={() => {
                    setKebabOpen(false);
                    setTimeout(() => {
                      reminderInputRef?.current?.focus();
                      reminderInputRef?.current?.showPicker?.();
                    }, 50);
                  }}>
                  <I.Bell/><span>Set personal reminder…</span><span className="dvv-km-kbd">R</span>
                </div>
                <div className="dvv-km-item" role="menuitem" tabIndex={0}
                  onClick={() => { onShowOnTimeline?.(); setKebabOpen(false); showToast?.('Showing delegations on timeline', { timeout: 2500 }); }}>
                  <I.Cal/><span>Show on timeline</span>
                </div>
                <div className="dvv-km-sep"/>
                <div className="dvv-km-item danger" role="menuitem" tabIndex={0}
                  onClick={() => { onDelete?.(task.id); setKebabOpen(false); showToast?.('Delegation deleted', { undoable: true }); }}>
                  <I.Trash/><span>Delete delegation</span><span className="dvv-km-kbd">⌫</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="dvv-pr-meta">
        <span className={`dvv-schip ${chip.cls}`}>{chip.label}</span>
        <span>to <b>{task.delegatedTo}</b></span>
        {task.project && <><span>·</span><span>{task.project}</span></>}
        <span>·</span>
        <span>started {fmtAgo(task.delegatedAt) || 'recently'}</span>
        {task.expiryDate && (() => {
          const dueDate = new Date(task.expiryDate + 'T00:00:00');
          const overdue = task.expiryDate < D.str(D.today());
          return (
            <span className={`dvv-pr-due${overdue?' is-overdue':''}`}
              data-tooltip={overdue ? 'Promise date has passed' : 'Promised by this date'}
              data-tt-pos="below">
              <I.Cal/>
              <b>DUE</b>
              <span>{dueDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase()}</span>
            </span>
          );
        })()}
      </div>

      {/* Promise + personal-reminder dates */}
      <div className="dvv-pr-dates">
        <div className="dvv-pr-date-field" data-tooltip="What they said by — surfaces the card if the date slips" data-tt-pos="below">
          <I.Cal/>
          <label>Promised by</label>
          <input
            type="date"
            value={task.expiryDate || ''}
            onChange={e => onUpdate?.(task.id, { expiryDate: e.target.value || null })}
          />
          {task.expiryDate && (
            <button className="clear-x" data-tooltip="Clear promise date"
              onClick={() => onUpdate?.(task.id, { expiryDate: null })}>
              <I.X/>
            </button>
          )}
        </div>
        <div className="dvv-pr-date-field" data-tooltip="Your own follow-up reminder. Surfaces the card in your inbox on this date." data-tt-pos="below">
          <I.Bell/>
          <label>Remind me</label>
          <input
            ref={reminderInputRef}
            type="date"
            value={task.personalReminderDate || ''}
            onChange={e => onUpdate?.(task.id, { personalReminderDate: e.target.value || null })}
          />
          {task.personalReminderDate && (
            <button className="clear-x" data-tooltip="Clear personal reminder"
              onClick={() => onUpdate?.(task.id, { personalReminderDate: null })}>
              <I.X/>
            </button>
          )}
        </div>
      </div>

      {/* Cadence — always visible when delegated so the user can edit the
          schedule even if no events have fired yet. */}
      {task.delegatedTo && (
        <div className={`dvv-cad${cadenceOpen?' is-pop-open':''}`}>
          <div className="dvv-cad-lbl">
            <span>Cadence</span>
            <span className="dvv-cad-edit-wrap" ref={cadenceRef}>
              <button
                className={`dvv-cad-pill${cadenceOpen?' open':''}`}
                aria-haspopup="menu"
                aria-expanded={cadenceOpen}
                data-tooltip="Click to change the check-in cadence"
                onClick={() => setCadenceOpen(v => !v)}>
                {(task.checkInSchedule||[]).join(' · ')}d schedule
                <span className="dvv-cad-pill-caret"><I.ChevDown/></span>
              </button>
              {cadenceOpen && (
                <div className="dvv-cad-pop" role="menu" aria-label="Cadence preset">
                  <div className="dvv-cad-pop-h">Cadence preset</div>
                  {Object.keys(CHECKIN_PRESETS).map(k => (
                    <button key={k}
                      className={`dvv-cad-pop-row${activePreset === k ? ' on' : ''}`}
                      role="menuitem"
                      onClick={() => commitCadence(CHECKIN_PRESETS[k].slice())}>
                      <span>{CHECKIN_PRESET_LABELS[k].replace(/\s+\d.*$/, '')}</span>
                      <span className="dvv-cad-pop-vals">{CHECKIN_PRESETS[k].join('·')}d</span>
                    </button>
                  ))}
                  <div className="dvv-cad-pop-sep"/>
                  <div className="dvv-cad-pop-custom">
                    <label>Custom</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={customCadence}
                      onChange={e => setCustomCadence(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitCustom(); }
                        if (e.key === 'Escape') { e.preventDefault(); setCadenceOpen(false); }
                      }}
                      placeholder="e.g. 2, 5, 10"
                      aria-label="Custom cadence days"/>
                    <span className="dvv-cad-pop-unit">d</span>
                  </div>
                  <div className="dvv-cad-pop-hint">Comma-separated days. <kbd>↵</kbd> to save.</div>
                </div>
              )}
            </span>
            <small>hover any dot to highlight the matching log entry</small>
          </div>
          <div className="dvv-cad-line">
            <div className="dvv-cad-progress" style={{ width: `${cadenceDots.progressPct}%` }}/>
            {cadenceDots.dots.map(dot => (
              <React.Fragment key={dot.key}>
                <div
                  className={`dvv-cad-dot ${dot.kind}${hoverStep === dot.key ? ' is-linked' : ''}`}
                  style={{ left: `${dot.pos}%` }}
                  onMouseEnter={() => setHoverStep(dot.key)}
                  onMouseLeave={() => setHoverStep(null)}>
                  <span className="dvv-cad-tip">{dot.label}</span>
                </div>
                {dot.key === 'now' ? (
                  <>
                    <span className={`dvv-cad-daylbl is-now-above${hoverStep === dot.key ? ' is-linked' : ''}`}
                      style={{ left: `${dot.pos}%` }}
                      onMouseEnter={() => setHoverStep(dot.key)}
                      onMouseLeave={() => setHoverStep(null)}>Now</span>
                    <span className={`dvv-cad-daylbl is-now-below${hoverStep === dot.key ? ' is-linked' : ''}`}
                      style={{ left: `${dot.pos}%` }}
                      onMouseEnter={() => setHoverStep(dot.key)}
                      onMouseLeave={() => setHoverStep(null)}>Day {dot.day}</span>
                  </>
                ) : (
                  <span className={`dvv-cad-daylbl${hoverStep === dot.key ? ' is-linked' : ''}`}
                    style={{ left: `${dot.pos}%` }}
                    onMouseEnter={() => setHoverStep(dot.key)}
                    onMouseLeave={() => setHoverStep(null)}>
                    {dot.key === 'due' ? 'Due' : `Day ${dot.day}`}
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Activity log + composer — shared component so the drawer stays in sync */}
      <ActivityLog
        task={task}
        allTasks={allTasks}
        onUpdate={onUpdate}
        onChase={onChase}
        onAddNote={onAddNote}
        onCheckIn={onCheckIn}
        onTakeBack={onTakeBack}
        showToast={showToast}
        showConfirm={showConfirm}
        hoverStep={hoverStep}
        setHoverStep={setHoverStep}
        composerRef={composerRef}
        variant="full"
      />
    </>
  );
}

export { DelegationsView };
