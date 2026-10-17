// hooks/useAuraLog.ts
// Fetches the user's aura change history for timeline display

'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AuraLogEntry } from '@/types/rpg';

interface UseAuraLogReturn {
  entries: AuraLogEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAuraLog(limit: number = 20): UseAuraLogReturn {
  const [entries, setEntries] = useState<AuraLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLog = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('aura_log')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setEntries(data as AuraLogEntry[]);
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  return { entries, loading, error, refetch: fetchLog };
}
