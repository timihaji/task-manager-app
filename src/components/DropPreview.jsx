import React from 'react';
import { PROJ, TAG_NAMES, LIFE_AREA_NAMES } from '../data.js';

// A card-shaped placeholder shown at the drop slot during drag. Mirrors the
// dragged card's title + key chips so the user sees a preview of the
// post-drop layout instead of a generic blue rectangle.
//
// onDragOver/onDrop optionally make the placeholder itself a drop target.
// This matters when the preview displaces the card the user was hovering:
// the layout shift slides the cursor onto the preview, and without local
// drag handlers the browser shows the "no-drop" cursor and the drop fails.
export function DropPreview({ task, theme, small=false, onDragOver, onDrop }) {
  if (!task) return <div className="drop-ph" onDragOver={onDragOver} onDrop={onDrop}/>;
  if (small) return <div className="drop-ph drop-ph-sm" onDragOver={onDragOver} onDrop={onDrop}/>;
  const proj = task.project ? PROJ.find(p => p.id === task.project) : null;
  return (
    <div className="drop-ph drop-ph-preview" onDragOver={onDragOver} onDrop={onDrop}>
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
