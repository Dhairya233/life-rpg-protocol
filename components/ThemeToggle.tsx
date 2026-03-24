'use client';
// components/ThemeToggle.tsx

import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggle, isClassic } = useTheme();

  return (
    <button
      onClick={toggle}
      className="theme-toggle-btn relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-widest transition-all duration-300"
      aria-label="Toggle theme"
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={theme}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2"
        >
          {isClassic ? (
            <>
              <span>⚡</span>
              <span>Classic RPG</span>
            </>
          ) : (
            <>
              <span>☀</span>
              <span>Clean Modern</span>
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
