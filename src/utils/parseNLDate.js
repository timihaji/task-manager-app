import { D } from '../data.js';

function parseNLDate(input) {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const today = D.today();
  // today / tomorrow / yesterday
  if (/^(tod|today)$/.test(s)) return D.str(today);
  if (/^(tom|tmrw|tomorrow)$/.test(s)) return D.str(D.add(today,1));
  if (/^(yes|yda|yesterday)$/.test(s)) return D.str(D.add(today,-1));
  // +Nd / +Nw / +Nm
  let m = s.match(/^\+(\d+)\s*([dwm])$/);
  if (m) {
    const n = parseInt(m[1],10);
    if (m[2]==='d') return D.str(D.add(today,n));
    if (m[2]==='w') return D.str(D.add(today,n*7));
    if (m[2]==='m') { const d=new Date(today); d.setMonth(d.getMonth()+n); return D.str(d); }
  }
  // weekday (optionally "next"-prefixed)
  const dows = ['sun','mon','tue','wed','thu','fri','sat'];
  m = s.match(/^(next\s+)?(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(day)?$/);
  if (m) {
    const next = !!m[1];
    const target = dows.findIndex(d => m[2].startsWith(d));
    if (target >= 0) {
      const cur = today.getDay();
      let delta = (target - cur + 7) % 7;
      if (delta === 0) delta = 7;
      if (next) delta += 7 * (delta < 7 ? 0 : 0); // "next mon" = same as "mon" if today != mon
      // Sunsama interpretation: "next mon" = the Monday in the FOLLOWING week
      if (next && delta < 7) delta += 7;
      return D.str(D.add(today, delta));
    }
  }
  // M/D or M/D/YY[YY]
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (m) {
    const month = parseInt(m[1],10) - 1;
    const day   = parseInt(m[2],10);
    let year = today.getFullYear();
    if (m[3]) year = m[3].length===2 ? 2000+parseInt(m[3],10) : parseInt(m[3],10);
    const d = new Date(year, month, day);
    if (!isNaN(d)) return D.str(d);
  }
  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
    if (!isNaN(d)) return D.str(d);
  }
  // "apr 15" / "april 15"
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  m = s.match(/^([a-z]{3,9})\s+(\d{1,2})$/);
  if (m) {
    const mi = months.findIndex(mn => m[1].startsWith(mn));
    if (mi >= 0) {
      const day = parseInt(m[2],10);
      const d = new Date(today.getFullYear(), mi, day);
      if (d < today) d.setFullYear(d.getFullYear()+1);
      if (!isNaN(d)) return D.str(d);
    }
  }
  return null;
}

export { parseNLDate };
