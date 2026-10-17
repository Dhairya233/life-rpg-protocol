'use client';
// hooks/useFocusMonitor.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import { FocusMonitor } from '@/lib/focus-monitor';

interface UseFocusMonitorReturn {
  isViolated: boolean;
  violationCount: number;
}

export function useFocusMonitor(onPenalty: () => void): UseFocusMonitorReturn {
  const [isViolated, setIsViolated] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  
  // Use ref to keep latest callback without recreating monitor
  const penaltyRef = useRef(onPenalty);
  useEffect(() => {
    penaltyRef.current = onPenalty;
  }, [onPenalty]);

  useEffect(() => {
    const monitor = new FocusMonitor(
      () => penaltyRef.current(),
      (count, active) => {
        setViolationCount(count);
        setIsViolated(active);
      }
    );

    monitor.start();

    return () => {
      monitor.stop();
    };
  }, []);

  return { isViolated, violationCount };
}
