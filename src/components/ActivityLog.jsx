import React, { useState, useEffect, useMemo, useRef } from 'react';
import { I } from '../utils/icons.jsx';

// Shared ActivityLog — used in the Delegations view's right pane AND inside
// the task drawer. Renders the activity timeline (oldest → newest), supports
// hover-revealed edit/delete on user-typed entries (notes + chases-with-text),
// and an inline "Add note" composer pinned at the bottom.
//
// Designed to stay in sync between surfaces: any field/behavior added here
// shows up everywhere the log is rendered.

// === Helpers (exported so callers can reuse) ===

export function fmtAgo(iso) {
  if (!iso) return '';
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

export function lastNoteFor(task) {
  const evs = Array.isArray(task?.activity) ? task.activity : [];
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if ((e.type === 'note' || e.type === 'chased') && e.text) return e;
  }
  return null;
}

// Map an activity event → display label + dot kind + day-offset.
export function describeActivity(ev, parent) {
  if (!ev) return null;
  const day = ev.day ?? null;
  switch (ev.type) {
    case 'delegated':
      return { kind: 'delegated', day: 0, label: <><b>Delegated to {ev.to || parent?.delegatedTo}</b> — the original handoff</> };
    case 're-delegated':
      return { kind: 'delegated', day: 0, label: <><b>Re-delegated</b> from {ev.from} to {ev.to}</> };
    case 'nudge-sent':
      return { kind: 'chased', day, label: <>Chased <small style={{opacity:0.7}}>(day {day})</small></> };
    case 'chased':
      return {
        kind: 'chased', day,
        editable: !!ev.text,
        label: ev.text ? <><b>Chased</b> — "{ev.text}"</> : <>Chased outside the app</>,
      };
    case 'heard-back':
      return { kind: 'heard', day, label: <><b>Heard back</b> <small style={{opacity:0.7}}>(day {day})</small></> };
    case 'note':
      return { kind: 'note', day, editable: true, label: <>{ev.text || <em>note</em>}</> };
    case 'cadence-changed':
      return { kind: 'meta', day: null, label: <>Cadence updated to <code>{Array.isArray(ev.schedule) ? ev.schedule.join('/') : '?'}</code></> };
    case 'cadence-stretched':
      return { kind: 'meta', day: null, label: <>Cadence stretched ×{ev.factor || '1.5'}</> };
    case 'reclaimed':
      return { kind: 'meta', day: null, label: <>Taken back to your list</> };
    case 'created':
      return null;
    default:
      return { kind: 'meta', day: null, label: <>{ev.type}</> };
  }
}

// === Component ===

export function ActivityLog({
  task,
  allTasks,
  onUpdate,
  onChase,
  onAddNote,
  onCheckIn,
  showToast,
  // Optional hover-link integration (cadence ↔ log). When provided, log rows
  // toggle the linked state on the matching cadence dot via these callbacks.
  hoverStep,
  setHoverStep,
  // Optional: external ref forwarding so callers can keyboard-focus the composer.
  composerRef: externalComposerRef,
  // Display mode: 'full' shows composer; 'compact' shows just log entries.
  variant = 'full',
}) {
  const internalComposerRef = useRef(null);
  const composerRef = externalComposerRef || internalComposerRef;
  const [composerText, setComposerText] = useState('');
  const [editingIdx, setEditingIdx] = useState(null);
  const [editingText, setEditingText] = useState('');

  // Reset local state when switching tasks.
  useEffect(() => {
    setEditingIdx(null);
    setEditingText('');
    setComposerText('');
  }, [task?.id]);

  // Activity log entries — oldest first, skipping system 'created' marker.
  const logEntries = useMemo(() => {
    const evs = Array.isArray(task?.activity) ? task.activity : [];
    const out = [];
    evs.forEach((ev, idx) => {
      const desc = describeActivity(ev, task);
      if (!desc) return;
      const stepKey = desc.day === 0 ? 'd0' : (desc.day != null ? `d${desc.day}` : `meta-${idx}`);
      out.push({ ...desc, at: ev.at, idx, stepKey });
    });
    out.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
    return out;
  }, [task]);

  // Cool-down: any contact in the last 24h disables the Chased button.
  const cooldown = useMemo(() => {
    if (!task) return false;
    const lc = task.lastContactAt ? new Date(task.lastContactAt).getTime() : 0;
    const lastAction = (task.activity || [])
      .filter(a => a.type === 'chased' || a.type === 'nudge-sent')
      .reduce((m, a) => Math.max(m, new Date(a.at || 0).getTime()), 0);
    const recent = Math.max(lc, lastAction);
    return recent && (Date.now() - recent) < 86400000;
  }, [task]);

  // Default action handlers (composed from onUpdate when caller didn't pass dedicated ones).
  const defaultAddNote = (id, text) => {
    if (!task || !text || !text.trim()) return;
    const activity = [...(task.activity || []), { type: 'note', text: text.trim(), at: new Date().toISOString() }];
    onUpdate?.(id, { activity });
  };
  const defaultChase = (id, text) => {
    const now = new Date().toISOString();
    const activity = [...(task.activity || []), { type: 'chased', text: (text || '').trim() || undefined, at: now }];
    onUpdate?.(id, { lastContactAt: now, activity });
  };
  const addNote = onAddNote || defaultAddNote;
  const chase = onChase || defaultChase;

  // Edit/delete entry handlers.
  const beginEdit = (entry) => {
    const original = task?.activity?.[entry.idx];
    setEditingIdx(entry.idx);
    setEditingText(original?.text || '');
  };
  const saveEdit = () => {
    if (editingIdx == null) return;
    const next = (task.activity || []).map((ev, i) =>
      i === editingIdx ? { ...ev, text: editingText.trim() || ev.text } : ev
    );
    onUpdate?.(task.id, { activity: next });
    setEditingIdx(null);
    setEditingText('');
  };
  const cancelEdit = () => { setEditingIdx(null); setEditingText(''); };
  const deleteEntry = (entry) => {
    if (!window.confirm('Delete this activity entry? This can’t be undone.')) return;
    const next = (task.activity || []).filter((_, i) => i !== entry.idx);
    onUpdate?.(task.id, { activity: next });
  };

  if (!task) return null;

  return (
    <>
      <div className="dvv-log-hd">
        Activity
        <small>oldest to newest · {logEntries.length} entr{logEntries.length === 1 ? 'y' : 'ies'}</small>
      </div>
      <div className="dvv-log">
        {logEntries.length === 0 && (
          <div className="dvv-log-empty">No activity yet{variant === 'full' ? '. Add a note below.' : ''}</div>
        )}
        {logEntries.map(entry => {
          if (editingIdx === entry.idx) {
            return (
              <div key={entry.idx} className="dvv-log-row editing">
                <span className={`dvv-log-dot ${entry.kind}`}/>
                <input
                  className="dvv-log-edit-input"
                  autoFocus
                  value={editingText}
                  onChange={e => setEditingText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
                    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                  }}
                  onBlur={saveEdit}
                  aria-label="Edit entry text"
                />
                <button className="dvv-log-acn-btn" data-tooltip="Save (↵)"
                  aria-label="Save edit"
                  onMouseDown={e => { e.preventDefault(); saveEdit(); }}><I.Check/></button>
                <button className="dvv-log-acn-btn" data-tooltip="Cancel (Esc)"
                  aria-label="Cancel edit"
                  onMouseDown={e => { e.preventDefault(); cancelEdit(); }}><I.X/></button>
              </div>
            );
          }
          const linkable = !!setHoverStep;
          return (
            <div key={entry.idx}
              className={`dvv-log-row${hoverStep === entry.stepKey ? ' is-linked' : ''}`}
              onMouseEnter={linkable ? () => setHoverStep(entry.stepKey) : undefined}
              onMouseLeave={linkable ? () => setHoverStep(null) : undefined}>
              <span className={`dvv-log-dot ${entry.kind}`}/>
              <div className="dvv-log-body">
                {entry.day != null && <span className="dvv-log-badge">d{entry.day}</span>}
                {entry.label}
              </div>
              <span className="dvv-log-time">{fmtAgo(entry.at)}</span>
              {entry.editable && (
                <span className="dvv-log-actions">
                  <button className="dvv-log-acn-btn" data-tooltip="Edit this entry"
                    aria-label="Edit entry"
                    onClick={(e) => { e.stopPropagation(); beginEdit(entry); }}>
                    <I.Pencil/>
                  </button>
                  <button className="dvv-log-acn-btn danger" data-tooltip="Delete this entry"
                    aria-label="Delete entry"
                    onClick={(e) => { e.stopPropagation(); deleteEntry(entry); }}>
                    <I.Trash/>
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {variant === 'full' && (
        <div className="dvv-composer">
          <div className="dvv-cmp-hd">
            <span className="dvv-cmp-label">Add note</span>
            <span className="dvv-cmp-help" data-tooltip="Notes capture what happened — what they said, when you chased, anything contextual. The latest note becomes the card's subtitle."
              data-tt-pos="below"><I.Info/></span>
          </div>
          <div className="dvv-cmp-instr">Log what they said, when you nudged, or anything that should be remembered.</div>
          <textarea
            ref={composerRef}
            className="dvv-cmp-input"
            rows={2}
            placeholder={`e.g. "${task.delegatedTo || 'they'} confirmed Friday is realistic" — or just "Pinged on Slack"`}
            value={composerText}
            onChange={e => setComposerText(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                const text = composerText.trim();
                if (!text) return;
                addNote(task.id, text);
                setComposerText('');
                showToast?.('Note added', { undoable: true, timeout: 2500 });
              }
            }}
          />
          <div className="dvv-cmp-bar">
            <button className="dvv-cmp-btn success"
              data-tooltip="Save the note (if any) and mark this delegation as heard back"
              aria-label="Mark as heard back"
              onClick={() => {
                const text = composerText.trim();
                const pendingCheckIn = (task.checkInTaskIds || [])
                  .map(cid => (allTasks || []).find(t => t.id === cid))
                  .find(t => t && !t.done);
                if (text) addNote(task.id, text);
                if (pendingCheckIn) onCheckIn?.(pendingCheckIn.id, 'heard-back');
                else onUpdate?.(task.id, { delegationStatus: 'heard-back', lastContactAt: new Date().toISOString() });
                setComposerText('');
                showToast?.(`Marked heard back${task.delegatedTo ? ' from ' + task.delegatedTo : ''}`, { undoable: true, timeout: 3500 });
              }}>
              <I.Check/> Heard back
            </button>
            {cooldown ? (
              <span className="dvv-cmp-cooldown" data-tooltip="You chased them in the last 24h — give it a beat"
                data-tt-pos="below">
                <I.Clock/> Chased recently
              </span>
            ) : (
              <button className="dvv-cmp-btn warning"
                data-tooltip="Log a chase (Slack/email/in person). Updates last-contact without spawning a new check-in."
                aria-label="Log a chase"
                onClick={() => {
                  const text = composerText.trim();
                  chase(task.id, text);
                  setComposerText('');
                  showToast?.(`Logged chase${task.delegatedTo ? ' to ' + task.delegatedTo : ''}`, { undoable: true, timeout: 3500 });
                }}>
                <I.Flag/> Chased
              </button>
            )}
            <span className="dvv-cmp-spacer"/>
            <button className="dvv-cmp-send"
              data-tooltip="Save the note to the activity log (⌘↵)"
              aria-label="Save note"
              disabled={!composerText.trim()}
              onClick={() => {
                const text = composerText.trim();
                if (!text) return;
                addNote(task.id, text);
                setComposerText('');
                showToast?.('Note added', { undoable: true, timeout: 2500 });
              }}>
              <I.Send/> Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}
