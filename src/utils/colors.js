import { LIFE_AREA_DARK, LIFE_AREA_LIGHT } from '../data.js';

const UNASSIGNED_LIFE_AREA = '__unassigned__';

function slugId(label, prefix='item') {
  const base = String(label||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return base || `${prefix}_${Date.now()}`;
}

function tagColors(seed) {
  const palette = [
    ['rgba(251,207,232,.22)','#fbcfe8','#fce7f3','#9d174d'],
    ['rgba(254,202,202,.22)','#fecaca','#fee2e2','#991b1b'],
    ['rgba(254,215,170,.22)','#fed7aa','#ffedd5','#9a3412'],
    ['rgba(254,240,138,.22)','#fef08a','#fef9c3','#854d0e'],
    ['rgba(187,247,208,.22)','#bbf7d0','#dcfce7','#166534'],
    ['rgba(153,246,228,.22)','#99f6e4','#ccfbf1','#115e59'],
    ['rgba(186,230,253,.22)','#bae6fd','#e0f2fe','#075985'],
    ['rgba(199,210,254,.22)','#c7d2fe','#e0e7ff','#3730a3'],
    ['rgba(221,214,254,.22)','#ddd6fe','#ede9fe','#5b21b6'],
    ['rgba(226,232,240,.20)','#cbd5e1','#f1f5f9','#475569'],
  ];
  const n = String(seed||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  const p = palette[n % palette.length];
  return { dark:{bg:p[0],fg:p[1]}, light:{bg:p[2],fg:p[3]} };
}

function lifeAreaPalette(id, theme='dark') {
  const pal = theme==='dark' ? LIFE_AREA_DARK : LIFE_AREA_LIGHT;
  return pal[id] || pal.admin || tagColors(id || 'life-area')[theme];
}

export { slugId, tagColors, lifeAreaPalette, UNASSIGNED_LIFE_AREA };
