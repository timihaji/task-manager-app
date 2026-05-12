import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  D, isStale, peopleRollup, personKey,
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
  onShowOnTimeline,
  showToast,
  statusFilter, onStatusFilterChange,
  personFilter, onPersonFilterChange,
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
    // Sort by most overdue / most stale first.
    return list.slice().sort((a, b) => {
      const sa = ageDays(a.lastContactAt || a.delegatedAt) || 0;
      const sb = ageDays(b.lastContactAt || b.delegatedAt) || 0;
      return sb - sa;
    });
  }, [allDelegated, search, statusF, personF]);

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
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [personPopOpen, kebabOpen]);

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
        onJumpTo?.(selected.id); // delegate to drawer's snooze picker
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

  // Week-strip day data.
  const weekDays = useMemo(() => {
    const out = [];
    const todayStr = D.str(D.today());
    for (let i = 0; i < 7; i++) {
      const dt = new Date(weekStart); dt.setDate(weekStart.getDate() + i);
      const ds = D.str(dt);
      // Mark a day if any delegation has an expiry or pending check-in landing on it.
      const dots = [];
      allDelegated.forEach(t => {
        if (t.expiryDate === ds) dots.push(ds < todayStr ? 'danger' : 'warn');
        (t.checkInTaskIds || []).forEach(cid => {
          const ci = (tasks||[]).find(x => x.id === cid);
          if (ci && !ci.done && ci.date === ds) dots.push('warn');
        });
      });
      out.push({
        date: dt,
        ds,
        dow: dt.toLocaleDateString(undefined, { weekday: 'short' }),
        num: dt.getDate(),
        isToday: ds === todayStr,
        dots: dots.slice(0, 3),
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
      {/* Top toolbar */}
      <div className="dvv-tb">
        <div className="dvv-tb-search">
          <I.Search/>
          <input
            placeholder="Search delegations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          className="dvv-tb-cta"
          onClick={() => onAddDelegation?.()}
          data-tooltip="Delegate a new task — opens the task drawer with Delegation expanded"
        >
          <I.Plus/> Delegate task
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
              {weekDays.map(d => (
                <div key={d.ds} className={`dvv-day${d.isToday?' is-today':''}`}>
                  <div className="dvv-day-dow">{d.dow}</div>
                  <div className="dvv-day-num">{d.num}</div>
                  <div className="dvv-day-dots">
                    {d.dots.map((kind, i) => (
                      <span key={i} className={`dvv-day-dot ${kind}`}/>
                    ))}
                  </div>
                </div>
              ))}
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
          {(statusF !== 'all' || personF.length > 0) && (
            <div className="dvv-applied">
              <span className="dvv-applied-lbl">Showing</span>
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
                onClick={() => { onStatusFilterChange?.('all'); onPersonFilterChange?.([]); }}>
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

      <div className="dvv-kbd-hint">
        <span><kbd>J</kbd><kbd>K</kbd> navigate</span>
        <span><kbd>N</kbd> add note</span>
        <span><kbd>H</kbd> heard back</span>
        <span><kbd>T</kbd> take back</span>
        <span><kbd>S</kbd> snooze</span>
        <span><kbd>R</kbd> set reminder</span>
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
  onShowOnTimeline, showToast,
  kebabOpen, setKebabOpen, kebabRef,
  hoverStep, setHoverStep,
  composerRef, reminderInputRef,
}) {
  const chip = statusChip(task);
  const days = ageDays(task.delegatedAt) || 0;

  // Cadence dots — derived from schedule.
  const cadenceDots = useMemo(() => {
    const schedule = Array.isArray(task.checkInSchedule) ? task.checkInSchedule : [];
    const maxDay = Math.max(schedule[schedule.length - 1] || 7, days, 1);
    const dots = [];
    // d0 dot (delegated)
    dots.push({ key: 'd0', pos: 0, day: 0, kind: 'delegated', label: 'Delegated' });
    schedule.forEach(off => {
      const pos = (off / maxDay) * 100;
      // Figure dot state: did a check-in at this offset fire?
      const matchingEv = (task.activity || []).find(a => a.day === off && (a.type === 'nudge-sent' || a.type === 'heard-back'));
      const kind = matchingEv?.type === 'heard-back' ? 'heard'
                 : matchingEv?.type === 'nudge-sent' ? 'chased' : 'pending';
      dots.push({ key: `d${off}`, pos, day: off, kind, label: `d${off}` });
    });
    // "now" dot
    const nowPos = Math.min(100, (days / maxDay) * 100);
    dots.push({ key: 'now', pos: nowPos, day: null, kind: 'now', label: 'Now' });
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
            onClick={() => onJumpTo?.(task.id)}>
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
                  onClick={() => { onJumpTo?.(task.id); setKebabOpen(false); }}>
                  <I.Clock/><span>Snooze for…</span><span className="dvv-km-kbd">S</span>
                </div>
                <div className="dvv-km-item" role="menuitem" tabIndex={0}
                  onClick={() => { onJumpTo?.(task.id); setKebabOpen(false); }}>
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

      {/* Cadence */}
      {cadenceDots.dots.length > 1 && (
        <div className="dvv-cad">
          <div className="dvv-cad-lbl">
            Cadence
            <small>
              {(task.checkInSchedule||[]).join(' · ')}d schedule — hover any dot to highlight the matching log entry
            </small>
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
                <span className={`dvv-cad-daylbl${hoverStep === dot.key ? ' is-linked' : ''}`}
                  style={{ left: `${dot.pos}%` }}>
                  {dot.key === 'now' ? 'now' : dot.key}
                </span>
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
        showToast={showToast}
        hoverStep={hoverStep}
        setHoverStep={setHoverStep}
        composerRef={composerRef}
        variant="full"
      />
    </>
  );
}

export { DelegationsView };
