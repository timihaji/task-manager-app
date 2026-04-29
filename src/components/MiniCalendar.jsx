import React, { useState } from 'react';
import { D } from '../data.js';

function MiniCalendar({ value, onPick }) {
  const today = D.today();
  const initial = value ? D.parse(value) : today;
  const [cursor, setCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const monthLabel = cursor.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const firstDow = cursor.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth()+1, 0).getDate();
  const prevMonthDays = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate();
  const cells = [];
  for (let i=0; i<firstDow; i++) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth()-1, prevMonthDays - firstDow + 1 + i);
    cells.push({d, other:true});
  }
  for (let i=1; i<=daysInMonth; i++) {
    cells.push({d:new Date(cursor.getFullYear(), cursor.getMonth(), i), other:false});
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length-1].d;
    cells.push({d:new Date(last.getFullYear(), last.getMonth(), last.getDate()+1), other:true});
    if (cells.length === 42) break;
  }
  const todayStr = D.str(today);
  return (
    <div className="cal">
      <div className="cal-hd">
        <button className="cal-nav" onClick={()=>setCursor(new Date(cursor.getFullYear(), cursor.getMonth()-1, 1))}>‹</button>
        <span className="cal-mo">{monthLabel}</span>
        <button className="cal-nav" onClick={()=>setCursor(new Date(cursor.getFullYear(), cursor.getMonth()+1, 1))}>›</button>
      </div>
      <div className="cal-grid">
        {['S','M','T','W','T','F','S'].map((d,i)=><div key={i} className="cal-dow">{d}</div>)}
        {cells.map((c,i)=>{
          const ds = D.str(c.d);
          const sel = ds === value;
          const tdy = ds === todayStr;
          return <button key={i} className={`cal-d${c.other?' other':''}${tdy?' today':''}${sel?' sel':''}`}
            onClick={()=>onPick(ds)}>{c.d.getDate()}</button>;
        })}
      </div>
    </div>
  );
}

export { MiniCalendar };
