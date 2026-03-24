'use client';
// components/LoadingSpinner.tsx
// ============================================================
// Themed loading spinner — adapts to Classic RPG / Clean Modern
// ============================================================

import { motion } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function LoadingSpinner({
  message = 'Connecting to the Grid...',
  size = 'md',
}: LoadingSpinnerProps) {
  const { isClassic } = useTheme();

  const dimensions = { sm: 32, md: 56, lg: 80 }[size];
  const strokeW    = { sm: 3,  md: 4,  lg: 5  }[size];
  const r          = (dimensions - strokeW * 2) / 2;
  const circ       = 2 * Math.PI * r;

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* Spinner ring */}
      <div className="relative" style={{ width: dimensions, height: dimensions }}>
        <svg
          width={dimensions}
          height={dimensions}
          viewBox={`0 0 ${dimensions} ${dimensions}`}
          style={{ overflow: 'visible' }}
        >
          {/* Track */}
          <circle
            cx={dimensions / 2} cy={dimensions / 2} r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeW}
          />
          {/* Animated arc */}
          <motion.circle
            cx={dimensions / 2} cy={dimensions / 2} r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * 0.25}
            transform={`rotate(-90 ${dimensions / 2} ${dimensions / 2})`}
            animate={{ rotate: ['-90deg', '270deg'] }}
            style={{ originX: '50%', originY: '50%' }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
          />
        </svg>

        {/* Classic: inner pulsing dot */}
        {isClassic && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: 1.1, repeat: Infinity }}
          >
            <div
              className="rounded-full"
              style={{
                width: dimensions * 0.2,
                height: dimensions * 0.2,
                backgroundColor: 'var(--accent)',
                boxShadow: '0 0 8px var(--accent-glow)',
              }}
            />
          </motion.div>
        )}
      </div>

      {/* Message */}
      {message && (
        <motion.p
          className="text-xs uppercase tracking-[0.2em] font-semibold"
          style={{ color: 'var(--text-secondary)' }}
          animate={isClassic ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          {message}
        </motion.p>
      )}
    </div>
  );
}
