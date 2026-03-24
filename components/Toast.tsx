'use client';
// components/Toast.tsx
// ============================================================
// Themed toast notification — used on login/signup errors & success
// ============================================================

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';

export type ToastType = 'error' | 'success' | 'warning' | 'info';

interface ToastProps {
  message:   string;
  type?:     ToastType;
  visible:   boolean;
  onDismiss: () => void;
  duration?: number; // ms — 0 = no auto-dismiss
}

const ICONS: Record<ToastType, string> = {
  error:   '✗',
  success: '✓',
  warning: '⚠',
  info:    'ℹ',
};

const COLORS: Record<ToastType, { border: string; bg: string; text: string; glow: string }> = {
  error:   { border: '#ff3355', bg: 'rgba(255,51,85,0.10)',   text: '#ff3355', glow: '#ff335540' },
  success: { border: '#69ff96', bg: 'rgba(105,255,150,0.10)', text: '#69ff96', glow: '#69ff9640' },
  warning: { border: '#ffd700', bg: 'rgba(255,215,0,0.10)',   text: '#ffd700', glow: '#ffd70040' },
  info:    { border: '#4af7ff', bg: 'rgba(74,247,255,0.10)',  text: '#4af7ff', glow: '#4af7ff40' },
};

export default function Toast({
  message,
  type = 'error',
  visible,
  onDismiss,
  duration = 4000,
}: ToastProps) {
  const { isClassic } = useTheme();
  const c = COLORS[type];

  useEffect(() => {
    if (!visible || duration === 0) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [visible, duration, onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3 w-full rounded-xl px-4 py-3 border cursor-pointer select-none"
          style={{
            borderColor: c.border,
            background:  c.bg,
            boxShadow:   isClassic ? `0 0 16px ${c.glow}` : '0 2px 12px rgba(0,0,0,0.08)',
          }}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0,  scale: 1    }}
          exit={{    opacity: 0, y: -8, scale: 0.97  }}
          transition={{ duration: 0.22 }}
          onClick={onDismiss}
        >
          {/* Icon */}
          <span
            className="font-black text-sm mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full border"
            style={{ color: c.text, borderColor: c.border }}
          >
            {ICONS[type]}
          </span>

          {/* Message */}
          <p className="text-sm font-semibold flex-1 leading-snug" style={{ color: c.text }}>
            {message}
          </p>

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            className="opacity-40 hover:opacity-80 text-xs flex-shrink-0 mt-0.5 transition-opacity"
            style={{ color: c.text }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
