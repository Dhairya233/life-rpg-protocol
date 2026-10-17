import { useState, useEffect } from 'react';

export function useDailyLuck() {
  const [dailyLuck, setDailyLuck] = useState<number | null>(null);
  const [isGrindDay, setIsGrindDay] = useState(false);
  const [hasRolledToday, setHasRolledToday] = useState<boolean>(true); // assume true first to avoid pop-in
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkLuck() {
      try {
        const res = await fetch('/api/luck/check', { method: 'GET' });
        const data = await res.json();
        if (data.success) {
          if (data.rolled) {
            setDailyLuck(data.luck_value);
            setIsGrindDay(data.is_grind_day);
            setHasRolledToday(true);
          } else {
            setHasRolledToday(false);
          }
        }
      } catch (e) {
        console.error("Failed to check daily luck", e);
      } finally {
        setLoading(false);
      }
    }
    
    checkLuck();
  }, []);

  const rollLuck = async () => {
    try {
      const res = await fetch('/api/luck/daily', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setDailyLuck(data.luck_value);
        setIsGrindDay(data.is_grind_day);
        // Do NOT setHasRolledToday(true) here, let the UI trigger it
        return data as { luck_value: number; is_grind_day: boolean };
      }
    } catch (e) {
      console.error("Failed to roll luck", e);
    }
    return null;
  };

  return { dailyLuck, isGrindDay, hasRolledToday, loading, rollLuck, setHasRolledToday };
}
