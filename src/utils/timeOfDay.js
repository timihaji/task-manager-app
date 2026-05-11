// Time-of-day helpers for the calendar drawer. All math is done on integer
// minutes from midnight (0..1440). Pure functions, no side effects.

export const SNAP = 15;
export const DAY_MIN = 24 * 60;
export const WORK_START = 9 * 60;
export const WORK_END   = 17 * 60;
export const MIN_PXH = 40;
export const MAX_PXH = 180;
export const RUBBER_PX = 64;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const snap  = (m, step = SNAP) => Math.round(m / step) * step;

// 15m -> 0.6, 30m -> 1.0, 45m -> 1.5, 60m -> 2.0, 90m+ -> 2.6.
export const massFor = (durationMin) => clamp(durationMin / 30, 0.6, 2.6);

// Apple-style rubberband: past `max` pixels, additional pull tapers off.
export const rubber = (over, max = RUBBER_PX) => (over <= 0 ? 0 : (over * max) / (max + over));

// "9:00", "13:30" etc.
export const minToHHMM = (m) => {
  const h = Math.floor(((m % DAY_MIN) + DAY_MIN) % DAY_MIN / 60);
  const mm = ((m % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

// "9 am", "1:30 pm".
export const minToLabel = (m) => {
  const h24 = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const ampm = h24 < 12 ? 'am' : 'pm';
  const h12 = ((h24 + 11) % 12) + 1;
  return mm === 0 ? `${h12} ${ampm}` : `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
};

// "9a", "1:30p" — compact for hour gutter and meta rows.
export const minToCompact = (m) => {
  const h24 = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const ampm = h24 < 12 ? 'a' : 'p';
  const h12 = ((h24 + 11) % 12) + 1;
  return mm === 0 ? `${h12}${ampm}` : `${h12}:${String(mm).padStart(2, '0')}${ampm}`;
};

// "1h 30m" / "45m" / "2h".
export const fmtDur = (mins) => {
  if (!mins || mins <= 0) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

// Minutes elapsed since midnight in the local timezone.
export const currentMinOfDay = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
