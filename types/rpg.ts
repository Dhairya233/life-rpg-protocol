// types/rpg.ts

export type QuestDifficulty = 'easy' | 'medium' | 'hard' | 'legendary';
export type SkillType = 'focus' | 'coding' | 'fitness' | 'creative';
export type QuestStatus = 'idle' | 'active' | 'pending_verification' | 'completed' | 'completed_critical' | 'failed';

export interface Profile {
  id: string;
  username: string;
  aura: number;
  xp: number;
  level: number;
  luck: number;
  role?: 'user' | 'admin';
  is_banned?: boolean;
  theme: 'classic' | 'modern';
  streak_days: number;
  last_active: string | null;
  created_at: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string | null;
  difficulty: QuestDifficulty;
  skill_type: SkillType;
  xp_reward: number;
  aura_reward: number;
  duration_minutes: number;
  requires_proof: boolean;
  created_at: string;
}

export interface UserQuest {
  id: string;
  user_id: string;
  quest_id: string;
  status: QuestStatus;
  proof_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  aura_penalty: number;
  jury_verdict: number | null;
  created_at: string;
}

export interface JuryVote {
  id: string;
  user_quest_id: string;
  juror_id: string;
  vote: boolean;
  juror_aura_snapshot: number;
  created_at: string;
}

export interface AuraLogEntry {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  created_at: string;
}

/** AuraRing visual state derived from aura value */
export interface AuraRingState {
  color: string;
  pulseSpeed: number;
}

/** Difficulty badge colors */
export const DIFFICULTY_COLORS: Record<QuestDifficulty, string> = {
  easy: '#39ff6b',
  medium: '#4af7ff',
  hard: '#9b59ff',
  legendary: '#ffd700',
};

/** Skill type icons/labels */
export const SKILL_TYPE_LABELS: Record<SkillType, { label: string; emoji: string }> = {
  focus: { label: 'Focus', emoji: '🎯' },
  coding: { label: 'Coding', emoji: '💻' },
  fitness: { label: 'Fitness', emoji: '💪' },
  creative: { label: 'Creative', emoji: '🎨' },
};
