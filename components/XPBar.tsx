'use client';
// components/XPBar.tsx

import { motion } from 'framer-motion';
import { calculateLevel, levelProgress, xpForLevel, xpToNextLevel } from '@/lib/rpg-engine';

interface XPBarProps {
  xp: number;
}

export default function XPBar({ xp }: XPBarProps) {
  const level    = calculateLevel(xp);
  const progress = levelProgress(xp);
  const toNext   = xpToNextLevel(xp);
  const floor    = xpForLevel(level);
  const ceiling  = xpForLevel(level + 1);

  return (
    <div className="w-full space-y-2">
      {/* Level label row */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-widest xp-label">Level</span>
          <motion.span
            className="text-3xl font-black font-mono xp-value"
            key={level}
            initial={{ scale: 1.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            {level}
          </motion.span>
        </div>
        <div className="text-right">
          <div className="text-xs xp-label opacity-60 font-mono">
            {xp.toLocaleString()} XP total
          </div>
          <div className="text-xs xp-label opacity-60 font-mono">
            {toNext.toLocaleString()} to next
          </div>
        </div>
      </div>

      {/* Bar track */}
      <div className="relative h-3 rounded-full xp-track overflow-visible">
        {/* Background shimmer */}
        <div className="absolute inset-0 rounded-full xp-track" />

        {/* Fill */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full xp-fill"
          initial={{ width: '0%' }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 1.4, ease: 'easeOut', delay: 0.2 }}
        />

        {/* Animated shimmer overlay */}
        <motion.div
          className="absolute inset-y-0 rounded-full xp-shimmer"
          animate={{ left: ['-20%', '120%'] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
          style={{ width: '20%' }}
        />
      </div>

      {/* Sub-labels */}
      <div className="flex justify-between text-xs font-mono opacity-40 xp-label">
        <span>{floor.toLocaleString()}</span>
        <span>{ceiling.toLocaleString()}</span>
      </div>
    </div>
  );
}
