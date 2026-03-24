'use client';
// hooks/useJuryQueue.ts

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { UserQuest, Quest, Profile } from '@/types/rpg';

export interface PendingVerificationItem {
  userQuest: UserQuest;
  quest: Quest;
  submitter: Profile; // Need to know who submitted it (or maybe keep it anonymous? Let's show username to build community)
}

export function useJuryQueue() {
  const [queue, setQueue] = useState<PendingVerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ourAura, setOurAura] = useState(0);

  useEffect(() => {
    let unmounted = false;
    let subscription: ReturnType<typeof supabase.channel> | null = null;

    async function fetchQueue() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get our own aura for vote weight
      const { data: profile } = await supabase
        .from('profiles')
        .select('aura')
        .eq('id', user.id)
        .single();
        
      if (profile && !unmounted) setOurAura(profile.aura);

      // Fetch pending user_quests, excluding our own
      const { data: pendingUq, error: uqError } = await supabase
        .from('user_quests')
        .select(`
          *,
          quests (*),
          profiles:user_id (id, username, level, aura)
        `)
        .eq('status', 'pending_verification')
        .neq('user_id', user.id)
        .order('proof_submitted_at', { ascending: true }); // Oldest first

      if (uqError || !pendingUq) {
        console.error('Error fetching jury queue:', uqError);
        setLoading(false);
        return;
      }

      // We also only want ones we haven't voted on yet.
      const { data: ourVotes } = await supabase
        .from('jury_votes')
        .select('user_quest_id')
        .eq('juror_id', user.id);

      const votedUqIds = new Set(ourVotes?.map(v => v.user_quest_id) || []);

      const filtered = pendingUq
        .filter(row => !votedUqIds.has(row.id))
        .map(row => ({
          userQuest: {
            ...row,
            quests: undefined,
            profiles: undefined
          } as UserQuest,
          quest: row.quests as any as Quest,
          submitter: row.profiles as any as Profile
        }));

      if (!unmounted) {
        setQueue(filtered);
        setLoading(false);
      }
    }

    fetchQueue();

    // Subscribe to new pending verifications
    subscription = supabase
      .channel('jury_queue')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_quests',
        filter: "status=eq.pending_verification"
      }, () => {
        // Refetch on updates
        fetchQueue();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_quests',
        // if status changes from pending_verification to completed/failed, remove it
      }, (payload) => {
        if (payload.new.status !== 'pending_verification') {
          setQueue(prev => prev.filter(item => item.userQuest.id !== payload.new.id));
        }
      })
      .subscribe();

    return () => {
      unmounted = true;
      if (subscription) supabase.removeChannel(subscription);
    };
  }, []);

  // Removed voted items optimistically
  const removeFromQueue = (userQuestId: string) => {
    setQueue(prev => prev.filter(item => item.userQuest.id !== userQuestId));
  };

  return { queue, loading, ourAura, removeFromQueue };
}
