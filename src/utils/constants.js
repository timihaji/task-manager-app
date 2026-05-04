import { D } from '../data.js';

const TIME_PRESETS = ['5m','15m','30m','45m','1h','1.5h','2h'];
const TIME_MORE    = ['10m','20m','25m','40m','50m','1h 15m','1h 30m','1h 45m','2h 30m','3h','4h','5h','6h','8h'];
const PRI_INFO     = { p1:{l:'Urgent',c:'#ef4444'}, p2:{l:'Normal',c:'#f59e0b'}, p3:{l:'Low',c:'#71717a'} };
const SNOOZE_OPTS  = [
  {l:'Tomorrow',   fn:()=>D.str(D.add(D.today(),1))},
  {l:'In 2 days',  fn:()=>D.str(D.add(D.today(),2))},
  {l:'Next week',  fn:()=>D.str(D.add(D.today(),7))},
  {l:'In 2 weeks', fn:()=>D.str(D.add(D.today(),14))},
  {l:'Next month', fn:()=>{ const d=new Date(D.today()); d.setMonth(d.getMonth()+1); return D.str(d); }},
];

export { TIME_PRESETS, TIME_MORE, PRI_INFO, SNOOZE_OPTS };
