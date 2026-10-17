// hooks/useQuests.ts
// Fetches quests and user's active quest data

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Quest, UserQuest, SkillType, QuestDifficulty } from '@/types/rpg';

interface UseQuestsReturn {
  quests: Quest[];
  myQuests: (UserQuest & { quest: Quest })[];
  activeQuest: (UserQuest & { quest: Quest }) | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseQuestsOptions {
  skillType?: SkillType;
  difficulty?: QuestDifficulty;
}

/** Deduplicate an array by a string key — prevents StrictMode / concurrent-fetch doubles */
function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  return Array.from(new Map(arr.map(item => [item.id, item])).values());
}

export function useQuests(options?: UseQuestsOptions): UseQuestsReturn {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [myQuests, setMyQuests] = useState<(UserQuest & { quest: Quest })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guard against stale updates from concurrent / StrictMode double-invoked fetches
  const fetchCountRef = useRef(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Track which invocation this is — only the latest one may write state
    const currentFetch = ++fetchCountRef.current;

    // Fetch quest templates
    let query = supabase.from('quests').select('*');
    if (options?.skillType) query = query.eq('skill_type', options.skillType);
    if (options?.difficulty) query = query.eq('difficulty', options.difficulty);
    query = query.order('difficulty', { ascending: true });

    const { data: questData, error: questError } = await query;

    // Bail if a newer fetch has already started
    if (currentFetch !== fetchCountRef.current) return;

    if (questError) {
      setError(questError.message);
      setLoading(false);
      return;
    }

    // Deduplicate by id before writing to state
    setQuests(dedupeById((questData ?? []) as Quest[]));

    // Fetch user's active quests
    const { data: { user } } = await supabase.auth.getUser();
    if (currentFetch !== fetchCountRef.current) return;

    if (user) {
      const { data: userQuestData } = await supabase
        .from('user_quests')
        .select('*, quest:quests(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (currentFetch !== fetchCountRef.current) return;

      if (userQuestData) {
        setMyQuests(dedupeById((userQuestData as (UserQuest & { quest: Quest })[])));
      }
    }

    setLoading(false);
  }, [options?.skillType, options?.difficulty]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeQuest = myQuests.find(q => q.status === 'active') ?? null;

  return { quests, myQuests, activeQuest, loading, error, refetch: fetchData };
}
