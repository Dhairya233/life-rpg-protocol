'use client';
// components/StatChip.tsx

import { motion } from 'framer-motion';
import { luckMultiplier } from '@/lib/rpg-engine';

interface StatChipProps {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  glow?: string;
  delay?: number;
  sub?: string;
}

export function StatChip({ label, value, icon, color, glow, delay = 0, sub }: StatChipProps) {
  return (
    <motion.div
      className="stat-chip rounded-xl px-4 py-3 flex items-center gap-3"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.4 }}
    >
      <span className="text-xl" style={{ filter: glow ? `drop-shadow(0 0 6px ${glow})` : 'none' }}>
        {icon}
      </span>
      <div>
        <div className="text-xs uppercase tracking-widest opacity-50 stat-label">{label}</div>
        <div
          className="font-black font-mono text-lg leading-tight"
          style={{ color, textShadow: glow ? `0 0 8px ${glow}` : 'none' }}
        >
          {value}
        </div>
        {sub && <div className="text-xs opacity-40 stat-label">{sub}</div>}
      </div>
    </motion.div>
  );
}

interface StatsRowProps {
  luck: number;
  streak: number;
  questsCompleted?: number;
}

export function StatsRow({ luck, streak, questsCompleted = 0 }: StatsRowProps) {
  const mult = luckMultiplier(luck);
  return (
    <div className="flex flex-wrap gap-3">
      <StatChip
        label="Luck"
        value={luck}
        icon="🎲"
        color="#ffd700"
        glow="#ff8c00"
        sub={`×${mult.toFixed(2)} XP`}
        delay={0.5}
      />
      <StatChip
        label="Streak"
        value={`${streak}d`}
        icon="🔥"
        color="#ff6b6b"
        glow="#ff0055"
        delay={0.6}
      />
      <StatChip
        label="Quests"
        value={questsCompleted}
        icon="⚔"
        color="#69ff96"
        glow="#00c853"
        sub="Completed"
        delay={0.7}
      />
    </div>
  );
}
