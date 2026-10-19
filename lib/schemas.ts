// lib/schemas.ts
// ============================================================
// Every shape of data the server accepts from a browser, in one file.
// (zod = "describe the allowed shape; reject everything else".)
// The database enforces the same limits again — two locks on one door.
//
// This file imports only zod, so it can also be unit-tested directly.
// ============================================================
import { z } from 'zod';

export const SKILL_TYPES = ['focus', 'coding', 'fitness', 'creative'] as const;
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'legendary'] as const;

const uuid = z.string().uuid();

// ── Admin: create or edit a global quest ─────────────────────
export const questFormSchema = z.object({
  id: uuid.optional(),                       // present = edit, absent = create
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  skill_type: z.enum(SKILL_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  xp_reward: z.number().int().min(0).max(3000),
  duration_minutes: z.number().int().min(1).max(720),
});
export type QuestForm = z.infer<typeof questFormSchema>;

export const deleteQuestSchema = z.object({ id: uuid });

// ── Admin: court + player ledger ─────────────────────────────
export const courtDecisionSchema = z.object({
  userQuestId: uuid,
  action: z.enum(['approve', 'reject', 'penalize']),
});

// Note: there is deliberately NO "role" field. Roles are never editable
// through the app.
export const playerUpdateSchema = z.object({
  userId: uuid,
  xp: z.number().int().min(0).max(10_000_000),
  aura: z.number().int().min(0).max(100_000),
  isBanned: z.boolean(),
});

// ── AI quest suggestions ─────────────────────────────────────
export const planRequestSchema = z.object({
  entry: z.string().trim().min(1).max(2000),
});

// The model's answer is untrusted text, so it is validated too. Values are
// clamped to the same limits the database enforces for private quests.
export const aiQuestSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300),
  skill_type: z.enum(SKILL_TYPES),
  xp_reward: z.number().int().min(10).max(200),
  duration_minutes: z.number().int().min(5).max(180),
});
export const aiQuestListSchema = z.array(aiQuestSchema).min(1).max(3);
export type AiQuest = z.infer<typeof aiQuestSchema>;

// ── Daily discovery ──────────────────────────────────────────
export const discoverySchema = z.object({
  imageRef: z.string().trim().min(1).max(500),
});
