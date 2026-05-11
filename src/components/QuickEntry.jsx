// Quick Entry overlay (Ctrl+Space). A floating dialog that captures a task
// from anywhere in the app — title goes to Inbox, an optional NL prefix
// like "tomorrow " or "fri " sets the date.
//
// Triggers via the global keydown in App.jsx.
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseNLDate } from '../utils/parseNLDate.js';
import { D } from '../data.js';

// Try to peel a leading NL-date token off the input; if found, return
// {date, restTitle}. Otherwise null.
function peelDate(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  // Try the first 1-3 words as a NL date phrase.
  const words = trimmed.split(/\s+/);
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const phrase = words.slice(0, n).join(' ');
    const parsed = parseNLDate(phrase);
    if (parsed) {
      const restTitle = words.slice(n).join(' ').trim();
      if (restTitle) return { date: parsed, restTitle, phrase };
    }
  }
  return null;
}

export function QuickEntry({ open, onClose, onSubmit }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setText('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const peeled = peelDate(text);
  const target = peeled
    ? { date: peeled.date, title: peeled.restTitle }
    : { date: null, title: text.trim() };
  const targetLabel = target.date
    ? D.str(target.date) === D.str(D.today())   ? 'Today'
    : D.str(target.date) === D.str(D.add(D.today(),1)) ? 'Tomorrow'
    : target.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Inbox';

  const submit = () => {
    if (!target.title) return;
    onSubmit(target);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="qe-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={onClose}
        >
          <motion.div
            className="qe-panel"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Quick entry"
          >
            <input
              ref={inputRef}
              className="qe-input"
              placeholder="What's on your mind?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submit(); }
                if (e.key === 'Escape') { e.preventDefault(); onClose(); }
              }}
              autoComplete="off"
              spellCheck="false"
            />
            <div className="qe-meta">
              <span className={`qe-target ${target.date ? 'qe-target-dated' : ''}`}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {target.date
                    ? <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>
                    : <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>
                  }
                </svg>
                {targetLabel}
              </span>
              <span className="qe-help">
                <kbd>↵</kbd> save · <kbd>Esc</kbd> cancel · prefix with <em>tomorrow / fri / +3d</em> to set date
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
