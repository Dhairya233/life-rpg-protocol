// hooks/useProfile.ts
// Fetches current user profile with Supabase Realtime subscription

'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/rpg';

interface UseProfileReturn {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useProfile(): UseProfileReturn {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      setError('Not authenticated');
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setProfile(data as Profile);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile();

    // Realtime subscription — live updates when profile changes
    const channel = supabase
      .channel('my-profile')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
      }, (payload) => {
        // Only update if it's our own profile
        setProfile((current) => {
          if (current && payload.new.id === current.id) {
            return payload.new as Profile;
          }
          return current;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProfile]);

  return { profile, loading, error, refetch: fetchProfile };
}
