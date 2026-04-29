import React from 'react';

function PriBars({ pri }) {
  const colors = { p1:'#ef4444', p2:'#f59e0b', p3:'var(--border-s)' };
  const heights = { p1:[8,10,12], p2:[5,7,9], p3:[3,5,7] };
  const c=colors[pri]||colors.p3; const h=heights[pri]||heights.p3;
  const filled = pri==='p1'?3:pri==='p2'?2:1;
  return <div className="pri-bars">{h.map((ht,i)=><div key={i} className="pri-bar" style={{height:ht,background:i<filled?c:'var(--border-s)'}}/>)}</div>;
}

export { PriBars };
