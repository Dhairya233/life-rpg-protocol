'use client';
// components/QuestCard.tsx — Quest Board Card

import { motion } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import type { Quest, UserQuest } from '@/types/rpg';
import { DIFFICULTY_COLORS, SKILL_TYPE_LABELS } from '@/types/rpg';
import { Clock, Zap, Shield } from 'lucide-react';

interface QuestCardProps {
  quest: Quest;
  userQuest?: UserQuest | null;
  onClick?: () => void;
  index?: number;
}

export default function QuestCard({ quest, userQuest, onClick, index = 0 }: QuestCardProps) {
  const { isClassic } = useTheme();
  const diffColor = DIFFICULTY_COLORS[quest.difficulty];
  const skill = SKILL_TYPE_LABELS[quest.skill_type];
  const status = userQuest?.status;

  return (
    <motion.div
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden transition-all hover:border-slate-700 hover:-translate-y-1 cursor-pointer"
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Skill Type Icon */}
      <div className="flex flex-row items-center gap-4 w-full md:w-auto flex-1">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${diffColor}15` }}>
          <span className="text-2xl">{skill.emoji}</span>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-row items-center gap-2">
            <h3 className="text-slate-200 font-bold text-lg m-0 leading-tight truncate">{quest.title}</h3>
            {status && (
              <span className="status-dot" data-status={status} />
            )}
          </div>

          {quest.description && (
            <p className="text-slate-400 text-sm m-0 line-clamp-2 leading-relaxed">{quest.description}</p>
          )}

          {/* Meta Row */}
          <div className="flex flex-row items-center gap-3 flex-wrap mt-1">
            <span className="text-xs px-2 py-1 rounded-md font-bold uppercase tracking-wider" style={{ background: diffColor, color: quest.difficulty === 'hard' ? '#fff' : '#000' }}>
              {quest.difficulty}
            </span>
            <span className="flex items-center gap-1 text-xs font-mono text-slate-400"><Zap size={12} /> +{quest.xp_reward} XP</span>
            <span className="flex items-center gap-1 text-xs font-mono text-slate-400"><Shield size={12} /> +{quest.aura_reward}</span>
            <span className="flex items-center gap-1 text-xs font-mono text-slate-400"><Clock size={12} /> {quest.duration_minutes}m</span>
          </div>
        </div>
      </div>

      {/* Proof indicator */}
      {quest.requires_proof && (
        <div className="proof-tag">📸</div>
      )}

      <style jsx>{`
        .status-dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }
        .status-dot[data-status="active"] { background: #4af7ff; box-shadow: 0 0 6px #4af7ff66; }
        .status-dot[data-status="pending_verification"] { background: #ffd700; box-shadow: 0 0 6px #ffd70066; }
        .status-dot[data-status="completed"] { background: #69ff96; box-shadow: 0 0 6px #69ff9666; }
        .status-dot[data-status="completed_critical"] { background: #ffd700; box-shadow: 0 0 10px #ffd700; }
        .status-dot[data-status="failed"] { background: #ff3355; box-shadow: 0 0 6px #ff335566; }
        
        .proof-tag {
          position: absolute; top: 12px; right: 12px;
          font-size: 0.85rem; opacity: 0.5;
        }
      `}</style>
    </motion.div>
  );
}
