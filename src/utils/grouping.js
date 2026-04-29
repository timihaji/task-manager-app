import { PROJ, ALL_TAGS, LIFE_AREAS, LIFE_AREA_NAMES, TAG_NAMES, TAG_DARK, TAG_LIGHT } from '../data.js';
import { lifeAreaPalette, UNASSIGNED_LIFE_AREA } from './colors.js';

function groupTasksBy(tasks, by, getEffectiveLifeAreaForTask) {
  if (!by || by==='none') return [{key:'_all',label:null,tasks}];
  const order = by==='priority'
    ? ['p1','p2','p3']
    : by==='project'
      ? PROJ.map(p=>p.id)
      : by==='lifeArea'
        ? [...LIFE_AREAS, UNASSIGNED_LIFE_AREA]
        : ALL_TAGS;
  const map = {};
  tasks.forEach(t=>{
    let k;
    if (by==='priority') k = t.pri||t.priority||'p3';
    else if (by==='project') k = t.project||'_none';
    else if (by==='lifeArea') k = (getEffectiveLifeAreaForTask ? getEffectiveLifeAreaForTask(t) : t.lifeArea) || UNASSIGNED_LIFE_AREA;
    else {
      const tg = (t.tags||[]).filter(Boolean).slice().sort();
      k = tg.length ? tg.join('|') : '_other';
    }
    if(!map[k]) map[k]=[];
    map[k].push(t);
  });
  const res=[];
  if (by==='tag') {
    order.forEach(k=>{ if(map[k]?.length) res.push({key:k,label:getGLabel(k,by),tasks:map[k]}); });
    const combos = Object.keys(map).filter(k=>k!=='_other' && !order.includes(k) && k.includes('|'));
    combos.sort((a,b)=>{
      const ac=a.split('|').length, bc=b.split('|').length;
      return ac!==bc ? ac-bc : a.localeCompare(b);
    });
    combos.forEach(k=>{ res.push({key:k,label:getGLabel(k,by),tasks:map[k]}); });
    if(map['_other']?.length) res.push({key:'_other',label:getGLabel('_other',by),tasks:map['_other']});
  } else {
    order.forEach(k=>{ if(map[k]?.length) res.push({key:k,label:getGLabel(k,by),tasks:map[k]}); });
    Object.keys(map).forEach(k=>{ if(!order.includes(k)&&map[k]?.length) res.push({key:k,label:getGLabel(k,by),tasks:map[k]}); });
  }
  return res;
}

function getGLabel(key,by) {
  if(by==='project') return PROJ.find(p=>p.id===key)?.label||'No Location';
  if(by==='priority') return {p1:'Urgent',p2:'Normal',p3:'Low'}[key]||key;
  if(by==='lifeArea') return key===UNASSIGNED_LIFE_AREA ? 'Unassigned' : (LIFE_AREA_NAMES[key]||key);
  if(by==='tag') {
    if(key==='_other') return 'Untagged';
    if(key.includes('|')) return key.split('|').map(t=>TAG_NAMES[t]||t).join(' + ');
    return TAG_NAMES[key]||key;
  }
  return key;
}

function getGColor(key, by, theme='dark') {
  if(by==='project') return PROJ.find(p=>p.id===key)?.color || 'var(--t3)';
  if(by==='lifeArea') return key===UNASSIGNED_LIFE_AREA ? 'var(--t3)' : lifeAreaPalette(key, theme).fg;
  if(by==='tag') {
    if(key==='_other') return 'var(--t3)';
    const first = key.includes('|') ? key.split('|')[0] : key;
    const pal = theme==='dark' ? TAG_DARK : TAG_LIGHT;
    return (pal[first] || pal.admin).fg;
  }
  return 'var(--t2)';
}

export { groupTasksBy, getGLabel, getGColor };
