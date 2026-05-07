import React from 'react';
import { PROJ, TAG_NAMES, LIFE_AREA_NAMES } from '../data.js';

// A card-shaped placeholder shown at the drop slot during drag. Mirrors the
// dragged card's title + key chips so the user sees a preview of the
// post-drop layout instead of a generic blue rectangle.
export function DropPreview({ task, theme, small=false }) {
  if (!task) return <div className="drop-ph"/>;
  if (small) return <div className="drop-ph drop-ph-sm"/>;
  const proj = task.project ? PROJ.find(p => p.id === task.project) : null;
  return (
    <div className="drop-ph drop-ph-preview">
      <div className="drop-ph-title">{task.title || 'Untitled'}</div>
      <div className="drop-ph-meta">
        {(task.tags||[]).slice(0,2).map(tg => (
          <span key={tg} className="drop-ph-chip">{TAG_NAMES[tg]||tg}</span>
        ))}
        {task.lifeArea && <span className="drop-ph-chip">{LIFE_AREA_NAMES[task.lifeArea]||task.lifeArea}</span>}
        {proj && <span className="drop-ph-chip" style={{color:proj.color}}>{proj.id}</span>}
        {task.timeEstimate && <span className="drop-ph-chip">{task.timeEstimate}</span>}
      </div>
    </div>
  );
}
