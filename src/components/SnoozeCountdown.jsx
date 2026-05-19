import React, { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { D } from '../data.js';

// Single global tick for every snoozed-to-today countdown on the page.
// One setInterval per app, adaptive: 30s normally, 1s when any countdown is
// inside its last minute, 250ms in the last 5 seconds. Far cheaper than
// per-card setInterval and keeps bars/timers redrawing in lockstep.
const SnoozeTickCtx = createContext({ now: Date.now() });

function pickInterval(tasks) {
  const now = Date.now();
  let minRemaining = Infinity;
  for (const t of tasks) {
    if (!t.snoozedUntil) continue;
    const wake = new Date(t.snoozedUntil).getTime();
    if (!Number.isFinite(wake)) continue;
    if (wake <= now) return 250; // expired but not yet processed — tick fast so wake fires soon
    const remaining = wake - now;
    if (remaining < minRemaining) minRemaining = remaining;
  }
  if (minRemaining === Infinity) return 30000;     // no snoozes — slow tick (still useful for picker labels)
  if (minRemaining < 5000)        return 250;
  if (minRemaining < 60000)       return 1000;
  return 30000;
}

export function SnoozeTickProvider({ tasks, children }) {
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef(null);
  const targetIntervalRef = useRef(30000);

  useEffect(() => {
    let cancelled = false;
    const schedule = (ms) => {
      targetIntervalRef.current = ms;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (cancelled) return;
        const t = Date.now();
        setNow(t);
        const next = pickInterval(tasks);
        if (next !== targetIntervalRef.current) schedule(next);
      }, ms);
    };
    schedule(pickInterval(tasks));
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tasks]);

  const value = useMemo(() => ({ now }), [now]);
  return <SnoozeTickCtx.Provider value={value}>{children}</SnoozeTickCtx.Provider>;
}

export function useSnoozeTick() {
  return useContext(SnoozeTickCtx).now;
}

// Format milliseconds-remaining as a compact label. Keeps to a fixed width
// so the timer text doesn't dance as the value changes.
function fmtRemaining(ms) {
  if (ms <= 0) return 'waking';
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${totalSec}s left`;
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return `${totalMin}m left`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

// Renders the thin progress bar across the top of a card snoozed-to-today.
// progress = 0 at snooze time, 1 at wake time. Bar fills (left to right) so
// the user reads it as "how much of the wait has elapsed". Colour shifts
// amber → red in the last minute, pulses in the last 5 seconds.
export function SnoozeCountdownBar({ task }) {
  const now = useSnoozeTick();
  if (!task.snoozedUntil) return null;
  const todayKey = D.str(D.today());
  if (D.snoozeDayKey(task.snoozedUntil) !== todayKey) return null;
  const wake = new Date(task.snoozedUntil).getTime();
  if (!Number.isFinite(wake)) return null;
  const startedAt = task.snoozedAt ? new Date(task.snoozedAt).getTime() : (wake - 60 * 60000);
  const totalSpan = Math.max(1, wake - startedAt);
  const elapsed = Math.max(0, Math.min(now - startedAt, totalSpan));
  const progress = elapsed / totalSpan;
  const remaining = wake - now;
  const variant = remaining < 5000 ? 'crit' : remaining < 60000 ? 'warn' : '';
  return (
    <div className={`snz-bar ${variant}`} style={{ '--snz-progress': progress.toFixed(3) }}>
      <div className="snz-bar-fill"/>
    </div>
  );
}

// Live-updating timer label. Used in the snooze pill on snoozed-to-today
// cards so the user sees a counting "12m left" instead of a static "at 5 PM".
export function SnoozeTimerLabel({ task, fallback }) {
  const now = useSnoozeTick();
  if (!task.snoozedUntil) return fallback || null;
  const todayKey = D.str(D.today());
  if (D.snoozeDayKey(task.snoozedUntil) !== todayKey) return fallback || null;
  const wake = new Date(task.snoozedUntil).getTime();
  if (!Number.isFinite(wake)) return fallback || null;
  return <>{fmtRemaining(wake - now)}</>;
}

// Effect-only component that watches the tick for expired snoozes and calls
// onWake with the batch. App.jsx owns the actual state mutation + toast/
// notification logic. The wake-on-load path fires once after tasksReady
// flips so we don't double-fire as the tick increments.
export function AutoWakeWatcher({ tasks, tasksReady, onWake }) {
  const now = useSnoozeTick();
  const firedOnLoadRef = useRef(false);
  const lastSeenIdsRef = useRef(new Set());
  useEffect(() => {
    if (!tasksReady) return;
    const expired = tasks.filter(t => t.snoozedUntil && D.isPastTime(t.snoozedUntil));
    if (expired.length === 0) {
      if (!firedOnLoadRef.current) firedOnLoadRef.current = true;
      return;
    }
    // First time we see any expired snooze AFTER hydration → group it as
    // wake-on-load (these slept through app downtime). Subsequent expiries
    // are real-time wakeups.
    const seen = lastSeenIdsRef.current;
    const fresh = expired.filter(t => !seen.has(t.id));
    fresh.forEach(t => seen.add(t.id));
    if (fresh.length === 0) return;
    const wakeOnLoad = !firedOnLoadRef.current;
    firedOnLoadRef.current = true;
    onWake(fresh, { wakeOnLoad });
  }, [now, tasks, tasksReady, onWake]);
  return null;
}
