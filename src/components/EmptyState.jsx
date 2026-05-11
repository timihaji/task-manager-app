// Designed empty states (added by polish review). One small component
// reused across Column/Inbox/ListView so the visual treatment stays
// consistent. Reads the celebratory-Today pattern in styles.css 1382+.
import React from 'react';
import { I } from '../utils/icons.jsx';

const ICONS = {
  inbox:    <I.Inbox/>,
  calendar: <I.Cal/>,
  list:     <I.List/>,
  stack:    <I.Stack/>,
  search:   <I.Search/>,
};

export function EmptyState({ kind = 'list', title, hint, compact = false }) {
  const Icon = ICONS[kind] || ICONS.list;
  return (
    <div className={`es${compact ? ' es-compact' : ''}`} role="status">
      <div className="es-icon">{Icon}</div>
      {title && <div className="es-title">{title}</div>}
      {hint && <div className="es-hint">{hint}</div>}
    </div>
  );
}
