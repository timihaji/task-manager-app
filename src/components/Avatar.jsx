import React from 'react';

export const AVATAR_COLORS = ['#6366f1','#10b981','#ec4899','#f59e0b','#3b82f6','#8b5cf6'];

export function Avatar({ name, size=32 }) {
  const c = AVATAR_COLORS[(name||'').charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:c, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:Math.floor(size*0.38), fontWeight:700, flexShrink:0, letterSpacing:'-.5px' }}>
      {(name||'?').slice(0,2).toUpperCase()}
    </div>
  );
}
