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
// `editField` indicates which field of the underlying event can be edited
// inline (when present). All entries are deletable.
export function describeActivity(ev, parent) {
  if (!ev) return null;
  const day = ev.day ?? null;
  switch (ev.type) {
    case 'delegated':
      return { kind: 'delegated', day: 0, editField: 'to',
        label: <><b>Delegated to {ev.to || parent?.delegatedTo}</b> — the original handoff</> };
    case 're-delegated':
      return { kind: 'delegated', day: 0, editField: 'to',
        label: <><b>Re-delegated</b> from {ev.from} to {ev.to}</> };
    case 'nudge-sent':
      return { kind: 'chased', day, label: <>Nudged</> };
    case 'chased':
      return {
        kind: 'chased', day, editField: 'text',
        label: ev.text ? <><b>Nudged</b> — "{ev.text}"</> : <>Nudged outside the app</>,
      };
    case 'heard-back':
      return { kind: 'heard', day, label: <><b>Heard back</b></> };
    case 'note':
      return { kind: 'note', day, editField: 'text', label: <>{ev.text || <em>note</em>}</> };
    case 'cadence-changed':
    case 'cadence-stretched':
      // Cadence changes are mechanic, not conversation — surfaced inline in
      // the cadence strip, not in the activity log.
      return null;
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
  onTakeBack,
  showToast,
  // App-level confirm dialog. Same shape as App.jsx's confirmDialog state:
  // { message, onConfirm, onCancel, destructive?, confirmLabel? }. Falls
  // back to window.confirm if absent so the component still works in tests
  // and stories without the App context.
  showConfirm,
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

  // Cool-down: a nudge (manual or system) or any logged contact in the last
  // 24h disables the manual nudge button. Returning the reason makes it easy
  // for the UI to explain *why* the button is greyed out — Tim found the
  // previous opaque "Chased recently" label confusing.
  const cooldown = useMemo(() => {
    if (!task) return null;
    const lc = task.lastContactAt ? new Date(task.lastContactAt).getTime() : 0;
    const lastNudge = (task.activity || [])
      .filter(a => a.type === 'chased' || a.type === 'nudge-sent')
      .reduce((m, a) => Math.max(m, new Date(a.at || 0).getTime()), 0);
    const lastHeard = (task.activity || [])
      .filter(a => a.type === 'heard-back')
      .reduce((m, a) => Math.max(m, new Date(a.at || 0).getTime()), 0);
    const recent = Math.max(lc, lastNudge, lastHeard);
    if (!recent || (Date.now() - recent) >= 86400000) return null;
    const hours = Math.floor((Date.now() - recent) / 3600000);
    const ago = hours < 1 ? 'less than an hour ago'
              : hours === 1 ? '1h ago'
              : `${hours}h ago`;
    // Decide which event triggered the cooldown (prefer the most recent).
    let kind = 'nudge';
    if (lastHeard >= lastNudge && lastHeard >= lc) kind = 'heard';
    return { ago, kind };
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

  // Edit/delete entry handlers. `editField` on each entry tells us which
  // field of the underlying event to edit (text for notes/chases, `to` for
  // delegated/re-delegated). Entries without an editField can still be deleted.
  const beginEdit = (entry) => {
    const original = task?.activity?.[entry.idx];
    const field = entry.editField;
    if (!field) return;
    setEditingIdx(entry.idx);
    setEditingText(original?.[field] || '');
  };
  const saveEdit = (entry) => {
    if (editingIdx == null) return;
    const field = entry?.editField || 'text';
    const next = (task.activity || []).map((ev, i) =>
      i === editingIdx ? { ...ev, [field]: editingText.trim() || ev[field] } : ev
    );
    onUpdate?.(task.id, { activity: next });
    setEditingIdx(null);
    setEditingText('');
  };
  const cancelEdit = () => { setEditingIdx(null); setEditingText(''); };
  const deleteEntry = (entry) => {
    const doDelete = () => {
      const removed = task.activity?.[entry.idx];
      const next = (task.activity || []).filter((_, i) => i !== entry.idx);
      const patch = { activity: next };
      // If we removed a contact-bearing event (chase, nudge-sent, heard-back),
      // recompute `lastContactAt` so the manual-nudge cooldown lifts.
      // Otherwise deleting the entry would clear it from the log while still
      // gating the button — confusing and what Tim hit when retrying a nudge.
      if (removed && ['chased', 'nudge-sent', 'heard-back'].includes(removed.type)) {
        const remaining = next.filter(a => ['chased', 'nudge-sent', 'heard-back'].includes(a.type));
        if (remaining.length === 0) {
          patch.lastContactAt = null;
        } else {
          const latestMs = remaining.reduce((m, a) => {
            const t = new Date(a.at || 0).getTime();
            return t > m ? t : m;
          }, 0);
          patch.lastContactAt = latestMs ? new Date(latestMs).toISOString() : null;
        }
      }
      onUpdate?.(task.id, patch);
    };
    if (showConfirm) {
      showConfirm({
        message: 'Delete this activity entry? This can’t be undone.',
        destructive: true,
        confirmLabel: 'Delete entry',
        onConfirm: () => { doDelete(); showConfirm(null); },
        onCancel: () => showConfirm(null),
      });
      return;
    }
    if (!window.confirm('Delete this activity entry? This can’t be undone.')) return;
    doDelete();
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
            const placeholder = entry.editField === 'to' ? 'Recipient name' : 'Entry text';
            return (
              <div key={entry.idx} className="dvv-log-row editing">
                <span className={`dvv-log-dot ${entry.kind}`}/>
                <input
                  className="dvv-log-edit-input"
                  autoFocus
                  value={editingText}
                  placeholder={placeholder}
                  onChange={e => setEditingText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); saveEdit(entry); }
                    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                  }}
                  onBlur={() => saveEdit(entry)}
                  aria-label={`Edit entry ${entry.editField === 'to' ? 'recipient' : 'text'}`}
                />
                <button className="dvv-log-acn-btn" data-tooltip="Save (↵)"
                  aria-label="Save edit"
                  onMouseDown={e => { e.preventDefault(); saveEdit(entry); }}><I.Check/></button>
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
                {entry.day != null && <span className="dvv-log-badge">Day {entry.day}</span>}
                {entry.label}
              </div>
              <span className="dvv-log-time">{fmtAgo(entry.at)}</span>
              <span className="dvv-log-actions">
                {entry.editField && (
                  <button className="dvv-log-acn-btn" data-tooltip="Edit this entry"
                    aria-label="Edit entry"
                    onClick={(e) => { e.stopPropagation(); beginEdit(entry); }}>
                    <I.Pencil/>
                  </button>
                )}
                <button className="dvv-log-acn-btn danger" data-tooltip="Delete this entry"
                  aria-label="Delete entry"
                  onClick={(e) => { e.stopPropagation(); deleteEntry(entry); }}>
                  <I.Trash/>
                </button>
              </span>
            </div>
          );
        })}
        {logEntries.length > 0 && (() => {
          const daysIn = task.delegatedAt
            ? Math.max(0, Math.floor((Date.now() - new Date(task.delegatedAt).getTime()) / 86400000))
            : 0;
          const linkable = !!setHoverStep;
          return (
            <div className={`dvv-log-row dvv-log-now-row${hoverStep === 'now' ? ' is-linked' : ''}`}
              aria-hidden="false"
              onMouseEnter={linkable ? () => setHoverStep('now') : undefined}
              onMouseLeave={linkable ? () => setHoverStep(null) : undefined}>
              <span className="dvv-log-dot now"/>
              <div className="dvv-log-body">
                <span className="dvv-log-badge">Day {daysIn}</span>
                <b>Now</b>
              </div>
              <span className="dvv-log-time">today</span>
              <span className="dvv-log-actions" aria-hidden="true"/>
            </div>
          );
        })()}
      </div>

      {variant === 'full' && (
        <div className="dvv-composer">
          <div className="dvv-cmp-hd">
            <span className="dvv-cmp-label">Add note</span>
            <span className="dvv-cmp-help" data-tooltip="Notes capture what happened — what they said, when you chased, anything contextual. The latest note becomes the card's subtitle."
              data-tt-pos="below"><I.Info/></span>
          </div>
          <div className="dvv-cmp-instr">Log what they said, when you nudged, or anything worth remembering. <kbd>⌘</kbd><kbd>↵</kbd> to save fast.</div>
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
              <span className="dvv-cmp-cooldown"
                data-tooltip={cooldown.kind === 'heard'
                  ? `You heard back ${cooldown.ago} — no need to nudge yet`
                  : `Nudged ${cooldown.ago} — give it a beat`}
                data-tt-pos="below">
                <I.Clock/> {cooldown.kind === 'heard' ? `Heard back ${cooldown.ago}` : `Nudged ${cooldown.ago}`}
              </span>
            ) : (
              <button className="dvv-cmp-btn nudge"
                data-tooltip="Log a nudge (Slack/email/in person). Updates last-contact without spawning a new check-in."
                aria-label="Log a nudge"
                onClick={() => {
                  const text = composerText.trim();
                  chase(task.id, text);
                  setComposerText('');
                  showToast?.(`Logged nudge${task.delegatedTo ? ' to ' + task.delegatedTo : ''}`, { undoable: true, timeout: 3500 });
                }}>
                <I.Flag/> Nudge
              </button>
            )}
            {onTakeBack && task.delegatedTo && (
              <button className="dvv-cmp-btn takeback"
                data-tooltip="Reclaim this task and put it on today's column"
                aria-label="Take back"
                onClick={() => {
                  onTakeBack?.(task.id);
                  showToast?.('Took back to today', { undoable: true });
                }}>
                <I.Undo/> Take back
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
