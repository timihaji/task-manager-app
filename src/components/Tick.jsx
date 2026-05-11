// Animated number — flips when the value changes (up vs down direction).
// Drop-in for any place that displays a count: <Tick value={tasks.length}/>.
// Uses framer-motion's AnimatePresence for clean enter/exit; falls back to
// a static number if reduce-motion is set.
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { prefersReducedMotion } from '../hooks/springs.js';

export function Tick({ value, className = '' }) {
  if (prefersReducedMotion()) return <span className={className}>{value}</span>;
  return (
    <span className={`tick-num ${className}`} aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
