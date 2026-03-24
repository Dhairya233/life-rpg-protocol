'use client';
// components/SkillTree.tsx
// ============================================================
// Three-branched Skill Tree: Silicon | Vitality | Influence
// ============================================================

import { motion } from 'framer-motion';
import { calculateLevel, levelProgress, BRANCH_CONFIG, SkillBranch } from '@/lib/rpg-engine';
import { useTheme } from '@/context/ThemeContext';

interface BranchProps {
  branch: SkillBranch;
  xp: number;
  index: number;
}

function SkillNode({ filled, color, glow, delay }: { filled: boolean; color: string; glow: string; delay: number }) {
  return (
    <motion.div
      className="w-3 h-3 rounded-full border"
      style={{
        borderColor: color,
        backgroundColor: filled ? color : 'transparent',
        boxShadow: filled ? `0 0 6px ${glow}, 0 0 12px ${glow}55` : 'none',
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay, type: 'spring', stiffness: 400 }}
    />
  );
}

function BranchCard({ branch, xp, index }: BranchProps) {
  const { isClassic } = useTheme();
  const cfg = BRANCH_CONFIG[branch];
  const level = calculateLevel(xp);
  const progress = levelProgress(xp);

  // Show up to 10 nodes, filled = achieved milestones every 2 levels
  const nodes = Array.from({ length: 10 }, (_, i) => i * 2 < level);

  return (
    <motion.div
      className="branch-card flex-1 rounded-2xl p-5 space-y-4 relative overflow-hidden"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.12 + 0.4, duration: 0.5 }}
    >
      {/* Background glow blob */}
      <div
        className="absolute -top-8 -right-8 w-28 h-28 rounded-full blur-2xl opacity-20 pointer-events-none"
        style={{ backgroundColor: cfg.color }}
      />

      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="text-2xl"
          style={{ color: cfg.color, textShadow: isClassic ? `0 0 8px ${cfg.glow}` : 'none' }}
        >
          {cfg.icon}
        </span>
        <div>
          <h3
            className="font-black text-sm uppercase tracking-widest"
            style={{ color: cfg.color }}
          >
            {cfg.label}
          </h3>
          <p className="text-xs opacity-40 branch-desc">{cfg.desc}</p>
        </div>
        <div className="ml-auto text-right">
          <div
            className="font-mono font-black text-xl"
            style={{ color: cfg.color, textShadow: isClassic ? `0 0 6px ${cfg.glow}` : 'none' }}
          >
            {level}
          </div>
          <div className="text-xs opacity-40 branch-desc">LVL</div>
        </div>
      </div>

      {/* Skill nodes (mini-tree visual) */}
      <div className="flex items-center gap-1.5">
        {nodes.map((filled, i) => (
          <SkillNode
            key={i}
            filled={filled}
            color={cfg.color}
            glow={cfg.glow}
            delay={index * 0.1 + i * 0.06 + 0.5}
          />
        ))}
        {/* Connecting line */}
        <div className="flex-1 h-px opacity-20" style={{ backgroundColor: cfg.color }} />
      </div>

      {/* Mini XP bar */}
      <div className="space-y-1">
        <div className="relative h-1.5 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ backgroundColor: cfg.color, boxShadow: `0 0 6px ${cfg.glow}` }}
            initial={{ width: '0%' }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: index * 0.1 + 0.6 }}
          />
        </div>
        <div className="flex justify-between text-xs font-mono opacity-30 branch-desc">
          <span>{xp.toLocaleString()} XP</span>
        </div>
      </div>
    </motion.div>
  );
}

interface SkillTreeProps {
  focusXp?:    number;
  codingXp?:   number;
  fitnessXp?:  number;
  creativeXp?: number;
}

export default function SkillTree({
  focusXp = 0,
  codingXp = 0,
  fitnessXp = 0,
  creativeXp = 0,
}: SkillTreeProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-[0.25em] opacity-40 section-label font-semibold">
        Skill Branches
      </h2>
      <div className="flex gap-3 flex-col sm:flex-row flex-wrap">
        <BranchCard branch="focus"    xp={focusXp}    index={0} />
        <BranchCard branch="coding"   xp={codingXp}   index={1} />
        <BranchCard branch="fitness"  xp={fitnessXp}  index={2} />
        <BranchCard branch="creative" xp={creativeXp} index={3} />
      </div>
    </div>
  );
}
