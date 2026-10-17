// lib/supabase.ts
// Browser-side singleton Supabase client + auth helpers
// Following SYSTEM_DESIGN.md v1.2 schema conventions

import { createBrowserClient } from '@supabase/ssr';
import type { Profile, Quest, UserQuest, QuestStatus } from '@/types/rpg';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    '[Life-RPG] Missing Supabase env vars.\n' +
    'Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local'
  );
}

// Singleton — reuse across the app
export const supabase = createBrowserClient(supabaseUrl, supabaseAnon);

// Re-export types for convenience
export type { Profile, Quest, UserQuest, QuestStatus };

// ── AUTH HELPERS ────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return { error: null };
}

export async function signUp(
  email: string,
  password: string,
  username: string
): Promise<{ error: string | null; needsConfirmation: boolean }> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username.trim().toLowerCase().replace(/\s+/g, '_'),
      },
    },
  });
  if (error) return { error: error.message, needsConfirmation: false };
  return { error: null, needsConfirmation: true };
}

export async function signOut(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut();
  if (error) return { error: error.message };
  return { error: null };
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── PROFILE HELPERS ────────────────────────────────────────

export async function fetchMyProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('[Life-RPG] fetchMyProfile error:', error.message);
    return null;
  }
  return data as Profile;
}

// ── AURA HELPERS ───────────────────────────────────────────

export async function deductAura(
  userId: string,
  amount: number,
  reason: string = 'focus_violation'
): Promise<number | null> {
  const { data, error } = await supabase.rpc('deduct_aura', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) {
    console.error('[Life-RPG] deductAura error:', error.message);
    return null;
  }
  return data as number;
}

// ── QUEST HELPERS ──────────────────────────────────────────

export async function fetchQuests(): Promise<Quest[]> {
  const { data, error } = await supabase
    .from('quests')
    .select('*')
    .order('difficulty', { ascending: true });

  if (error) {
    console.error('[Life-RPG] fetchQuests error:', error.message);
    return [];
  }
  return data as Quest[];
}

export async function startQuest(
  userId: string,
  questId: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc('start_quest', {
    p_user_id: userId,
    p_quest_id: questId,
  });
  if (error) {
    console.error('[Life-RPG] startQuest error:', error.message);
    return null;
  }
  return data as string;
}

export async function submitQuestProof(
  userQuestId: string,
  proofUrl: string,
  note?: string
): Promise<boolean> {
  const { error } = await supabase.rpc('submit_quest_proof', {
    p_user_quest_id: userQuestId,
    p_proof_url: proofUrl,
    p_note: note ?? null,
  });
  if (error) {
    console.error('[Life-RPG] submitQuestProof error:', error.message);
    return false;
  }
  return true;
}

export async function fetchMyQuests(): Promise<(UserQuest & { quest: Quest })[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('user_quests')
    .select('*, quest:quests(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Life-RPG] fetchMyQuests error:', error.message);
    return [];
  }
  return data as (UserQuest & { quest: Quest })[];
}
