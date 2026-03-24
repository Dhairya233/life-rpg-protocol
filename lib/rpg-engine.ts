// lib/rpg-engine.ts
// ============================================================
// THE LIFE-RPG PROTOCOL — Core Leveling Engine
// Mirrors the SQL calculate_level() function exactly.
// ============================================================

/**
 * Logarithmic leveling function.
 * Level = floor(log₁.₅((xp / 100) + 1)) + 1
 *
 * Milestones:
 *   Level  1 →        0 XP
 *   Level  5 →      756 XP
 *   Level 10 →    5,766 XP
 *   Level 20 →   43,923 XP
 *   Level 50 → 2,400,000 XP
 */
export function calculateLevel(xp: number): number {
  if (xp <= 0) return 1;
  return Math.max(1, Math.floor(Math.log(xp / 100 + 1) / Math.log(1.5)) + 1);
}

/**
 * Returns the minimum XP required to reach a given level.
 * Inverse of calculateLevel.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round((Math.pow(1.5, level - 1) - 1) * 100);
}

/**
 * Progress (0–1) within the current level band.
 * Used to fill the XP progress bar.
 */
export function levelProgress(xp: number): number {
  const currentLevel = calculateLevel(xp);
  const currentFloor = xpForLevel(currentLevel);
  const nextFloor    = xpForLevel(currentLevel + 1);
  if (nextFloor === currentFloor) return 1;
  return (xp - currentFloor) / (nextFloor - currentFloor);
}

/**
 * XP needed to reach the next level from current XP.
 */
export function xpToNextLevel(xp: number): number {
  const nextLevel = calculateLevel(xp) + 1;
  return xpForLevel(nextLevel) - xp;
}

/**
 * Aura is a 0–1000 reputation score.
 * Returns a descriptive rank label.
 */
export function auraRank(aura: number): string {
  if (aura >= 900) return 'Mythic';
  if (aura >= 750) return 'Legendary';
  if (aura >= 600) return 'Epic';
  if (aura >= 450) return 'Rare';
  if (aura >= 300) return 'Uncommon';
  if (aura >= 150) return 'Common';
  return 'Unranked';
}

/**
 * Aura ring color stops based on rank.
 * Returns [innerColor, outerGlowColor]
 */
export function auraColors(aura: number): [string, string] {
  if (aura >= 900) return ['#ff6b6b', '#ff0055'];   // Mythic — blood red
  if (aura >= 750) return ['#ffd700', '#ff8c00'];   // Legendary — gold
  if (aura >= 600) return ['#b47aff', '#6e00ff'];   // Epic — deep purple
  if (aura >= 450) return ['#4af7ff', '#007bff'];   // Rare — electric blue
  if (aura >= 300) return ['#69ff96', '#00c853'];   // Uncommon — neon green
  if (aura >= 150) return ['#c0c0c0', '#808080'];   // Common — silver
  return              ['#5a5a5a', '#2a2a2a'];        // Unranked — dim
}

/**
 * Luck modifier: returns a multiplier between 0.5 and 2.0
 * Luck 0 → 0.5x, Luck 50 → 1.0x, Luck 100 → 2.0x
 */
export function luckMultiplier(luck: number): number {
  return 0.5 + (luck / 100) * 1.5;
}

// Skill config (used by skill tree UI) — SYSTEM_DESIGN v1.2 naming
export const SKILL_CONFIG = {
  focus: {
    label:    'Focus',
    icon:     '🎯',
    color:    '#4af7ff',
    glow:     '#007bff',
    desc:     'Deep work · Concentration · Discipline',
  },
  coding: {
    label:    'Coding',
    icon:     '💻',
    color:    '#69ff96',
    glow:     '#00c853',
    desc:     'Development · Engineering · Tech',
  },
  fitness: {
    label:    'Fitness',
    icon:     '💪',
    color:    '#ff6b6b',
    glow:     '#ff0055',
    desc:     'Health · Training · Recovery',
  },
  creative: {
    label:    'Creative',
    icon:     '🎨',
    color:    '#ffd700',
    glow:     '#ff8c00',
    desc:     'Art · Writing · Design',
  },
} as const;

export type SkillType = keyof typeof SKILL_CONFIG;

// Backward compat alias
export const BRANCH_CONFIG = SKILL_CONFIG;
export type SkillBranch = SkillType;
