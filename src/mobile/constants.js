// Mobile taxonomy / picker constants. These are the design's defaults; the
// DataProvider will override PROJECTS/ALL_TAGS/LIFE_AREAS at runtime from
// the real workspace taxonomy when one is loaded.

export const PROJECTS_DEFAULT = [
  { id:'work',     label:'Work',         color:'#6366f1' },
  { id:'personal', label:'Personal',     color:'#f59e0b' },
  { id:'health',   label:'Health',       color:'#10b981' },
  { id:'finance',  label:'Finance',      color:'#3b82f6' },
  { id:'learning', label:'Learning',     color:'#8b5cf6' },
  { id:'side',     label:'Side Project', color:'#ec4899' },
];

export const ALL_TAGS_DEFAULT = {
  strategic:'Strategic', admin:'Admin',    creative:'Creative',
  research:'Research',   calls:'Calls',    writing:'Writing',
  review:'Review',       health:'Health',  planning:'Planning',
};

export const TAG_COLORS_DEFAULT = {
  strategic:{ l:'#3730a3', d:'#c7d2fe', bl:'#e0e7ff', bd:'rgba(99,102,241,.18)' },
  admin:    { l:'#475569', d:'#cbd5e1', bl:'#f1f5f9', bd:'rgba(148,163,184,.18)' },
  creative: { l:'#be185d', d:'#f9a8d4', bl:'#fce7f3', bd:'rgba(236,72,153,.18)' },
  research: { l:'#0369a1', d:'#bae6fd', bl:'#e0f2fe', bd:'rgba(14,165,233,.18)' },
  calls:    { l:'#065f46', d:'#6ee7b7', bl:'#d1fae5', bd:'rgba(16,185,129,.18)' },
  writing:  { l:'#92400e', d:'#fcd34d', bl:'#fef3c7', bd:'rgba(245,158,11,.18)' },
  review:   { l:'#5b21b6', d:'#ddd6fe', bl:'#ede9fe', bd:'rgba(139,92,246,.18)' },
  health:   { l:'#047857', d:'#6ee7b7', bl:'#d1fae5', bd:'rgba(16,185,129,.18)' },
  planning: { l:'#9a3412', d:'#fed7aa', bl:'#ffedd5', bd:'rgba(249,115,22,.18)' },
};

const TAG_FALLBACK_PALETTE = [
  { l:'#3730a3', d:'#c7d2fe', bl:'#e0e7ff', bd:'rgba(99,102,241,.18)' },
  { l:'#be185d', d:'#f9a8d4', bl:'#fce7f3', bd:'rgba(236,72,153,.18)' },
  { l:'#0369a1', d:'#bae6fd', bl:'#e0f2fe', bd:'rgba(14,165,233,.18)' },
  { l:'#065f46', d:'#6ee7b7', bl:'#d1fae5', bd:'rgba(16,185,129,.18)' },
  { l:'#92400e', d:'#fcd34d', bl:'#fef3c7', bd:'rgba(245,158,11,.18)' },
  { l:'#5b21b6', d:'#ddd6fe', bl:'#ede9fe', bd:'rgba(139,92,246,.18)' },
  { l:'#9a3412', d:'#fed7aa', bl:'#ffedd5', bd:'rgba(249,115,22,.18)' },
  { l:'#475569', d:'#cbd5e1', bl:'#f1f5f9', bd:'rgba(148,163,184,.18)' },
];

export function tagColorFor(id) {
  if (TAG_COLORS_DEFAULT[id]) return TAG_COLORS_DEFAULT[id];
  let h = 0;
  for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TAG_FALLBACK_PALETTE[h % TAG_FALLBACK_PALETTE.length];
}

export const LIFE_AREAS_DEFAULT = [
  { id:'work',     label:'Work',     color:'#6366f1' },
  { id:'personal', label:'Personal', color:'#f59e0b' },
  { id:'health',   label:'Health',   color:'#10b981' },
  { id:'finance',  label:'Finance',  color:'#3b82f6' },
];

export const PRI = {
  p1:{ label:'Urgent', color:'#ef4444', dim:'rgba(239,68,68,.15)' },
  p2:{ label:'Normal', color:'#f59e0b', dim:'rgba(245,158,11,.15)' },
  p3:{ label:'Low',    color:'#94a3b8', dim:'rgba(148,163,184,.12)' },
};

export const TIME_OPTS = ['5m','10m','15m','20m','30m','45m','1h','1h 30m','2h','3h','4h'];

import { D as Dx, TODAY as T, TOMORROW as TM, IN2 as I2, IN3 as I3, IN7 as I7, IN14 as I14 } from './dateUtil.js';

export const SNOOZE_OPTS = [
  { l:'Tomorrow',  fn:() => TM },
  { l:'In 2 days', fn:() => I2 },
  { l:'In 3 days', fn:() => I3 },
  { l:'Next week', fn:() => I7 },
  { l:'In 2 weeks',fn:() => I14 },
];

export const ACCENT_OPTS = ['#0f766e','#6366f1','#ec4899','#f59e0b','#3b82f6','#10b981','#8b5cf6','#ef4444'];
export const LOOK_OPTS = ['glass','soft','minimal','sharp'];
