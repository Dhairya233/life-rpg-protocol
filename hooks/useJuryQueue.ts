'use client';
// hooks/useJuryQueue.ts
// ============================================================
// The list of submissions the logged-in user may judge.
//
// The list comes from the database function get_jury_queue(), which
// already removes your own submissions, ones you voted on, and returns
// an empty list if you have too little Aura. The browser cannot read
// other players' quest rows directly any more, so there is no live
// subscription: we simply ask again every 20 seconds.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { JURY_MIN_AURA } from '@/lib/rpg-engine';
import type { QuestDifficulty, SkillType } from '@/types/rpg';

export interface PendingVerificationItem {
  userQuestId: string;
  title: string;
  description: string | null;
  difficulty: QuestDifficulty;
  skillType: SkillType;
  xpReward: number;
  auraReward: number;
  submitterUsername: string;
  submitterLevel: number;
  hasProof: boolean;
}

const REFRESH_MS = 20_000;

export function useJuryQueue() {
  const [queue, setQueue] = useState<PendingVerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ourAura, setOurAura] = useState(0);

  const fetchQueue = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Your own Aura is your vote weight (you may read your own profile).
    const { data: profile } = await supabase.from('profiles').select('aura').eq('id', user.id).single();
    if (profile) setOurAura(profile.aura);

    const { data, error } = await supabase.rpc('get_jury_queue');
    if (error) {
      console.error('[Life-RPG] get_jury_queue error:', error.message);
      setLoading(false);
      return;
    }

    setQueue((data ?? []).map((row: any): PendingVerificationItem => ({
      userQuestId: row.user_quest_id,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      skillType: row.skill_type,
      xpReward: row.xp_reward,
      auraReward: row.aura_reward,
      submitterUsername: row.submitter_username,
      submitterLevel: row.submitter_level,
      hasProof: row.has_proof,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQueue();
    const timer = setInterval(fetchQueue, REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchQueue]);

  // After voting, hide the card straight away (the next refresh confirms it).
  const removeFromQueue = (userQuestId: string) => {
    setQueue(prev => prev.filter(item => item.userQuestId !== userQuestId));
  };

  const canJudge = ourAura >= JURY_MIN_AURA;

  return { queue, loading, ourAura, canJudge, removeFromQueue };
}
